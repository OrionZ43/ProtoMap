/**
 * Сброс кэша карты (`system/map_cache`).
 *
 * Вынесено из index.ts, потому что кэш сбрасывает и очистка аккаунта
 * (accountPurge.ts), а импортировать её из index.ts — это циклический импорт.
 *
 * Не чаще раза в минуту: getLocations пересобирает кэш по промаху, и частые
 * сбросы под нагрузкой превращали бы каждую правку метки в полную пересборку.
 */
import * as admin from "firebase-admin";

const db = () => admin.firestore();

export async function clearMapCache(): Promise<void> {
    const cacheRef = db().collection("system").doc("map_cache");

    try {
        // Проверка возраста и удаление в одной транзакции — иначе два
        // одновременных сброса проходили бы проверку оба
        await db().runTransaction(async (t) => {
            const doc = await t.get(cacheRef);

            if (doc.exists) {
                const lastUpdated = doc.data()?.updatedAt?.toMillis() || 0;
                if (Date.now() - lastUpdated < 60000) {
                    throw new Error("THROTTLED"); // транзакция откатится
                }
            }

            t.delete(cacheRef);
        });

        console.log("Map cache cleared.");
    } catch (e: unknown) {
        if (e instanceof Error && e.message === "THROTTLED") {
            console.log("Cache clear throttled (safe).");
        } else {
            console.error("Failed to clear cache:", e);
        }
    }
}
