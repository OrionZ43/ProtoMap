/**
 * Журнал согласий на обработку персональных данных.
 *
 * Пункт 7 статьи 5 Закона Республики Беларусь № 99-З возлагает бремя доказывания
 * наличия согласия на оператора. До появления этого модуля доказывать было нечем:
 * на вебе LegalUpdateBanner писал принятую версию в localStorage, на Android
 * версия хранилась в AppSettings — оба хранилища клиентские и стираются вместе
 * с кэшем.
 *
 * Отсюда три свойства, которые нельзя ослаблять:
 *
 * 1. Запись создаётся только здесь, через Admin SDK. В firestore.rules у
 *    коллекции `consents` стоит `allow write: if false`. Журнал, в который может
 *    писать клиент, не является доказательством.
 * 2. Версию документа определяет сервер, читая `system/licenses`. Клиент не
 *    сообщает, что именно он принял, — иначе он мог бы заявить любую версию.
 * 3. Записи неизменяемы. Отзыв согласия проставляет `revokedAt`, а не удаляет и
 *    не переписывает запись.
 */

import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import { eraseStepData } from "./stepperData";

const db = () => admin.firestore();

/**
 * Виды согласий. Обязательные — чекбоксы экрана регистрации и экрана согласий;
 * `activity_*` — экран шагомера в Android-приложении.
 */
export const CONSENT_IDS = [
    "age_minimum",
    "core_processing",
    "cross_border",
    "activity_data",
    "activity_leaderboard",
    "tos",
] as const;

export type ConsentId = (typeof CONSENT_IDS)[number];

/**
 * Обязательные согласия: без них учётная запись существовать не может.
 * Отзыв любого из них равнозначен отказу от использования Сервиса и влечёт
 * удаление аккаунта — так это и описано в Политике. Поэтому revokeConsent их
 * не отзывает, а отправляет вызывающего в deleteAccount.
 */
const REQUIRED_CONSENTS: ConsentId[] = ["age_minimum", "core_processing", "cross_border", "tos"];

/** Согласия, которые отзываются сами по себе, без последствий для аккаунта. */
const OPTIONAL_CONSENTS: ConsentId[] = ["activity_data", "activity_leaderboard"];

/**
 * Зеркала необязательных согласий в users/{uid}. По ним stepperClaim решает,
 * начислять ли за шаги и выкладывать ли их в рейтинг.
 */
const OPTIONAL_MIRRORS: Partial<Record<ConsentId, string>> = {
    activity_data: "activity_data_consent",
    activity_leaderboard: "activity_leaderboard_consent",
};

/**
 * Отзыв согласия на шагомер отзывает и показ в рейтинге: без данных о шагах
 * показывать нечего, а действующее согласие на то, чего нет, только путает
 * журнал.
 */
const REVOKE_CASCADE: Partial<Record<ConsentId, ConsentId[]>> = {
    activity_data: ["activity_data", "activity_leaderboard"],
};

type Method = "web" | "android";

// ─── Вспомогательное ──────────────────────────────────────────────────────────

/**
 * Версии документов берём из Firestore, а не из аргументов вызова.
 * `system/licenses` — тот же источник, что читает сайт и мобильный клиент.
 */
async function currentDocumentVersions(): Promise<{ privacy: string; tos: string }> {
    const snap = await db().collection("system").doc("licenses").get();
    const data = snap.data() ?? {};
    return {
        privacy: (data.privacy_policy_version as string) ?? "unknown",
        tos: (data.terms_of_service_version as string) ?? "unknown",
    };
}

/** Согласие `tos` привязано к Соглашению, все остальные — к Политике. */
function documentVersionFor(
    consentId: ConsentId,
    versions: { privacy: string; tos: string }
): string {
    return consentId === "tos" ? `tos ${versions.tos}` : `privacy ${versions.privacy}`;
}

function clientIp(request: CallableRequest<unknown>): string {
    const headers = request.rawRequest?.headers;
    if (!headers) return "unknown";
    const forwarded = headers["x-forwarded-for"];
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return first?.toString().split(",")[0].trim() || request.rawRequest?.ip || "unknown";
}

function normalizeMethod(raw: unknown): Method {
    return raw === "android" ? "android" : "web";
}

// ─── Запись согласий ──────────────────────────────────────────────────────────

/**
 * Фиксирует набор согласий, отмеченных пользователем.
 *
 * Вызывается сразу после создания учётной записи — и на регистрации, и при
 * повторном принятии после обновления версии документов.
 *
 * Гард-лестница здесь короче обычной намеренно: `assertEmailVerified` быть НЕ
 * должно. На момент регистрации почта заведомо не подтверждена, и проверка
 * сделала бы запись согласия невозможной ровно тогда, когда она нужна.
 */
export const recordConsents = onCall(async (request) => {
    if (request.app == undefined) {
        throw new HttpsError("failed-precondition", "App Check required.");
    }
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");

    const uid = request.auth.uid;
    const granted: unknown = (request.data as Record<string, unknown>)?.granted;

    if (!Array.isArray(granted) || granted.length === 0) {
        throw new HttpsError("invalid-argument", "Не передан список согласий.");
    }

    const ids = granted.filter((id): id is ConsentId =>
        CONSENT_IDS.includes(id as ConsentId)
    );
    if (ids.length !== granted.length) {
        throw new HttpsError("invalid-argument", "Неизвестный вид согласия.");
    }

    const versions = await currentDocumentVersions();
    if (versions.privacy === "unknown" || versions.tos === "unknown") {
        // Записать согласие, не зная версии документа, — значит записать
        // бесполезную строку: доказать, ЧТО именно принял пользователь, будет нельзя.
        throw new HttpsError("internal", "Не удалось определить версии документов.");
    }

    // Необязательное согласие (шагомер) даётся поверх уже принятых
    // обязательных: повторять их в журнале ради одной галочки незачем. Но
    // только если обязательные приняты на ТЕКУЩУЮ редакцию — иначе сначала
    // экран согласий.
    let userData: DocumentData | undefined;
    const readUser = async (): Promise<DocumentData> => {
        if (!userData) userData = (await db().collection("users").doc(uid).get()).data() ?? {};
        return userData;
    };

    const onlyOptional = ids.every((id) => OPTIONAL_CONSENTS.includes(id));
    if (onlyOptional) {
        const u = await readUser();
        if (u.consents_privacy_version !== versions.privacy || u.consents_tos_version !== versions.tos) {
            throw new HttpsError(
                "failed-precondition",
                "Сначала нужно принять текущую редакцию документов."
            );
        }
    } else {
        const missing = REQUIRED_CONSENTS.filter((id) => !ids.includes(id));
        if (missing.length > 0) {
            throw new HttpsError(
                "failed-precondition",
                `Не отмечены обязательные согласия: ${missing.join(", ")}.`
            );
        }
    }

    // Показ в рейтинге — показ данных о шагах другим людям. Без согласия на
    // сам шагомер показывать нечего.
    if (ids.includes("activity_leaderboard") && !ids.includes("activity_data")) {
        const u = await readUser();
        if (u.activity_data_consent !== true) {
            throw new HttpsError(
                "failed-precondition",
                "Показ в рейтинге доступен только с согласием на шагомер."
            );
        }
    }

    const method = normalizeMethod((request.data as Record<string, unknown>)?.method);
    const ip = clientIp(request);

    const batch = db().batch();
    for (const consentId of ids) {
        batch.set(db().collection("consents").doc(), {
            uid,
            consentId,
            documentVersion: documentVersionFor(consentId, versions),
            grantedAt: FieldValue.serverTimestamp(),
            method,
            ip,
            revokedAt: null,
        });
    }

    // Зеркала в документе пользователя. Источник истины — коллекция consents,
    // это производные значения, и пишутся они только отсюда. Клиент их
    // подделать не может: правило на users разрешает владельцу менять только
    // fcmToken и lastBackupSignature.
    //
    // `consents_*_version` нужны, чтобы на каждой отрисовке страницы не ходить
    // в журнал с запросом «а согласен ли этот человек с текущей редакцией».
    // Документ пользователя и так читается в hooks.server.ts на каждый запрос,
    // так что проверка выходит бесплатной.
    const mirror: Record<string, unknown> = {};
    if (!onlyOptional) {
        mirror.consents_privacy_version = versions.privacy;
        mirror.consents_tos_version = versions.tos;
        mirror.consents_updated_at = FieldValue.serverTimestamp();
    }
    // Флаги необязательных согласий здесь только включаются, выключает их
    // revokeConsent. Раньше повторное принятие документов без галочки
    // шагомера (экран согласий на сайте отправляет только обязательные) молча
    // выставляло false тем, кто шагомер включал, хотя их согласие не отозвано.
    for (const id of ids) {
        const field = OPTIONAL_MIRRORS[id];
        if (field) mirror[field] = true;
    }
    batch.set(db().collection("users").doc(uid), mirror, { merge: true });

    await batch.commit();

    return { status: "ok", recorded: ids.length, versions };
});

// ─── Отзыв согласия ───────────────────────────────────────────────────────────

/**
 * Отзывает необязательное согласие. Обязательные не отзывает — по ним путь
 * один, удаление аккаунта, и вызывающему об этом сообщается явно.
 *
 * Отзыв — не только пометка в журнале. Статья 10 Закона № 99-З: обработка
 * прекращается, данные удаляются. Для шагомера — сразу (eraseStepData), для
 * рейтинга — запись в рейтинге.
 */
export const revokeConsent = onCall(async (request) => {
    if (request.app == undefined) {
        throw new HttpsError("failed-precondition", "App Check required.");
    }
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");

    const uid = request.auth.uid;
    const consentId = (request.data as Record<string, unknown>)?.consentId as ConsentId;

    if (!CONSENT_IDS.includes(consentId)) {
        throw new HttpsError("invalid-argument", "Неизвестный вид согласия.");
    }

    if (REQUIRED_CONSENTS.includes(consentId)) {
        throw new HttpsError(
            "failed-precondition",
            "Это согласие невозможно отозвать отдельно: без него учётная запись " +
                "не может существовать. Отзыв равнозначен удалению аккаунта — " +
                "воспользуйтесь удалением учётной записи в разделе «Безопасность»."
        );
    }

    const cascade = REVOKE_CASCADE[consentId] ?? [consentId];

    const batch = db().batch();
    let revoked = 0;
    for (const id of cascade) {
        const snap = await db()
            .collection("consents")
            .where("uid", "==", uid)
            .where("consentId", "==", id)
            .where("revokedAt", "==", null)
            .get();
        for (const doc of snap.docs) {
            batch.update(doc.ref, { revokedAt: FieldValue.serverTimestamp() });
        }
        revoked += snap.size;
    }

    const mirror: Record<string, boolean> = {};
    for (const id of cascade) {
        const field = OPTIONAL_MIRRORS[id];
        if (field) mirror[field] = false;
    }
    if (Object.keys(mirror).length > 0) {
        batch.set(db().collection("users").doc(uid), mirror, { merge: true });
    }

    await batch.commit();

    // Данные удаляются после записи отзыва: если удаление упадёт, отзыв уже
    // зафиксирован, и stepperClaim по флагу больше не начислит. Повторный
    // вызов revokeConsent удаление доделает.
    if (consentId === "activity_data") {
        const erased = await eraseStepData(uid);
        console.log(`[consents] ${uid}: согласие на шагомер отозвано, данные о шагах удалены:`, JSON.stringify(erased));
    } else if (consentId === "activity_leaderboard") {
        await db().collection("stepper_leaderboard").doc(uid).delete();
    }

    return { status: "ok", revoked };
});

// ─── Чтение своих согласий ────────────────────────────────────────────────────

/**
 * Отдаёт пользователю его собственные записи — для раздела
 * «Настройки — Безопасность» и для реализации права на получение информации
 * об обработке (статья 10 Закона № 99-З, срок ответа 5 рабочих дней).
 */
export const getMyConsents = onCall(async (request) => {
    if (request.app == undefined) {
        throw new HttpsError("failed-precondition", "App Check required.");
    }
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");

    const snap = await db()
        .collection("consents")
        .where("uid", "==", request.auth.uid)
        .get();

    const items = snap.docs
        .map((d) => {
            const v = d.data();
            return {
                consentId: v.consentId as string,
                documentVersion: v.documentVersion as string,
                grantedAt: v.grantedAt?.toMillis?.() ?? null,
                revokedAt: v.revokedAt?.toMillis?.() ?? null,
                method: v.method as string,
            };
        })
        .sort((a, b) => (b.grantedAt ?? 0) - (a.grantedAt ?? 0));

    return { items };
});

// ─── Отзыв всех согласий при удалении аккаунта ────────────────────────────────

/**
 * Помечает все согласия пользователя отозванными и обезличивает записи.
 *
 * Вызывается из deleteAccount. Записи НЕ удаляются: Политика заявляет срок
 * хранения журнала 3 года, а сам факт удаления аккаунта тоже нужно уметь
 * подтвердить. Но всё, что не требуется для доказывания, из записи убирается —
 * остаются uid, вид согласия, версия документа и даты.
 *
 * Экспортируется как обычная функция, а не как onCall: вызывать её снаружи
 * незачем, и делать это точкой входа означало бы дать возможность обезличить
 * чужой журнал.
 */
export async function anonymizeConsentsOnDelete(uid: string): Promise<number> {
    const snap = await db().collection("consents").where("uid", "==", uid).get();
    if (snap.empty) return 0;

    const batch = db().batch();
    for (const doc of snap.docs) {
        batch.update(doc.ref, {
            ip: FieldValue.delete(),
            method: FieldValue.delete(),
            revokedAt: doc.data().revokedAt ?? FieldValue.serverTimestamp(),
            // Первую дату не перезаписываем: повторная очистка иначе
            // сдвигала бы начало трёхлетнего срока хранения.
            accountDeletedAt: doc.data().accountDeletedAt ?? FieldValue.serverTimestamp(),
        });
    }
    await batch.commit();
    return snap.size;
}
