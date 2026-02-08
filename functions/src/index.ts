import { onRequest } from "firebase-functions/v2/https";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import fetch from "node-fetch";
import { FieldValue } from "firebase-admin/firestore";
import { v2 as cloudinary } from "cloudinary";
import * as crypto from 'crypto';
import { telegramWebhook } from './telegramBot';

exports.telegramWebhook = telegramWebhook;

// ===================================================================
// 🔒 SECURITY FIX #1: Безопасная проверка Google URL
// ===================================================================
function isValidGoogleURL(url: string): boolean {
    try {
        const parsed = new URL(url);
        const hostname = parsed.hostname.toLowerCase();

        // Проверяем ТОЧНЫЙ домен (не просто substring!)
        const validDomains = [
            'googleusercontent.com',
            'lh3.googleusercontent.com',
            'lh4.googleusercontent.com',
            'lh5.googleusercontent.com',
            'lh6.googleusercontent.com'
        ];

        // Домен должен ТОЧНО совпадать или быть поддоменом *.googleusercontent.com
        return validDomains.includes(hostname) ||
               hostname.endsWith('.googleusercontent.com');

    } catch (e) {
        // Невалидный URL
        return false;
    }
}

// ===================================================================
// 🔒 SECURITY FIX #2: Функция для безопасного jitter (геокодинг)
// ===================================================================
function secureJitter(value: number, range: number): number {
    const buffer = crypto.randomBytes(4);
    const randomInt = buffer.readUInt32BE(0);
    const randomFloat = (randomInt / 0xFFFFFFFF) - 0.5; // От -0.5 до +0.5
    return value + (randomFloat * range);
}

// ===================================================================
// 🔒 SECURITY FIX #3: Глобальный Rate Limiter
// ===================================================================
async function checkGlobalRateLimit(
    uid: string,
    action: string,
    limit: number,
    windowMs: number
): Promise<void> {
    const now = Date.now();
    const limitsRef = admin.firestore().collection('rate_limits').doc(uid);

    await admin.firestore().runTransaction(async (t) => {
        const doc = await t.get(limitsRef);
        const data = doc.data() || {};
        const actions = data[action] || [];

        // Удаляем записи старше окна
        const recentActions = actions.filter((timestamp: number) =>
            now - timestamp < windowMs
        );

        if (recentActions.length >= limit) {
            const waitTime = Math.ceil((recentActions[0] + windowMs - now) / 60000);
            throw new HttpsError(
                'resource-exhausted',
                `Слишком много попыток. Попробуйте через ${waitTime} мин.`
            );
        }

        // Добавляем новую запись
        recentActions.push(now);

        // Обновляем
        t.set(limitsRef, {
            [action]: recentActions,
            lastUpdate: FieldValue.serverTimestamp()
        }, { merge: true });
    });
}

// ===================================================================
// 🔒 SECURITY FIX #4: Исправленный getTelegramAuthCode
// ===================================================================
export const getTelegramAuthCode = onCall(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Auth required.');
    const uid = request.auth.uid;

    // ✅ ИСПРАВЛЕНО: 128 бит энтропии вместо 24
    const code = "PM-" + crypto.randomBytes(16).toString('hex').toUpperCase();

    await db.collection('system').doc('telegram_codes').collection('active_codes').doc(code).set({
        uid: uid,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: Date.now() + 5 * 60 * 1000,
        used: false // 🔒 Флаг одноразового использования
    });

    return { code };
});

if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

const ALLOWED_ORIGINS = ["http://localhost:5173", "https://proto-map.vercel.app"];

const handleCors = (request: any, response: any): boolean => {
    const origin = request.headers.origin as string;
    if (ALLOWED_ORIGINS.includes(origin)) {
        response.set('Access-Control-Allow-Origin', origin);
    }
    if (request.method === 'OPTIONS') {
        response.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        response.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-firebase-appcheck');
        response.status(204).send('');
        return true;
    }
    return false;
};

const CASINO_CHAT_ID = "-1002885386686";
const CASINO_TOPIC_ID = 2661;

async function sendToCasinoChat(message: string) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken || !CASINO_CHAT_ID) return;

    try {
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: CASINO_CHAT_ID,
                message_thread_id: CASINO_TOPIC_ID,
                text: message,
                parse_mode: 'Markdown'
            })
        });
    } catch (e) {
        console.error("Ошибка отправки в Telegram:", e);
    }
}

// ===================================================================
// 🔒 SECURITY FIX #5: Исправленный migrateExternalAvatar
// ===================================================================
export const migrateExternalAvatar = onCall(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Auth required.');
    const uid = request.auth.uid;
    const { url } = request.data;

    // ✅ ИСПРАВЛЕНО: Безопасная проверка URL
    if (!url || !isValidGoogleURL(url)) {
        throw new HttpsError('invalid-argument', 'Invalid or untrusted URL');
    }

    try {
        // Очищаем URL от параметров размера Google (=s96-c)
        const cleanUrl = url.split('=')[0];

        // Загружаем в Cloudinary
        const result = await cloudinary.uploader.upload(cleanUrl, {
            folder: "protomap_avatars",
            public_id: uid,
            overwrite: true,
            format: "webp",
            // 🔒 ДОПОЛНИТЕЛЬНАЯ ЗАЩИТА:
            resource_type: 'image', // Только изображения!
            allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp']
        });

        // Обновляем профиль в Firestore
        await db.collection('users').doc(uid).update({ avatar_url: result.secure_url });
        await clearMapCache();

        return { status: 'success', newUrl: result.secure_url };
    } catch (e) {
        console.error("Migration failed:", e);
        return { status: 'error' };
    }
});

// ===================================================================
// 🔒 SECURITY FIX #6: Исправленный clearMapCache с транзакцией
// ===================================================================
async function clearMapCache() {
    const cacheRef = db.collection('system').doc('map_cache');

    try {
        // ✅ ИСПРАВЛЕНО: Атомарная транзакция вместо race condition
        await db.runTransaction(async (t) => {
            const doc = await t.get(cacheRef);

            if (doc.exists) {
                const data = doc.data();
                const lastUpdated = data?.updatedAt?.toMillis() || 0;

                // ЗАЩИТА: Проверка внутри транзакции
                if (Date.now() - lastUpdated < 60000) {
                    throw new Error('THROTTLED'); // Откатится автоматически
                }
            }

            // Удаление в рамках той же транзакции
            t.delete(cacheRef);
        });

        console.log("Map cache cleared.");

    } catch (e: any) {
        if (e.message === 'THROTTLED') {
            console.log("Cache clear throttled (safe).");
        } else {
            console.error("Failed to clear cache:", e);
        }
    }
}

async function assertNotBanned(request: any) {
    if (request.auth?.token?.banned === true) {
        console.warn(`Block by Token Claim: ${request.auth.uid}`);
        throw new HttpsError('permission-denied', 'Account banned (Token).');
    }

    const uid = request.auth?.uid;
    if (uid) {
        const userRef = admin.firestore().collection('users').doc(uid);
        const userSnap = await userRef.get();
        if (userSnap.exists && userSnap.data()?.isBanned) {
             console.warn(`Block by DB Check: ${uid}`);
             throw new HttpsError('permission-denied', 'Account banned (DB).');
        }
    }
}

function assertEmailVerified(auth: any) {
    if (!auth.token.email_verified) {
        throw new HttpsError('permission-denied', 'Требуется подтверждение почты (Email Verification).');
    }
}

export const sendMessage = onCall(async (request) => {
    if (request.app == undefined) {
        throw new HttpsError('failed-precondition', 'The function must be called from an App Check verified app.');
    }
    if (!request.auth) throw new HttpsError('unauthenticated', 'Доступ запрещен.');

    const uid = request.auth.uid;
    await assertNotBanned(request);
    assertEmailVerified(request.auth);

    const { text, replyTo, lang } = request.data as any;
    const messageLang = (lang === 'en' || lang === 'ru') ? lang : 'ru';

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        throw new HttpsError('invalid-argument', 'Сообщение не может быть пустым.');
    }

    let cleanText = text;
    cleanText = cleanText.replace(/[\u0300-\u036f\u20d0-\u20ff\ufe20-\ufe2f]/g, '');
    cleanText = cleanText.replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '');
    cleanText = cleanText.trim().replace(/(\r\n|\n|\r){3,}/g, '\n\n');

    if (cleanText.length === 0) throw new HttpsError('invalid-argument', 'Сообщение не содержит допустимых символов.');
    if (cleanText.length > 1000) throw new HttpsError('invalid-argument', 'Слишком длинное сообщение.');

    const sanitizedText = cleanText;
    const userRef = db.collection('users').doc(uid);

    try {
        await db.runTransaction(async (t) => {
            const userDoc = await t.get(userRef);
            if (!userDoc.exists) throw new HttpsError('not-found', 'Профиль не найден.');
            const userData = userDoc.data()!;

            if (userData.isBanned) throw new HttpsError('permission-denied', 'Вы заблокированы.');

            const lastMessageTime = userData.last_chat_message;
            if (lastMessageTime && Date.now() - lastMessageTime.toDate().getTime() < 3000) {
                throw new HttpsError('resource-exhausted', 'Слишком часто. Охладите трахание.');
            }

            const newMessage: any = {
                text: sanitizedText,
                lang: messageLang,
                author_uid: uid,
                author_username: userData.username,
                author_avatar_url: userData.avatar_url || '',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                author_equipped_frame: userData.equipped_frame || null,
                image: false,
                voiceMessage: false
            };

            if (replyTo) {
                newMessage.replyTo = { author_username: replyTo.author_username, text: replyTo.text };
                if (replyTo.text === '[Изображение]') newMessage.replyToImage = true;
                if (replyTo.text === '[Голосовое сообщение]') newMessage.replyToVoiceMessage = true;
            }

            const chatRef = db.collection('global_chat').doc();
            t.set(chatRef, newMessage);
            t.update(userRef, { last_chat_message: admin.firestore.FieldValue.serverTimestamp() });
        });
        return { status: 'success' };
    } catch (error: any) {
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', 'Ошибка сервера.');
    }
});

export const deleteComment = onCall(async (request) => {
    if (request.app == undefined) {
        throw new HttpsError('failed-precondition', 'The function must be called from an App Check verified app.');
    }
    if (!request.auth) throw new HttpsError('unauthenticated', 'Необходима авторизация.');

    const uid = request.auth.uid;
    await assertNotBanned(request);

    const { profileUid, commentId } = request.data;

    try {
        const commentRef = db.collection('users').doc(profileUid).collection('comments').doc(commentId);
        const commentDoc = await commentRef.get();

        if (!commentDoc.exists) throw new HttpsError('not-found', 'Комментарий не найден.');

        const commentData = commentDoc.data()!;
        if (commentData.author_uid !== uid && profileUid !== uid) {
            throw new HttpsError('permission-denied', 'Нет прав на удаление.');
        }

        await commentRef.delete();
        return { status: 'success', message: 'Комментарий удален.' };
    } catch (error: any) {
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', 'Ошибка сервера.');
    }
});

export const addComment = onCall(async (request) => {
    if (request.app == undefined) throw new HttpsError('failed-precondition', 'App Check required.');
    if (!request.auth) throw new HttpsError('unauthenticated', 'Auth required.');

    const uid = request.auth.uid;
    await assertNotBanned(uid);
    assertEmailVerified(request.auth);

    const { profileUid, text, parentId } = request.data;

    if (!profileUid || !text || typeof text !== 'string' || !text.trim()) {
        throw new HttpsError('invalid-argument', 'Пустое сообщение.');
    }
    if (text.length > 1000) throw new HttpsError('invalid-argument', 'Слишком длинно.');

    const authorRef = db.collection('users').doc(uid);
    const profileRef = db.collection('users').doc(profileUid);

    try {
        const authorDoc = await authorRef.get();
        if (!authorDoc.exists) throw new HttpsError('not-found', 'User not found.');
        const authorData = authorDoc.data()!;

        const commentData: any = {
            text: text.trim(),
            author_uid: uid,
            author_username: authorData.username,
            author_avatar_url: authorData.avatar_url || '',
            author_equipped_frame: authorData.equipped_frame || null,
            createdAt: FieldValue.serverTimestamp(),
            likes: []
        };

        if (parentId) {
            commentData.parentId = parentId;
        }

        await profileRef.collection('comments').add(commentData);

        return { status: 'success', message: 'Сигнал отправлен!' };
    } catch (error: any) {
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', error.message);
    }
});

export const toggleCommentLike = onCall(async (request) => {
    if (request.app == undefined) throw new HttpsError('failed-precondition', 'App Check required.');
    if (!request.auth) throw new HttpsError('unauthenticated', 'Auth required.');

    const uid = request.auth.uid;
    await assertNotBanned(uid);

    const { profileUid, commentId } = request.data;
    const commentRef = db.collection('users').doc(profileUid).collection('comments').doc(commentId);

    try {
        await db.runTransaction(async (t) => {
            const doc = await t.get(commentRef);
            if (!doc.exists) throw new HttpsError('not-found', 'Comment not found');

            const data = doc.data()!;
            const likes = data.likes || [];

            if (likes.includes(uid)) {
                t.update(commentRef, { likes: FieldValue.arrayRemove(uid) });
            } else {
                t.update(commentRef, { likes: FieldValue.arrayUnion(uid) });
            }
        });
        return { status: 'success' };
    } catch (e: any) {
        throw new HttpsError('internal', 'Like error');
    }
});

export const checkUsername = onRequest({ cors: false }, async (request, response) => {
    if (handleCors(request, response)) return;
    if (request.method !== "POST") {
        response.status(405).send("Method Not Allowed");
        return;
    }

    const username = request.body.data.username;
    if (!username || typeof username !== "string" || username.length < 4) {
        response.status(400).json({ error: { message: "Имя слишком короткое" } });
        return;
    }

    const lowerName = username.toLowerCase();
    const forbiddenWords = ['admin', 'moderator', 'system', 'root', 'support', 'protomap', 'owner', 'dev', 'bot'];
    if (forbiddenWords.some(word => lowerName.includes(word))) {
         response.status(200).json({ data: { isAvailable: false, message: "Имя зарезервировано." } });
         return;
    }

    try {
        const snapshot = await db.collection("users").where("username", "==", username).limit(1).get();
        response.status(200).json({ data: { isAvailable: snapshot.empty } });
    } catch (error) {
        response.status(500).json({ error: { message: "Internal server error" } });
    }
});

export const updateEquippedItems = onCall({ cors: ALLOWED_ORIGINS }, async (request) => {
    if (request.app == undefined) {
        throw new HttpsError('failed-precondition', 'The function must be called from an App Check verified app.');
    }
    if (!request.auth) throw new HttpsError('unauthenticated', 'Auth required.');

    const uid = request.auth.uid;
    await assertNotBanned(request);
    assertEmailVerified(request.auth);

    const { equipped_frame, equipped_bg } = request.data;
    const userRef = db.collection('users').doc(uid);

    try {
        const userDoc = await userRef.get();
        if (!userDoc.exists) throw new HttpsError('not-found', 'User not found.');
        const userData = userDoc.data() as any;

        const updates: any = {};

        if (equipped_frame !== undefined) {
            if (equipped_frame !== null && !userData.owned_items?.includes(equipped_frame)) {
                throw new HttpsError('permission-denied', 'Нет прав на эту рамку.');
            }
            updates.equipped_frame = equipped_frame;
        }

        if (equipped_bg !== undefined) {
            if (equipped_bg !== null && !userData.owned_items?.includes(equipped_bg)) {
                throw new HttpsError('permission-denied', 'Нет прав на этот фон.');
            }
            updates.equipped_bg = equipped_bg;
        }

        if (Object.keys(updates).length > 0) {
            await userRef.update(updates);
            await clearMapCache();
        }

        return { data: { status: 'success', message: 'Стиль обновлен!' } };
    } catch (error: any) {
        if (error.code) throw error;
        throw new HttpsError('internal', 'Error saving items.');
    }
});

export const purchaseShopItem = onCall({ cors: ALLOWED_ORIGINS }, async (request) => {
    if (request.app == undefined) {
        throw new HttpsError('failed-precondition', 'The function must be called from an App Check verified app.');
    }
    if (!request.auth) throw new HttpsError('unauthenticated', 'Auth required.');

    const uid = request.auth.uid;
    await assertNotBanned(request);
    assertEmailVerified(request.auth);

    const { itemId } = request.data;
    const userRef = db.collection('users').doc(uid);
    const itemRef = db.collection('shop_items').doc(itemId);

    try {
        await db.runTransaction(async (t) => {
            const userDoc = await t.get(userRef);
            const itemDoc = await t.get(itemRef);

            if (!userDoc.exists || !itemDoc.exists) throw new HttpsError('not-found', 'Data not found.');

            const userData = userDoc.data() as any;
            const itemData = itemDoc.data() as any;
            const price = itemData.price || 999999;

            if (userData.owned_items?.includes(itemId)) throw new HttpsError('already-exists', 'Уже куплено.');
            if ((userData.casino_credits || 0) < price) throw new HttpsError('failed-precondition', 'Недостаточно средств.');

            t.update(userRef, {
                casino_credits: userData.casino_credits - price,
                owned_items: FieldValue.arrayUnion(itemId)
            });
        });
        return { data: { status: 'success', message: 'Покупка совершена!' } };
    } catch (error: any) {
        if (error.code) throw error;
        throw new HttpsError('internal', 'Transaction failed.');
    }
});

function getRewardValue(day: number): number {
    if (day === 30) return 1000;
    if (day % 5 === 0) return 250;
    return 50 + (Math.floor((day - 1) / 5) * 10);
}

export const getDailyBonus = onCall(async (request) => {
    if (request.app == undefined) {
        throw new HttpsError('failed-precondition', 'The function must be called from an App Check verified app.');
    }
    if (!request.auth) throw new HttpsError('unauthenticated', 'Auth required.');

    const uid = request.auth.uid;
    await assertNotBanned(request);
    assertEmailVerified(request.auth);

    const userRef = db.collection('users').doc(uid);

    try {
        const result = await db.runTransaction(async (t) => {
            const userDoc = await t.get(userRef);
            if (!userDoc.exists) throw new HttpsError('not-found', 'User not found.');

            const data = userDoc.data() as any;
            const lastBonus = data.last_daily_bonus ? data.last_daily_bonus.toDate() : null;
            let currentStreak = data.daily_streak || 0;

            const now = new Date();

            if (currentStreak >= 30) {
                currentStreak = 0;
            }

            if (lastBonus) {
                const diff = now.getTime() - lastBonus.getTime();

                if (diff < 20 * 60 * 60 * 1000) {
                    const hoursLeft = Math.ceil((20 * 60 * 60 * 1000 - diff) / 3600000);
                    throw new HttpsError('resource-exhausted', `Бонус доступен через ${hoursLeft} ч.`);
                }

                if (diff > 48 * 60 * 60 * 1000) {
                    currentStreak = 0;
                }
            }

            const dayToClaim = currentStreak + 1;
            const bonusAmount = getRewardValue(dayToClaim);
            let rewardMessage = `День ${dayToClaim}: получено ${bonusAmount} PC.`;
            let specialReward = null;

            if (dayToClaim === 30) {
                if (!data.owned_items?.includes('frame_ludoman')) {
                    specialReward = 'frame_ludoman';
                    t.update(userRef, {
                        owned_items: FieldValue.arrayUnion('frame_ludoman')
                    });
                    rewardMessage = "🎉 ЦИКЛ ЗАВЕРШЕН! ВЫ ПОЛУЧИЛИ РАМКУ И 1000 PC!";
                } else {
                    rewardMessage = "🎉 ЦИКЛ ЗАВЕРШЕН! МАКСИМАЛЬНАЯ НАГРАДА!";
                }
            }

            const newBalance = (data.casino_credits ?? 100) + bonusAmount;

            t.update(userRef, {
                casino_credits: newBalance,
                last_daily_bonus: FieldValue.serverTimestamp(),
                daily_streak: dayToClaim
            });

            return {
                status: 'success',
                message: rewardMessage,
                new_balance: newBalance,
                streak: dayToClaim,
                special_reward: specialReward
            };
        });

        return { data: result };
    } catch (error: any) {
        if (error instanceof HttpsError) throw error;
        if (error.code === 'resource-exhausted') throw error;
        throw new HttpsError('internal', 'Bonus error.');
    }
});

export const startCrashGame = onCall({ timeoutSeconds: 300 }, async (request) => {
    if (request.app == undefined) throw new HttpsError('failed-precondition', 'App Check required.');
    if (!request.auth) throw new HttpsError('unauthenticated', 'Auth required.');

    const uid = request.auth.uid;
    await assertNotBanned(uid);
    assertEmailVerified(request.auth);

    // ✅ НОВОЕ: Глобальный лимит (50 игр в час)
    await checkGlobalRateLimit(uid, 'crash', 50, 60 * 60 * 1000);

    let { bet } = request.data;
    bet = Math.floor(Number(bet));
    const MAX_BET = 1000;

    if (typeof bet !== 'number' || bet <= 0) throw new HttpsError('invalid-argument', 'Invalid bet.');
    if (bet > MAX_BET) throw new HttpsError('invalid-argument', `Max bet is ${MAX_BET}.`);

    const userRef = db.collection('users').doc(uid);
    const bankRef = db.collection('system').doc('casino_stats');
    const gameId = db.collection('crash_games').doc().id;

    const rtdb = admin.app().database("https://protomap-1e1db-default-rtdb.europe-west1.firebasedatabase.app");
    const gameRtdbRef = rtdb.ref(`crash_games/${gameId}`);

    try {
        let crashPoint = 1.00;

        const riskRoll = crypto.randomInt(0, 100);
        if (riskRoll < 6) {
            crashPoint = 1.00;
        } else {
            const buffer = crypto.randomBytes(4);
            const randomInt = buffer.readUInt32BE(0);
            const randomFloat = randomInt / 0xFFFFFFFF;
            crashPoint = Math.floor((0.94 / (1 - randomFloat)) * 100) / 100;
        }

        await db.runTransaction(async (t) => {
            const userDoc = await t.get(userRef);
            const bankDoc = await t.get(bankRef);

            if (!userDoc.exists) throw new HttpsError('not-found', 'User not found.');
            const userData = userDoc.data()!;

            let bankBalance = bankDoc.exists ? (bankDoc.data()?.bank_balance || 0) : 0;
            const safeBankLimit = bankBalance * 0.9;

            let maxAffordableMult = 1.0;
            if (bet > 0) {
                maxAffordableMult = safeBankLimit / bet;
            }

            if (crashPoint > maxAffordableMult) {
                console.log(`[CRASH] Capping multiplier for ${uid}. Org: ${crashPoint}, Capped: ${maxAffordableMult}`);
                crashPoint = Math.floor(maxAffordableMult * 100) / 100;

                if (crashPoint < 1.01) crashPoint = 1.00;
            }

            if (crashPoint > 50) crashPoint = 50;

            const lastPlayed = userData.last_crash_game ? userData.last_crash_game.toDate().getTime() : 0;
            if (Date.now() - lastPlayed < 5000) {
                 throw new HttpsError('resource-exhausted', 'Cooldown.');
            }
            if ((userData.casino_credits || 0) < bet) {
                throw new Error("No money");
            }

            t.update(userRef, {
                casino_credits: FieldValue.increment(-bet),
                last_crash_game: FieldValue.serverTimestamp()
            });

            t.set(bankRef, { bank_balance: bankBalance + bet }, { merge: true });

            t.set(db.collection('crash_games').doc(gameId), {
                uid, bet, crashPoint,
                status: 'active',
                createdAt: FieldValue.serverTimestamp(),
                expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 3600000)
            });
        });

        await gameRtdbRef.set({
            m: 1.00,
            s: 'run',
            uid: uid
        });

        runGameLoopRTDB(gameId, crashPoint);

        const easterEgg = Buffer.from("Hello Kuraga! Rate limited and verified. Good luck! 🚀").toString('base64');

        return {
            data: {
                gameId,
                debug_token: easterEgg
            }
        };

    } catch (e: any) {
        if (e.message === "No money") {
             throw new HttpsError('failed-precondition', 'Недостаточно средств.');
        }
        if (e.code === 'resource-exhausted') {
            throw e;
        }
        console.error("Internal Game Error", e);
        throw new HttpsError('internal', e.message);
    }
});

async function runGameLoopRTDB(gameId: string, crashPoint: number) {
    const rtdb = admin.app().database("https://protomap-1e1db-default-rtdb.europe-west1.firebasedatabase.app");
    const gameRef = rtdb.ref(`crash_games/${gameId}`);

    const fsGameRef = db.collection('crash_games').doc(gameId);

    const startTime = Date.now();
    let current = 1.00;

    const interval = setInterval(async () => {
        const t = (Date.now() - startTime) / 1000;
        current = Math.exp(0.08 * t);
        if (current >= crashPoint) {
            clearInterval(interval);

            await gameRef.update({ m: crashPoint, s: 'bang' });

            await fsGameRef.update({ status: 'crashed', finalMultiplier: crashPoint });

            setTimeout(() => gameRef.remove(), 5000);
        } else {
            gameRef.update({ m: parseFloat(current.toFixed(2)) });
        }
    }, 200);
}

export const cashOutCrashGame = onCall(async (request) => {
    if (request.app == undefined) throw new HttpsError('failed-precondition', 'App Check.');
    if (!request.auth) throw new HttpsError('unauthenticated', 'Auth.');
    const uid = request.auth.uid;
    const { gameId, multiplier } = request.data;

    const gameRef = db.collection('crash_games').doc(gameId);
    const userRef = db.collection('users').doc(uid);
    const bankRef = db.collection('system').doc('casino_stats');
    const rtdbRef = admin.app().database("https://protomap-1e1db-default-rtdb.europe-west1.firebasedatabase.app").ref(`crash_games/${gameId}`);

    try {
        const result = await db.runTransaction(async (t) => {
            const gameDoc = await t.get(gameRef);
            const bankDoc = await t.get(bankRef);

            if (!gameDoc.exists) throw new Error('Game expired');
            const data = gameDoc.data()!;

            if (data.status !== 'active') throw new Error('Too late');
            if (multiplier > data.crashPoint) throw new Error('Cheating detected');

            const winAmount = Math.floor(data.bet * multiplier);

            t.update(userRef, { casino_credits: FieldValue.increment(winAmount) });

            t.update(gameRef, { status: 'cashed_out', winAmount, cashOutAt: multiplier });

            const currentBank = bankDoc.exists ? (bankDoc.data()?.bank_balance || 0) : 0;
            t.set(bankRef, { bank_balance: currentBank - winAmount }, { merge: true });

            return { winAmount };
        });
        await rtdbRef.update({ s: 'done', m: multiplier });

        return { data: result };
    } catch (e: any) {
        throw new HttpsError('internal', e.message);
    }
});

export const synthesizeArtifact = onCall(async (request) => {
    if (request.app == undefined) throw new HttpsError('failed-precondition', 'App Check required.');
    if (!request.auth) throw new HttpsError('unauthenticated', 'Auth required.');

    const uid = request.auth.uid;
    await assertNotBanned(uid);
    assertEmailVerified(request.auth);

    const userRef = db.collection('users').doc(uid);
    const BASE_VALUE = 100;

    try {
        const result = await db.runTransaction(async (t) => {
            const userDoc = await t.get(userRef);
            if (!userDoc.exists) throw new HttpsError('not-found', 'User not found.');

            const userData = userDoc.data()!;
            if (userData.isBanned) throw new HttpsError('permission-denied', 'Banned.');

            const currentShards = userData.glitch_shards || 0;

            if (currentShards < 10) {
                throw new HttpsError('failed-precondition', 'Нужно 10 осколков для синтеза.');
            }

            const runePool = [
                { id: 'toast',        weight: 25, type: 'flat', val: 150 },
                { id: 'rubber_duck',  weight: 25, type: 'flat', val: 200 },
                { id: 'ram_stick',    weight: 20, type: 'flat', val: 300 },
                { id: 'energy_drink', weight: 15, type: 'mult', val: 2 },
                { id: 'gpu_fan',      weight: 10, type: 'mult', val: 3 },
                { id: 'rtx_card',     weight: 5,  type: 'mult', val: 4 },
                { id: 'source_code',  weight: 3,  type: 'mult', val: 5 },
                { id: 'banhammer',    weight: 3,  type: 'flat', val: 666 },
                { id: 'bug',          weight: 8,  type: 'flat', val: -100 },
                { id: '404_error',    weight: 6,  type: 'flat', val: -200 },
                { id: 'spaghetti',    weight: 5,  type: 'bad',  val: 0.5 },
                { id: 'blue_screen',  weight: 4,  type: 'bad',  val: 0.5 },
                { id: 'ransomware',   weight: 2,  type: 'bad',  val: 0.3 },
                { id: 'orion_tear',   weight: 0.5, type: 'super', val: 10 },
                { id: 'admin_key',    weight: 0.1, type: 'super', val: 20 }
            ];

            // ✅ ИСПРАВЛЕНО: Криптографически безопасный выбор
            const getRandomRune = () => {
                const totalWeight = runePool.reduce((sum, item) => sum + item.weight, 0);

                const buffer = crypto.randomBytes(4);
                const randomInt = buffer.readUInt32BE(0);
                let random = (randomInt / 0xFFFFFFFF) * totalWeight;

                for (const rune of runePool) {
                    if (random < rune.weight) return rune;
                    random -= rune.weight;
                }
                return runePool[0];
            };

            const runes = [getRandomRune(), getRandomRune(), getRandomRune()];

            let totalWin = BASE_VALUE;

            runes.forEach(r => { if (r.type === 'mult') totalWin += (BASE_VALUE * (r.val - 1)); });
            runes.forEach(r => { if (r.type === 'flat') totalWin += r.val; });
            runes.forEach(r => {
                if (r.type === 'bad') totalWin = Math.floor(totalWin * r.val);
                if (r.type === 'super') totalWin = Math.floor(totalWin * r.val);
            });

            if (totalWin < 50) totalWin = 50;

            const newBalance = (userData.casino_credits || 0) + totalWin;

            t.update(userRef, {
                glitch_shards: 0,
                casino_credits: newBalance,
                last_bonus_game: FieldValue.serverTimestamp()
            });

            return {
                runes: runes.map(r => r.id),
                totalWin: totalWin,
                newBalance: newBalance
            };
        });

        return { data: result };

    } catch (e: any) {
        throw e instanceof HttpsError ? e : new HttpsError('internal', e.message);
    }
});

interface UserData {
    username?: string;
    casino_credits?: number;
    glitch_shards?: number;
    isBanned?: boolean;
    last_game_played?: admin.firestore.Timestamp;
}

interface CasinoStats {
    bank_balance: number;
}

// ===================================================================
// 🎰 УЛУЧШЕННАЯ СИСТЕМА АРТЕФАКТОВ
// ===================================================================
export const playSlotMachine = onCall(
    { secrets: ["TELEGRAM_BOT_TOKEN"] },
    async (request) => {
        if (request.app == undefined) throw new HttpsError('failed-precondition', 'App Check required.');
        if (!request.auth) throw new HttpsError('unauthenticated', 'Auth required.');

        const uid = request.auth.uid;
        await assertNotBanned(uid);

        // Глобальный лимит (100 игр в час)
        await checkGlobalRateLimit(uid, 'slots', 100, 60 * 60 * 1000);

        let { bet } = request.data;
        bet = Math.floor(Number(bet));
        const MAX_BET = 1000;
        const MIN_BET = 10;

        if (typeof bet !== 'number' || bet <= 0) throw new HttpsError('invalid-argument', 'Invalid bet.');
        if (bet < MIN_BET) {
            throw new HttpsError('invalid-argument', `⛔ ERROR_CODE: MORO_DETECTED.\nСистема не принимает микро-ставки.\nМинимум: ${MIN_BET} PC.`);
        }

        if (bet > MAX_BET) throw new HttpsError('invalid-argument', `Max bet is ${MAX_BET}.`);

        const userRef = db.collection('users').doc(uid);
        const bankRef = db.collection('system').doc('casino_stats');

        try {
            const result = await db.runTransaction(async (t) => {
                const userDoc = await t.get(userRef);
                const bankDoc = await t.get(bankRef);

                if (!userDoc.exists) throw new HttpsError('not-found', 'User not found.');

                const data = userDoc.data() as UserData;
                const username = data.username || "Unknown";
                const credits = data.casino_credits ?? 100;
                let currentShards = data.glitch_shards || 0;
                const MAX_SHARDS = 10;

                const lastPlayed = data.last_game_played ? data.last_game_played.toDate().getTime() : 0;
                const now = Date.now();
                if (now - lastPlayed < 3000) {
                    throw new HttpsError('resource-exhausted', 'Слишком быстро.');
                }

                let bankBalance = bankDoc.exists ? (bankDoc.data() as CasinoStats)?.bank_balance || 0 : 0;

                if (credits < bet) throw new HttpsError('failed-precondition', 'Недостаточно средств.');

                // ===================================================================
                // 🎲 ГЕНЕРАЦИЯ РЕЗУЛЬТАТА
                // ===================================================================
                const roll = crypto.randomInt(0, 100000);
                let resultType = 'LOSS';

                if (roll < 100) resultType = 'JACKPOT';           // 0.1%
                else if (roll < 1100) resultType = 'GLITCH';      // 1%
                else if (roll < 2600) resultType = 'HEART';       // 1.5%
                else if (roll < 8100) resultType = 'RAM';         // 5.5%
                else if (roll < 27600) resultType = 'PAW';        // 19.5%
                else resultType = 'LOSS';                         // 72.4%

                let winMultiplier = 0;

                if (resultType === 'JACKPOT') winMultiplier = 100;
                else if (resultType === 'HEART') winMultiplier = 10;
                else if (resultType === 'RAM') winMultiplier = 5;
                else if (resultType === 'PAW') winMultiplier = 2;

                let potentialWin = Math.floor(bet * winMultiplier);
                const safeBankLimit = bankBalance * 0.9;

                // ===================================================================
                // 🏦 ЗАЩИТА БАНКА (downgrade wins если банк низкий)
                // ===================================================================
                if (potentialWin > 0 && potentialWin > safeBankLimit) {
                    console.log(`[BANK] Downgrade ${uid}: ${potentialWin} > ${safeBankLimit}`);

                    if (resultType === 'JACKPOT') {
                         resultType = 'HEART'; winMultiplier = 10; potentialWin = Math.floor(bet * 10);
                    }
                    if (potentialWin > safeBankLimit && winMultiplier > 5) {
                        resultType = 'RAM'; winMultiplier = 5; potentialWin = Math.floor(bet * 5);
                    }
                    if (potentialWin > safeBankLimit && winMultiplier > 2) {
                        resultType = 'PAW'; winMultiplier = 2; potentialWin = Math.floor(bet * 2);
                    }
                    if (potentialWin > safeBankLimit) {
                        resultType = 'LOSS'; winMultiplier = 0; potentialWin = 0;
                    }
                }

                let finalReels: string[] = [];
                let shardsToAdd = 0;
                let txNotification: string | null = null;

                const safeSymbols = ['paw', 'ram', 'heart', 'protomap_logo'];

                // ===================================================================
                // 🎨 ФОРМИРОВАНИЕ БАРАБАНОВ
                // ===================================================================
                switch (resultType) {
                    case 'JACKPOT':
                        finalReels = ['protomap_logo', 'protomap_logo', 'protomap_logo'];
                        txNotification = `🚨 *JACKPOT ALERT!* 🚨\n\nИгрок *${username}* сорвал куш!\nВыигрыш: *${potentialWin} PC* 💎`;
                        break;

                    case 'GLITCH':
                        finalReels = ['glitch-6', 'glitch-6', 'glitch-6'];
                        shardsToAdd = 10; // Полный набор сразу!
                        break;

                    case 'HEART':
                        finalReels = ['heart', 'heart', 'heart'];
                        break;

                    case 'RAM':
                        finalReels = ['ram', 'ram', 'ram'];
                        break;

                    case 'PAW':
                        finalReels = ['paw', 'paw', 'paw'];
                        break;

                    case 'LOSS':
                        // ===================================================================
                        // 🔮 НОВАЯ СИСТЕМА ВЫПАДЕНИЯ ОСКОЛКОВ
                        // ===================================================================

                        // 🏦 РАСЧЁТ МОДИФИКАТОРА БАНКА
                        // Чем меньше денег в банке, тем меньше шанс на осколки
                        const BANK_THRESHOLD_HIGH = 50000;  // Полный шанс
                        const BANK_THRESHOLD_LOW = 10000;   // Минимальный шанс

                        let bankModifier = 1.0;
                        if (bankBalance < BANK_THRESHOLD_LOW) {
                            bankModifier = 0.3; // -70% шанса
                        } else if (bankBalance < BANK_THRESHOLD_HIGH) {
                            // Линейная интерполяция между 0.3 и 1.0
                            bankModifier = 0.3 + (0.7 * (bankBalance - BANK_THRESHOLD_LOW) / (BANK_THRESHOLD_HIGH - BANK_THRESHOLD_LOW));
                        }

                        // 📉 БАЗОВЫЙ ШАНС: 5% (вместо 12%)
                        const BASE_SHARD_CHANCE = 5.0;
                        const finalShardChance = BASE_SHARD_CHANCE * bankModifier;

                        const shardRoll = crypto.randomInt(0, 10000); // 0-9999
                        const shardThreshold = Math.floor(finalShardChance * 100); // 5% = 500

                        console.log(`[SHARDS] Bank: ${bankBalance}, Modifier: ${bankModifier.toFixed(2)}, Chance: ${finalShardChance.toFixed(2)}%`);

                        if (shardRoll < shardThreshold) {
                            // 🎁 ВЫПАЛ ОСКОЛОК!
                            shardsToAdd = 1; // Всегда только 1 осколок (не 2!)

                            // Создаём барабаны с 1 осколком
                            finalReels = [
                                safeSymbols[crypto.randomInt(0, 4)],
                                safeSymbols[crypto.randomInt(0, 4)],
                                safeSymbols[crypto.randomInt(0, 4)]
                            ];

                            // Ставим осколок на случайную позицию
                            const glitchPosition = crypto.randomInt(0, 3);
                            finalReels[glitchPosition] = 'glitch-6';

                            console.log(`[SHARDS] ✨ Shard dropped for ${uid}! (1/10)`);

                        } else {
                            // ❌ НЕ ВЫПАЛ - обычный проигрыш

                            // 30% шанс на "near miss" (почти выигрыш)
                            const nearMissRoll = crypto.randomInt(0, 100);
                            if (nearMissRoll < 30) {
                                const teaseSym = safeSymbols[crypto.randomInt(0, 4)];
                                const trashSym = safeSymbols.filter(s => s !== teaseSym)[crypto.randomInt(0, 3)];

                                finalReels = [teaseSym, teaseSym, trashSym]
                                    .map(v => ({ v, s: crypto.randomInt(0, 1000000) }))
                                    .sort((a, b) => a.s - b.s)
                                    .map(({ v }) => v);
                            } else {
                                // Полностью случайные символы
                                do {
                                    finalReels = [
                                        safeSymbols[crypto.randomInt(0, 4)],
                                        safeSymbols[crypto.randomInt(0, 4)],
                                        safeSymbols[crypto.randomInt(0, 4)]
                                    ];
                                } while (finalReels[0] === finalReels[1] && finalReels[1] === finalReels[2]);
                            }
                        }
                        break;
                }

                // ===================================================================
                // 💰 ОБНОВЛЕНИЕ БАЛАНСОВ
                // ===================================================================
                const finalCalc = credits - bet + potentialWin;
                let newBankBalance = bankBalance + bet - potentialWin;
                if (newBankBalance < 0) newBankBalance = 0;

                let newShards = currentShards + shardsToAdd;
                if (newShards > MAX_SHARDS) newShards = MAX_SHARDS;

                t.update(userRef, {
                    casino_credits: finalCalc,
                    last_game_played: admin.firestore.FieldValue.serverTimestamp(),
                    glitch_shards: newShards
                });

                t.set(bankRef, { bank_balance: newBankBalance }, { merge: true });

                console.log(`[SLOTS] ${uid} | Bet:${bet} | Win:${potentialWin} | Shards:+${shardsToAdd} (${newShards}/10) | Bank:${newBankBalance}`);

                return {
                    reels: finalReels,
                    winAmount: potentialWin,
                    newBalance: finalCalc,
                    shards: newShards,
                    shardsAdded: shardsToAdd,
                    notification: txNotification
                };
            });

            if ((result as any).notification) {
                sendToCasinoChat((result as any).notification).catch(console.error);
            }
            delete (result as any).notification;

            return { data: result };

        } catch (error: any) {
            console.error("[SLOTS ERROR]:", error);
            if (error.code) throw error;
            throw new HttpsError('internal', 'Game error.');
        }
    }
);

// ===================================================================
// 🔒 SECURITY FIX #8: Исправленный playCoinFlip
// ===================================================================
export const playCoinFlip = onCall(async (request) => {
    if (request.app == undefined) throw new HttpsError('failed-precondition', 'App Check required.');
    if (!request.auth) throw new HttpsError('unauthenticated', 'Auth required.');

    const uid = request.auth.uid;
    await assertNotBanned(uid);
    assertEmailVerified(request.auth);

    // ✅ НОВОЕ: Глобальный лимит (200 флипов в час)
    await checkGlobalRateLimit(uid, 'coinflip', 200, 60 * 60 * 1000);

    let { bet, choice } = request.data;
    bet = Math.floor(Number(bet));

    if (typeof bet !== 'number' || bet <= 0) throw new HttpsError('invalid-argument', 'Invalid bet.');

    const userRef = db.collection('users').doc(uid);
    const bankRef = db.collection('system').doc('casino_stats');

    try {
        const result = await db.runTransaction(async (t) => {
            const userDoc = await t.get(userRef);
            const bankDoc = await t.get(bankRef);

            if (!userDoc.exists) throw new HttpsError('not-found', 'User not found.');

            const data = userDoc.data() as any;
            const credits = data.casino_credits ?? 100;
            let bankBalance = bankDoc.exists ? (bankDoc.data()?.bank_balance || 0) : 0;

            if (credits < bet) throw new HttpsError('failed-precondition', 'Недостаточно средств.');

            const WIN_MULTIPLIER = 1.95;
            const potentialWin = Math.floor(bet * WIN_MULTIPLIER);
            const profit = potentialWin - bet;

            let forcedLoss = false;
            if (profit > (bankBalance * 0.9)) {
                console.log(`[COIN] Bank low (${bankBalance}). Forcing loss for bet ${bet}.`);
                forcedLoss = true;
            }

            // ✅ ИСПРАВЛЕНО: crypto.randomInt вместо Math.random()
            let outcome = crypto.randomInt(0, 2) === 0 ? 'heads' : 'tails';

            if (forcedLoss) {
                outcome = (choice === 'heads') ? 'tails' : 'heads';
            }

            const hasWon = choice === outcome;
            let finalBalance = credits - bet;
            let newBankBalance = bankBalance + bet;

            if (hasWon) {
                finalBalance += potentialWin;
                newBankBalance -= potentialWin;
            }

            t.update(userRef, { casino_credits: finalBalance });
            t.set(bankRef, { bank_balance: newBankBalance }, { merge: true });

            return {
                outcome,
                hasWon,
                newBalance: finalBalance,
                creditsChange: hasWon ? (potentialWin - bet) : -bet
            };
        });
        return { data: result };
    } catch (error: any) {
        if (error.code) throw error;
        throw new HttpsError('internal', 'Game error.');
    }
});

export const getLeaderboard = onCall(async (request) => {
    if (request.app == undefined) {
        throw new HttpsError('failed-precondition', 'The function must be called from an App Check verified app.');
    }
    if (!request.auth) throw new HttpsError('unauthenticated', 'Auth required.');

    const HIDDEN_UIDS = [
        'MPe5KwdlsJU4pPxCEBydmMGgGTw1',
        'XT2NDfkr9wUFl3d1Eh6imTEdlxt2'
    ];

    try {
        const snapshot = await db.collection('users')
            .orderBy('casino_credits', 'desc')
            .limit(15)
            .get();

        const leaderboard = snapshot.docs
            .map(doc => {
                const data = doc.data();
                return {
                    uid: doc.id,
                    username: data.username || 'Неизвестный',
                    avatar_url: data.avatar_url || '',
                    casino_credits: data.casino_credits || 0,
                    equipped_frame: data.equipped_frame || null
                };
            })
            .filter(user => !HIDDEN_UIDS.includes(user.uid))
            .slice(0, 10);

        return { data: leaderboard };

    } catch (error) {
        console.error("Leaderboard error:", error);
        throw new HttpsError('internal', 'Не удалось загрузить списки лидеров.');
    }
});

// ===================================================================
// 🔒 SECURITY FIX #9: Исправленный getDistrictCenterCoords
// ===================================================================
async function getDistrictCenterCoords(lat: number, lng: number): Promise<[string, number, number] | null> {
    const userAgent = process.env.NOMINATIM_USER_AGENT || 'ProtoMap/1.0';
    try {
        const revUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ru&zoom=18`;
        const revRes = await fetch(revUrl, { headers: { 'User-Agent': userAgent } });
        if (!revRes.ok) return null;

        const revData = await revRes.json() as any;
        if (!revData.address) return null;

        const addr = revData.address;

        const cityName = addr.city || addr.town || addr.village || addr.hamlet || addr.municipality || addr.county;
        const stateName = addr.state || addr.region || addr.province;
        const countryName = addr.country;

        const locationHierarchy = {
            microdistrict: addr.suburb || addr.neighbourhood || addr.residential,
            district: addr.city_district || addr.borough || addr.quarter,
            city: cityName,
            state: stateName,
            country: countryName
        };

        const attempts = [
            { level: 'Micro', q: locationHierarchy.microdistrict },
            { level: 'District', q: locationHierarchy.district },
            { level: 'City', q: locationHierarchy.city }
        ];

        for (const attempt of attempts) {
            if (!attempt.q) continue;

            const queryParts = [
                attempt.q,
                (attempt.level !== 'City' && attempt.q !== locationHierarchy.city) ? locationHierarchy.city : null,
                locationHierarchy.state,
                locationHierarchy.country
            ].filter(Boolean);

            const q = queryParts.join(', ');

            await new Promise(r => setTimeout(r, 1000));

            const searchUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=ru&q=${encodeURIComponent(q)}`;
            const searchRes = await fetch(searchUrl, { headers: { 'User-Agent': userAgent } });

            if (!searchRes.ok) continue;

            const searchData = await searchRes.json() as any[];
            if (searchData && searchData.length > 0) {
                return [attempt.q, parseFloat(searchData[0].lat), parseFloat(searchData[0].lon)];
            }
        }

        if (cityName) {
            // ✅ ИСПРАВЛЕНО: secureJitter вместо Math.random()
            const jitterLat = secureJitter(lat, 0.01);
            const jitterLng = secureJitter(lng, 0.01);
            return [cityName, jitterLat, jitterLng];
        }

        return null;
    } catch (e) {
        console.error("Geocoding Error:", e);
        return null;
    }
}

export const addOrUpdateLocation = onCall(async (request) => {
    if (request.app == undefined) {
        throw new HttpsError('failed-precondition', 'The function must be called from an App Check verified app.');
    }

    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Auth required.');
    }

    const uid = request.auth.uid;
    await assertNotBanned(request);

    const { lat, lng, isManual } = request.data;

    if (!lat || !lng || typeof lat !== 'number' || typeof lng !== 'number') {
        throw new HttpsError('invalid-argument', 'Invalid coordinates.');
    }

    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
        throw new HttpsError('not-found', 'User profile not found.');
    }

    const userData = userDoc.data()!;
    const lastUpdate = userData.last_location_update ? userData.last_location_update.toMillis() : 0;

    if (Date.now() - lastUpdate < 10000) {
        throw new HttpsError('resource-exhausted', 'Please wait 10 seconds before updating location.');
    }

    let finalLat = lat;
    let finalLng = lng;
    let cityName = "Unknown Location";

    if (isManual) {
        const userAgent = process.env.NOMINATIM_USER_AGENT || 'ProtoMap/1.0';
        const revUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ru&zoom=10`;

        try {
            const revRes = await fetch(revUrl, { headers: { 'User-Agent': userAgent } });
            if (revRes.ok) {
                const revData = await revRes.json() as any;
                const addr = revData.address;
                cityName = addr.city || addr.town || addr.village || addr.hamlet || addr.county || addr.state || "Custom Location";
            }
        } catch (e) {
            console.error("Manual geo lookup failed:", e);
        }
    } else {
        const place = await getDistrictCenterCoords(lat, lng);
        if (!place) {
            throw new HttpsError('internal', 'Geocoding failed. Try again.');
        }
        cityName = place[0];
        finalLat = place[1];
        finalLng = place[2];
    }

    const batch = db.batch();
    const locRef = db.collection("locations");
    const q = await locRef.where("user_id", "==", uid).limit(1).get();

    if (!q.empty) {
        batch.update(locRef.doc(q.docs[0].id), {
            latitude: finalLat,
            longitude: finalLng,
            city: cityName
        });
    } else {
        const newDoc = locRef.doc();
        batch.set(newDoc, {
            latitude: finalLat,
            longitude: finalLng,
            city: cityName,
            user_id: uid
        });
    }

    batch.update(userRef, { last_location_update: FieldValue.serverTimestamp() });

    await batch.commit();
    await clearMapCache();

    return {
        status: 'success',
        message: isManual ? 'Координаты установлены точно!' : 'Геолокация обновлена (Центр района).',
        foundCity: cityName,
        placeLat: finalLat,
        placeLng: finalLng
    };
});

export const getLocations = onRequest({ cors: false }, async (request, response) => {
    if (handleCors(request, response)) return;

    response.set('Cache-Control', 'public, max-age=300, s-maxage=600');

    const CACHE_DOC_REF = db.collection('system').doc('map_cache');
    const CACHE_DURATION_MS = 24 * 60 * 60 * 1000;

    try {
        const now = Date.now();

        const cacheSnap = await CACHE_DOC_REF.get();
        let cacheData = cacheSnap.exists ? cacheSnap.data() : null;

        if (cacheData && cacheData.updatedAt && (now - cacheData.updatedAt.toMillis() < CACHE_DURATION_MS)) {
            response.status(200).json({ data: JSON.parse(cacheData.payload) });
            return;
        }

        console.log("Cache expired or missing. Rebuilding map data...");

        const locSnap = await db.collection("locations").get();
        if (locSnap.empty) {
            response.status(200).json({ data: [] });
            return;
        }

        const userIds = [...new Set(locSnap.docs.map(d => d.data().user_id).filter(Boolean))];
        const usersMap = new Map();

        for (let i = 0; i < userIds.length; i += 30) {
            const chunk = userIds.slice(i, i + 30);
            const uSnap = await db.collection("users").where(admin.firestore.FieldPath.documentId(), "in", chunk).get();
            uSnap.forEach(doc => usersMap.set(doc.id, doc.data()));
        }

        const results = locSnap.docs.map(doc => {
            const loc = doc.data();
            const user = usersMap.get(loc.user_id);
            if (!user) return null;
            return {
                lat: loc.latitude,
                lng: loc.longitude,
                city: loc.city,
                user: {
                    username: user.username || "Unknown",
                    avatar_url: user.avatar_url || null,
                    status: user.status || null,
                    equipped_frame: user.equipped_frame || null
                }
            };
        }).filter(Boolean);

        await CACHE_DOC_REF.set({
            payload: JSON.stringify(results),
            updatedAt: FieldValue.serverTimestamp()
        });

        response.status(200).json({ data: results });

    } catch (e) {
        console.error("Map Error:", e);
        response.status(500).json({ error: "Error fetching map" });
    }
});

export const deleteLocation = onCall({ cors: ALLOWED_ORIGINS }, async (request) => {
    if (request.app == undefined) {
        throw new HttpsError('failed-precondition', 'The function must be called from an App Check verified app.');
    }
    if (!request.auth) throw new HttpsError('unauthenticated', 'Auth required.');

    const uid = request.auth.uid;
    await assertNotBanned(request);

    try {
        const q = await db.collection("locations").where("user_id", "==", uid).limit(1).get();
        if (!q.empty) {
            await q.docs[0].ref.delete();
            await clearMapCache();
            return { status: 'success', message: 'Метка удалена.' };
        }
        return { status: 'success', message: 'Метка не найдена.' };
    } catch (e) {
        throw new HttpsError('internal', 'Error deleting location.');
    }
});

export const updateProfileData = onCall(async (request) => {
    if (request.app == undefined) {
        throw new HttpsError('failed-precondition', 'The function must be called from an App Check verified app.');
    }
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");

    const uid = request.auth.uid;
    await assertNotBanned(request);

    const data = request.data;
    const fields: any = {};

    if (typeof data.status === 'string') fields.status = data.status.trim().substring(0, 100);
    if (typeof data.about_me === 'string') fields.about_me = data.about_me.trim();

    if (typeof data.about_me === 'string') {
        fields.about_me = data.about_me.trim().substring(0, 500);
    }

    if (data.socials) {
        const ALLOWED_SOCIALS = ['telegram', 'discord', 'vk', 'twitter', 'website'];

        for (const [k, v] of Object.entries(data.socials)) {
            if (!ALLOWED_SOCIALS.includes(k)) {
                throw new HttpsError('invalid-argument', `Unknown social: ${k}`);
            }

            if (typeof v !== 'string') {
                throw new HttpsError('invalid-argument', `${k} must be string`);
            }

            const val = (v as string).trim();
            if (val) {
                fields[`socials.${k}`] = val.substring(0, 200);
            } else {
                fields[`socials.${k}`] = FieldValue.delete();
            }
        }
    }

    if (Object.keys(fields).length === 0) return { message: "Нет изменений." };

    try {
        await db.collection('users').doc(uid).update(fields);
        if (fields.status) {
            await clearMapCache();
        }
        return { message: "Профиль обновлен!" };
    } catch (e) {
        throw new HttpsError("internal", "Save error.");
    }
});

export const uploadAvatar = onCall({ secrets: ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"] }, async (request) => {
    if (request.app == undefined) {
        throw new HttpsError('failed-precondition', 'The function must be called from an App Check verified app.');
    }
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");

    const uid = request.auth.uid;
    await assertNotBanned(request);

    const { imageBase64 } = request.data;
    if (!imageBase64?.startsWith('data:image/')) throw new HttpsError("invalid-argument", "Bad image.");

    // ✅ ИСПРАВЛЕНО: Безопасное логирование секретов
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
        console.error("Cloudinary credentials missing");
        throw new HttpsError('internal', 'Service configuration error');
    }

    console.log("Cloudinary configured:", {
        cloudName: !!cloudName,
        apiKey: !!apiKey
        // ❌ НЕ ЛОГИРУЕМ apiSecret!
    });

    cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
    });

    try {
        const res = await cloudinary.uploader.upload(imageBase64, {
            folder: "protomap_avatars", public_id: uid, overwrite: true,
            format: "webp", transformation: [{ width: 256, height: 256, crop: "fill", gravity: "face" }]
        });
        await db.collection('users').doc(uid).update({ avatar_url: res.secure_url });
        await clearMapCache();
        return { avatarUrl: res.secure_url };
    } catch (e) {
        throw new HttpsError("internal", "Upload failed.");
    }
});

function escapeMarkdownV2(text: string): string {
    const sourceText = String(text || '');
    const charsToEscape = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
    let escapedText = sourceText;
    for (const char of charsToEscape) {
        escapedText = escapedText.replace(new RegExp('\\' + char, 'g'), '\\' + char);
    }
    return escapedText;
}

interface ReportData {
    type: 'comment' | 'profile';
    reportedContentId: string;
    profileOwnerUid: string;
    reason: string;
    reportedUsername?: string;
    reporterUsername?: string;
    profileOwnerUsername?: string;
}

export const reportContent = onCall(
    { secrets: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"] },
    async (request) => {
        if (request.app == undefined) {
        throw new HttpsError('failed-precondition', 'The function must be called from an App Check verified app.');
        }
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Auth required.");
        }

        await assertNotBanned(request);

        const reporterUid = request.auth.uid;

        const {
            type,
            reportedContentId,
            profileOwnerUid,
            reason,
            reportedUsername,
            reporterUsername,
            profileOwnerUsername
        } = request.data as ReportData;

        if (!type || !reportedContentId || !profileOwnerUid || !reason) {
            throw new HttpsError("invalid-argument", "Missing data.");
        }

        try {
            let reportedContentText = '';

            if (type === 'comment') {
                const commentDoc = await db.collection('users')
                    .doc(profileOwnerUid)
                    .collection('comments')
                    .doc(reportedContentId)
                    .get();

                if (commentDoc.exists) {
                    reportedContentText = commentDoc.data()?.text || '';
                }
            }

            await db.collection('reports').add({
                type,
                reportedContentId,
                profileOwnerUid,
                reporterUid,
                reason,
                reportedUsername: reportedUsername || null,
                reporterUsername: reporterUsername || null,
                profileOwnerUsername: profileOwnerUsername || null,
                reportedContentText: reportedContentText || null,
                status: 'new',
                createdAt: FieldValue.serverTimestamp()
            });

            const botToken = process.env.TELEGRAM_BOT_TOKEN;
            const chatId = process.env.TELEGRAM_CHAT_ID;

            if (botToken && chatId) {
                const baseUrl = "https://proto-map.vercel.app/profile/";

                const reporterLink = reporterUsername
                    ? `[${escapeMarkdownV2(reporterUsername)}](${baseUrl}${escapeMarkdownV2(reporterUsername)})`
                    : `\`${reporterUid}\``;

                const reportedUserLink = reportedUsername
                    ? `[${escapeMarkdownV2(reportedUsername)}](${baseUrl}${escapeMarkdownV2(reportedUsername)})`
                    : `\`UID: ${reportedContentId}\``;

                const profileLink = profileOwnerUsername
                    ? `[${escapeMarkdownV2(profileOwnerUsername)}](${baseUrl}${escapeMarkdownV2(profileOwnerUsername)})`
                    : `\`${profileOwnerUid}\``;

                let message = `🚨 *НОВЫЙ РЕПОРТ* 🚨\n\n`;
                message += `*От кого:* ${reporterLink}\n`;
                message += `*Причина:* ${escapeMarkdownV2(reason)}\n\n`;

                if (type === 'profile') {
                    message += `👉 *Жалоба на профиль:* ${reportedUserLink}`;
                } else {
                    message += `👉 *Жалоба на комментарий пользователя* ${reportedUserLink}\n`;
                    message += `📍 *В профиле:* ${profileLink}\n`;

                    if (reportedContentText) {
                        message += `\n*Текст комментария:*\n\`\`\`\n${escapeMarkdownV2(reportedContentText)}\n\`\`\``;
                    } else {
                        message += `\n_(Текст комментария не найден или удален)_`;
                    }
                }

                await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: message,
                        parse_mode: 'MarkdownV2',
                        disable_web_page_preview: true
                    })
                });
            }

            return { success: true, message: "Ваша жалоба отправлена." };

        } catch (error) {
            console.error("Report error:", error);
            throw new HttpsError("internal", "Ошибка сервера при отправке жалобы.");
        }
    }
);

export const deleteAccount = onCall(async (request) => {
    if (request.app == undefined) {
        throw new HttpsError('failed-precondition', 'The function must be called from an App Check verified app.');
    }
    if (!request.auth) throw new HttpsError('unauthenticated', 'Auth required.');
    const uid = request.auth.uid;

    try {
        const batch = db.batch();

        const comments = await db.collectionGroup('comments').where('author_uid', '==', uid).get();
        comments.forEach(d => batch.update(d.ref, { author_username: 'Deleted', author_avatar_url: null, author_uid: null }));

        const msgs = await db.collection('global_chat').where('author_uid', '==', uid).get();
        msgs.forEach(d => batch.update(d.ref, { author_username: 'Deleted', author_avatar_url: null, author_uid: null }));

        await batch.commit();
        await db.collection('users').doc(uid).delete();

        const locs = await db.collection('locations').where('user_id', '==', uid).get();
        locs.forEach(d => d.ref.delete());

        await clearMapCache();

        await admin.auth().deleteUser(uid);
        return { status: 'success', message: 'Аккаунт удален.' };
    } catch (e) {
        throw new HttpsError('internal', 'Delete error.');
    }
});