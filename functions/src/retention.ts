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
    /** Журнал согласий — заявленные в Политике 3 года. */
    CONSENTS_DAYS: 3 * 365,
    /** Одноразовые ключи идемпотентности шагомера. */
    IDEMPOTENCY_DAYS: 30,
    /** Коды двухфакторной аутентификации: живут 5 минут, чистим протухшие. */
    TWO_FA_DAYS: 7,
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
        label: "журнал согласий",
        collection: "consents",
        field: "grantedAt",
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

export const enforceRetention = onSchedule(
    {
        schedule: "every day 04:00",
        timeZone: "Europe/Minsk",
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
    }
);
