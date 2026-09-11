/**
 * Полная очистка учётной записи.
 *
 * Один путь для двух случаев: человек удаляет аккаунт сам (deleteAccount) и
 * аккаунт удаляется по сроку — три года без входа (enforceRetention). Второй
 * копии этой логики быть не должно: именно так прежний deleteAccount и
 * разошёлся с Политикой — аватар в Cloudinary, FCM-токены, личка, каналы,
 * жалобы, шагомер и присутствие оставались после «удаления».
 *
 * Правила — по Политике конфиденциальности 5.2 (раздел 9.2) и приложению 1 к
 * Политике обработки персональных данных:
 * - тексты сообщений и комментарии обезличиваются (автор → «Deleted»);
 * - медиафайлы, отправленные человеком, удаляются: голос и изображение
 *   подписью не обезличить (решение Ориона 2026-09-11);
 * - то, что относится только к этому человеку, удаляется целиком;
 * - журнал согласий обезличивается и доживает свой срок (п. 7 ст. 5 Закона).
 *
 * Группы Android-приложения (`groups`, `group_invites`) не трогаются: их схема
 * живёт в репозитории Дениса — очистку групп делать на его стороне.
 *
 * `dryRun` только считает и ничего не меняет — так работает enforceRetention,
 * пока не выставлен RETENTION_APPLY.
 *
 * Очистку можно запускать повторно: каждый шаг сначала проверяет, что есть что
 * удалять. Учётная запись в Auth удаляется последней — пока она существует,
 * недоделанную очистку можно повторить.
 */
import * as admin from "firebase-admin";
import {
    FieldValue,
    type DocumentData,
    type DocumentReference,
    type QuerySnapshot,
} from "firebase-admin/firestore";
import { v2 as cloudinary } from "cloudinary";
import { anonymizeConsentsOnDelete } from "./consents";
import { clearMapCache } from "./mapCache";

const db = () => admin.firestore();

const RTDB_URL = "https://protomap-1e1db-default-rtdb.europe-west1.firebasedatabase.app";
const DELETED = "Deleted";
const BATCH_LIMIT = 400;

/**
 * Папки Storage, куда пользователи загружают своё. Стикеры и новости — общие
 * ресурсы, их очистка аккаунта не трогает никогда.
 */
const USER_MEDIA_PREFIXES = [
    "chat_media/",
    "channel_media/",
    "group_media/",
    "channel_avatars/",
    "group_avatars/",
];

export type PurgeReport = Record<string, number>;

/** Пачки записей по 400 — у Firestore предел 500 на batch. */
class Writes {
    private batch = db().batch();
    private pending = 0;

    constructor(private readonly dry: boolean) {}

    async update(ref: DocumentReference, data: DocumentData): Promise<void> {
        if (this.dry) return;
        this.batch.update(ref, data);
        await this.bump();
    }

    async delete(ref: DocumentReference): Promise<void> {
        if (this.dry) return;
        this.batch.delete(ref);
        await this.bump();
    }

    async flush(): Promise<void> {
        if (this.dry || this.pending === 0) return;
        await this.batch.commit();
        this.batch = db().batch();
        this.pending = 0;
    }

    private async bump(): Promise<void> {
        this.pending++;
        if (this.pending >= BATCH_LIMIT) await this.flush();
    }
}

/**
 * Файл в Storage по ссылке из сообщения. Только наш бакет и только папки
 * с пользовательскими загрузками — всё остальное возвращает null.
 */
function userMediaFile(value: unknown): string | null {
    let url: string | null = null;
    if (typeof value === "string") url = value;
    else if (value && typeof value === "object") {
        const inner = (value as { url?: unknown }).url;
        if (typeof inner === "string") url = inner;
    }
    if (!url) return null;

    const m = url.match(/^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/([^/]+)\/o\/([^?#]+)/);
    if (!m || !m[1].startsWith("protomap-1e1db")) return null;

    const path = decodeURIComponent(m[2]);
    if (!USER_MEDIA_PREFIXES.some((p) => path.startsWith(p))) return null;
    return `${m[1]}/${path}`;
}

function hasText(v: unknown): boolean {
    return typeof v === "string" && v.trim().length > 0;
}

function configureCloudinary(): boolean {
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
        console.warn("[purge] Cloudinary не настроен — аватар не удалён");
        return false;
    }
    cloudinary.config({
        cloud_name: CLOUDINARY_CLOUD_NAME,
        api_key: CLOUDINARY_API_KEY,
        api_secret: CLOUDINARY_API_SECRET,
        secure: true,
    });
    return true;
}

/**
 * Сообщения или посты удаляемого автора: текст остаётся с автором «Deleted»,
 * медиафайл удаляется. Сообщение без текста помечается удалённым — тем же
 * флагом, которым человек удаляет сообщение сам.
 *
 * Пересланное медиа не трогается: файл принадлежит тому, кто отправил его
 * первым, и удаление ударило бы по чужому сообщению.
 */
async function scrubMessages(
    snap: QuerySnapshot,
    w: Writes,
    media: Set<string>,
    count: (key: string, n?: number) => void,
    label: string
): Promise<void> {
    for (const d of snap.docs) {
        const m = d.data();
        const file = m.forward_info ? null : userMediaFile(m.media_url);
        if (file) media.add(file);

        const patch: DocumentData = { author_uid: null, author_username: DELETED };
        if (file) patch.media_url = null;
        if (file && !hasText(m.text)) patch.is_deleted = true;
        // У поста владелец канала продублирован в owner_uid
        if (m.owner_uid !== undefined && m.owner_uid === m.author_uid) patch.owner_uid = null;

        await w.update(d.ref, patch);
        count(label);
    }
}

export async function purgeAccount(uid: string, opts: { dryRun: boolean }): Promise<PurgeReport> {
    const dry = opts.dryRun;
    const report: PurgeReport = {};
    const count = (key: string, n = 1) => {
        if (n > 0) report[key] = (report[key] ?? 0) + n;
    };
    const w = new Writes(dry);
    const media = new Set<string>();

    const userRef = db().collection("users").doc(uid);
    const userSnap = await userRef.get();
    const user = userSnap.data() ?? {};

    // ── Личка ─────────────────────────────────────────────────────────────
    // Поиск по participantIds, а не collectionGroup по автору: для последнего
    // нужен отдельный индекс коллекционной группы, а этот запрос обходится
    // встроенным.
    const chats = await db().collection("chats").where("participantIds", "array-contains", uid).get();
    for (const chat of chats.docs) {
        const c = chat.data();
        const ids: string[] = Array.isArray(c.participantIds) ? c.participantIds : [];

        if (ids.every((id) => id === uid)) {
            // «Избранное» — чат с самим собой. Чужих данных там нет,
            // удаляется целиком; пересланные файлы при этом остаются владельцам.
            const all = await chat.ref.collection("messages").get();
            for (const m of all.docs) {
                const file = m.data().forward_info ? null : userMediaFile(m.data().media_url);
                if (file) media.add(file);
            }
            count("личка: «Избранное» удалено");
            if (!dry) await db().recursiveDelete(chat.ref);
            continue;
        }

        const mine = await chat.ref.collection("messages").where("author_uid", "==", uid).get();
        await scrubMessages(mine, w, media, count, "личка: сообщений обезличено");
        await w.update(chat.ref, {
            [`participants.${uid}`]: { username: DELETED, avatarUrl: null, frameId: null },
            [`unreadCount.${uid}`]: FieldValue.delete(),
            [`typing.${uid}`]: FieldValue.delete(),
        });
        count("личка: чатов затронуто");
    }

    // ── Каналы ────────────────────────────────────────────────────────────
    // Каналов немного — перебор дешевле, чем индекс коллекционной группы posts.
    const channels = await db().collection("channels").get();
    for (const ch of channels.docs) {
        const c = ch.data();
        const posts = await ch.ref.collection("posts").where("author_uid", "==", uid).get();
        await scrubMessages(posts, w, media, count, "каналы: постов обезличено");

        const patch: DocumentData = {};
        if (c.ownerUid === uid) {
            const avatar = userMediaFile(c.avatarUrl);
            if (avatar) {
                media.add(avatar);
                patch.avatarUrl = null;
            }
            patch.ownerUid = null;
            count("каналы: владелец снят");
        }
        if (Array.isArray(c.subscriberUids) && c.subscriberUids.includes(uid)) {
            patch.subscriberUids = FieldValue.arrayRemove(uid);
            patch.subscriberCount = FieldValue.increment(-1);
            count("каналы: подписок снято");
        }
        if (Object.keys(patch).length > 0) await w.update(ch.ref, patch);

        const sub = ch.ref.collection("subscribers").doc(uid);
        if ((await sub.get()).exists) await w.delete(sub);
    }

    // ── Общий чат ─────────────────────────────────────────────────────────
    const globalMsgs = await db().collection("global_chat").where("author_uid", "==", uid).get();
    for (const d of globalMsgs.docs) {
        const m = d.data();
        const image = userMediaFile(m.image);
        const voice = userMediaFile(m.voiceMessage);
        if (image) media.add(image);
        if (voice) media.add(voice);

        if ((image || voice) && !hasText(m.text)) {
            await w.delete(d.ref);
            count("общий чат: медиасообщений удалено");
            continue;
        }
        const patch: DocumentData = {
            author_uid: null,
            author_username: DELETED,
            author_avatar_url: null,
            author_equipped_frame: null,
        };
        if (image) patch.image = null;
        if (voice) patch.voiceMessage = null;
        await w.update(d.ref, patch);
        count("общий чат: сообщений обезличено");
    }

    // ── Комментарии, оставленные человеком на чужих страницах ─────────────
    const comments = await db().collectionGroup("comments").where("author_uid", "==", uid).get();
    for (const d of comments.docs) {
        // Комментарии на его собственной странице уйдут вместе с профилем
        const owner = d.ref.parent.parent;
        if (owner?.id === uid && owner.parent.id === "users") continue;
        await w.update(d.ref, { author_username: DELETED, author_avatar_url: null, author_uid: null });
        count("комментарии: обезличено");
    }

    // ── Жалобы и модерация ────────────────────────────────────────────────
    const filed = await db().collection("reports").where("reporterUid", "==", uid).get();
    for (const d of filed.docs) {
        await w.update(d.ref, { reporterUid: null, reporterUsername: null });
        count("жалобы: автор обезличен");
    }
    const aboutProfile = await db().collection("reports").where("profileOwnerUid", "==", uid).get();
    for (const d of aboutProfile.docs) {
        await w.delete(d.ref);
        count("жалобы на профиль: удалено");
    }
    for (const col of ["moderation_flags", "moderation_queue"]) {
        const snap = await db().collection(col).where("uid", "==", uid).get();
        for (const d of snap.docs) {
            await w.delete(d.ref);
            count(`${col}: удалено`);
        }
    }

    // ── Метки на карте ────────────────────────────────────────────────────
    const locations = await db().collection("locations").where("user_id", "==", uid).get();
    for (const d of locations.docs) {
        await w.delete(d.ref);
        count("метки: удалено");
    }

    // ── Реферальная программа ─────────────────────────────────────────────
    const codes = await db().collection("referral_codes").where("referrerId", "==", uid).get();
    for (const d of codes.docs) {
        await w.delete(d.ref);
        count("реферальные коды: удалено");
    }
    if (user.referralBonusClaimed === true) {
        // Запись «кого пригласил» лежит у пригласившего под id приглашённого;
        // uid пригласившего у нового пользователя не хранится — перебираем.
        const referrers = await db().collection("referrals").get();
        for (const r of referrers.docs) {
            if (r.id === uid) continue;
            const claimed = r.ref.collection("claimed").doc(uid);
            if ((await claimed.get()).exists) {
                await w.delete(claimed);
                count("рефералка: запись о приглашении удалена");
            }
        }
    }

    // ── Документы с id = uid ──────────────────────────────────────────────
    const byId: Array<[string, string]> = [
        ["stepper_leaderboard", "шагомер: рейтинг"],
        ["rate_limits", "лимиты запросов"],
        ["2fa_codes", "коды 2FA"],
        ["2fa_cleared", "отметка о пройденной 2FA"],
    ];
    for (const [col, label] of byId) {
        const ref = db().collection(col).doc(uid);
        if ((await ref.get()).exists) {
            await w.delete(ref);
            count(label);
        }
    }

    // Ключи идемпотентности шагомера: в каждом uid и результат начисления.
    const idem = await db().collection("stepper_idempotency").where("uid", "==", uid).get();
    for (const d of idem.docs) {
        await w.delete(d.ref);
        count("шагомер: ключи идемпотентности");
    }

    await w.flush();

    // ── Удаление вместе с подколлекциями ──────────────────────────────────
    const trees: Array<[DocumentReference, string]> = [
        [db().collection("stepper").doc(uid), "шагомер: статистика и история"],
        [db().collection("referrals").doc(uid), "рефералка: своя запись"],
        // Бета-телеметрия Android: схема Дениса, но это данные удаляемого человека
        [db().collection("mobileapp").doc("beta_stats").collection("users").doc(uid), "бета-телеметрия Android"],
    ];
    for (const [ref, label] of trees) {
        const exists = (await ref.get()).exists || (await ref.listCollections()).length > 0;
        if (!exists) continue;
        count(label);
        if (!dry) await db().recursiveDelete(ref);
    }

    // ── Журнал согласий: обезличить, но сохранить на срок ─────────────────
    if (dry) {
        const n = await db().collection("consents").where("uid", "==", uid).count().get();
        count("согласия: будет обезличено", n.data().count);
    } else {
        count("согласия: обезличено", await anonymizeConsentsOnDelete(uid));
    }

    // ── Файлы в Storage ───────────────────────────────────────────────────
    // После обновления документов: к этому моменту ссылки на файлы уже сняты,
    // и упавшее удаление файла оставит мусор, но не битую ссылку.
    count("медиафайлов в Storage", media.size);
    if (!dry) {
        for (const key of media) {
            const slash = key.indexOf("/");
            const bucket = key.slice(0, slash);
            const path = key.slice(slash + 1);
            try {
                await admin.storage().bucket(bucket).file(path).delete({ ignoreNotFound: true });
            } catch (e) {
                console.error(`[purge] ${uid}: не удалён файл ${path}`, e);
                count("ошибок удаления файлов");
            }
        }
    }

    // ── Аватар в Cloudinary: сайт загружает его под public_id = uid ───────
    if (dry) {
        if (typeof user.avatar_url === "string" && user.avatar_url.includes("res.cloudinary.com")) {
            count("аватар в Cloudinary");
        }
    } else if (configureCloudinary()) {
        try {
            const res = await cloudinary.uploader.destroy(`protomap_avatars/${uid}`, { invalidate: true });
            if (res?.result === "ok") count("аватар в Cloudinary");
        } catch (e) {
            console.error(`[purge] ${uid}: Cloudinary`, e);
            count("ошибок Cloudinary");
        }
    }

    // ── Присутствие ───────────────────────────────────────────────────────
    if (!dry) {
        try {
            await admin.app().database(RTDB_URL).ref(`status/${uid}`).remove();
        } catch (e) {
            console.error(`[purge] ${uid}: RTDB`, e);
            count("ошибок RTDB");
        }
    }

    // ── Профиль вместе с подколлекциями: комментарии на странице, FCM ────
    if (userSnap.exists || (await userRef.listCollections()).length > 0) {
        count("профиль");
        if (!dry) await db().recursiveDelete(userRef);
    }

    if (!dry && (report["метки: удалено"] ?? 0) > 0) await clearMapCache();

    // ── Учётная запись Auth — последней ───────────────────────────────────
    if (dry) {
        count("учётная запись Auth");
    } else {
        try {
            await admin.auth().deleteUser(uid);
            count("учётная запись Auth");
        } catch (e: unknown) {
            if ((e as { code?: string }).code !== "auth/user-not-found") throw e;
        }
    }

    return report;
}
