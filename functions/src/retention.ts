/**
 * Автоудаление данных по истечении сроков хранения.
 *
 * Раздел 8 Политики конфиденциальности заявляет конкретные сроки. Заявленный,
 * но не соблюдаемый срок хуже отсутствия срока: это письменное обязательство,
 * неисполнение которого проверяется одним запросом к базе.
 *
 * ⚠️ ПО УМОЛЧАНИЮ ФУНКЦИЯ НИЧЕГО НЕ УДАЛЯЕТ. Она считает, сколько документов
 * попадает под каждый срок, и пишет это в лог. Чтобы включить реальное удаление,
 * нужно выставить переменную окружения RETENTION_APPLY=true.
 *
 * Так сделано намеренно: функция удаляет прод-данные по расписанию и без
 * подтверждения. Прежде чем включать, стоит один раз посмотреть в логах, что
 * счётчики совпадают с ожиданием, — ошибка в имени поля здесь не падает, а
 * молча удаляет не то.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { purgeAccount } from "./accountPurge";

const db = () => admin.firestore();

const DAY = 24 * 60 * 60 * 1000;

/**
 * Сроки хранения. Держим в одном месте, потому что они продублированы в тексте
 * Политики: если менять здесь, надо менять и там, иначе документ разойдётся с
 * поведением. Раздел 8 privacy_policy_v5.xml.
 */
export const RETENTION = {
    /** Журналы безопасности и всё, где есть IP-адрес. */
    SECURITY_LOGS_DAYS: 180,
    /** Агрегированная суточная статистика шагов. */
    STEP_STATS_DAYS: 365,
    /** Остатки удалённых аккаунтов во вспомогательных коллекциях. */
    DELETED_ACCOUNT_LEFTOVERS_DAYS: 30,
    /**
     * Журнал согласий — 3 года ПОСЛЕ ПРЕКРАЩЕНИЯ обработки (приложение 1 к
     * Политике обработки). Отсчёт идёт от revokedAt: его ставят и отзыв, и
     * удаление аккаунта. От даты выдачи считать нельзя — через три года это
     * стёрло бы доказательство согласия у человека, который продолжает
     * пользоваться Сервисом (пункт 7 статьи 5 Закона № 99-З).
     */
    CONSENTS_DAYS: 3 * 365,
    /** Одноразовые ключи идемпотентности шагомера. */
    IDEMPOTENCY_DAYS: 30,
    /** Коды двухфакторной аутентификации: живут 5 минут, чистим протухшие. */
    TWO_FA_DAYS: 7,
    /**
     * Учётная запись без входа три года — срок действия согласия
     * («3 года с даты последнего входа», приложение 1 к Политике обработки).
     */
    INACTIVE_ACCOUNT_DAYS: 3 * 365,
    /**
     * Не больше стольких удалений по неактивности за один запуск: ошибка в
     * критерии не должна снести всех разом, а 25 в день разгребают любой
     * реалистичный хвост за несколько дней.
     */
    INACTIVE_PURGE_PER_RUN: 25,
} as const;

type Target = {
    /** Человекочитаемое имя для лога. */
    label: string;
    /** Путь коллекции. */
    collection: string;
    /** Поле с датой, по которому отсекаем. */
    field: string;
    /** Срок в днях. */
    days: number;
    /** Коллекция верхнеуровневая или collectionGroup. */
    group?: boolean;
};

/**
 * Только те коллекции, чью схему удалось проверить по коду.
 *
 * `auth_logs` сюда НЕ входит осознанно: документ там заводится на устройство,
 * а персональные данные (uid, email каждого входа) лежат внутри массива
 * `login_history`. Удаление документа по `last_seen` вычистит только спящие
 * устройства, а у активного массив растёт бесконечно. Чистить нужно элементы
 * массива, а это меняет данные, на которых admin-модуль строит детект нарушений.
 * Схема принадлежит Android-репозиторию — согласовать с Денисом до реализации.
 */
const TARGETS: Target[] = [
    {
        label: "журнал согласий (после отзыва или удаления аккаунта)",
        collection: "consents",
        // Диапазонный запрос по Timestamp не возвращает документы с null, так
        // что действующие согласия (revokedAt: null) под чистку не попадают.
        field: "revokedAt",
        days: RETENTION.CONSENTS_DAYS,
    },
    {
        label: "ключи идемпотентности шагомера",
        collection: "stepper_idempotency",
        field: "createdAt",
        days: RETENTION.IDEMPOTENCY_DAYS,
    },
    {
        label: "коды 2FA",
        collection: "2fa_codes",
        field: "expiresAt",
        days: RETENTION.TWO_FA_DAYS,
    },
    {
        label: "отметки о пройденной 2FA",
        collection: "2fa_cleared",
        field: "createdAt",
        days: RETENTION.DELETED_ACCOUNT_LEFTOVERS_DAYS,
    },
    {
        label: "история начислений шагомера",
        collection: "claim_history",
        field: "claimedAt",
        days: RETENTION.STEP_STATS_DAYS,
        group: true,
    },
];

const BATCH_LIMIT = 400;

async function sweep(target: Target, apply: boolean): Promise<number> {
    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - target.days * DAY);

    const base = target.group
        ? db().collectionGroup(target.collection)
        : db().collection(target.collection);

    let total = 0;

    // Пагинация: коллекция может быть большой, а держать всё в памяти незачем.
    for (;;) {
        const snap = await base.where(target.field, "<", cutoff).limit(BATCH_LIMIT).get();
        if (snap.empty) break;

        total += snap.size;

        if (!apply) {
            // В сухом прогоне выходим после первой страницы: точное число не
            // нужно, нужен порядок величины и подтверждение, что запрос вообще
            // что-то находит.
            break;
        }

        const batch = db().batch();
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();

        if (snap.size < BATCH_LIMIT) break;
    }

    return total;
}

/**
 * Учётные записи, в которые не входили три года.
 *
 * «Вход» считаем по Firebase Auth: самое позднее из времени входа и времени
 * обновления токена. Токен обновляет и сайт, и приложение, пока человек ими
 * пользуется, поэтому активный пользователь сюда не попадёт, даже если не
 * вводил пароль годами. Своего поля «последний визит» у документа
 * пользователя нет.
 *
 * Администраторы исключены: удалить их автоматически — значит потерять
 * доступ к админке, а не выполнить срок хранения.
 */
async function sweepInactiveAccounts(apply: boolean): Promise<void> {
    const cutoff = Date.now() - RETENTION.INACTIVE_ACCOUNT_DAYS * DAY;
    const admins = new Set((await db().collection("admins").get()).docs.map((d) => d.id));

    const stale: string[] = [];
    let pageToken: string | undefined;
    do {
        const page = await admin.auth().listUsers(1000, pageToken);
        for (const u of page.users) {
            const last = Math.max(
                Date.parse(u.metadata.lastSignInTime || "") || 0,
                Date.parse(u.metadata.lastRefreshTime || "") || 0,
                Date.parse(u.metadata.creationTime || "") || 0
            );
            if (last > 0 && last < cutoff && !admins.has(u.uid)) stale.push(u.uid);
        }
        pageToken = page.pageToken;
    } while (pageToken);

    if (stale.length === 0) {
        console.log("[retention] учётные записи без входа 3 года: нет");
        return;
    }
    if (!apply) {
        console.log(
            `[retention] учётные записи без входа 3 года: ${stale.length} ` +
                `(удаляется до ${RETENTION.INACTIVE_PURGE_PER_RUN} за запуск)`
        );
        return;
    }

    for (const uid of stale.slice(0, RETENTION.INACTIVE_PURGE_PER_RUN)) {
        try {
            const report = await purgeAccount(uid, { dryRun: false });
            console.log(`[retention] удалена учётная запись ${uid} (3 года без входа):`, JSON.stringify(report));
        } catch (e) {
            console.error(`[retention] ${uid}: ошибка очистки`, e);
        }
    }
}

export const enforceRetention = onSchedule(
    {
        schedule: "every day 04:00",
        timeZone: "Europe/Minsk",
        // Удаление по неактивности удаляет и аватар в Cloudinary: ключи лежат
        // в Secret Manager, и функция должна объявить их явно.
        secrets: ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"],
        // Регион задаётся глобально в index.ts (europe-west1). Firestore при этом
        // лежит в europe-central2 — межрегиональные чтения здесь норма, см.
        // .claude/rules/firebase.md.
    },
    async () => {
        const apply = process.env.RETENTION_APPLY === "true";

        console.log(
            `[retention] режим: ${apply ? "УДАЛЕНИЕ" : "сухой прогон (RETENTION_APPLY не выставлен)"}`
        );

        for (const target of TARGETS) {
            try {
                const count = await sweep(target, apply);
                if (count === 0) {
                    console.log(`[retention] ${target.label}: нечего удалять`);
                } else if (apply) {
                    console.log(`[retention] ${target.label}: удалено ${count}`);
                } else {
                    console.log(
                        `[retention] ${target.label}: под удаление попадает минимум ${count} ` +
                            `(старше ${target.days} дн. по полю ${target.field})`
                    );
                }
            } catch (e) {
                // Одна упавшая коллекция не должна останавливать остальные.
                // Частая причина — отсутствие индекса под составной запрос.
                console.error(`[retention] ${target.label}: ошибка`, e);
            }
        }

        try {
            await sweepInactiveAccounts(apply);
        } catch (e) {
            console.error("[retention] учётные записи без входа: ошибка", e);
        }
    }
);
