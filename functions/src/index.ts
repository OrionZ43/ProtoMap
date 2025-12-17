import { onRequest } from "firebase-functions/v2/https";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import fetch from "node-fetch";
import { FieldValue } from "firebase-admin/firestore";
import { v2 as cloudinary } from "cloudinary";
import * as crypto from 'crypto';

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

async function clearMapCache() {
    try {
        await db.collection('system').doc('map_cache').delete();
        console.log("Map cache cleared due to update.");
    } catch (e) {
        console.error("Failed to clear cache:", e);
    }
}

async function assertNotBanned(uid: string) {
    const userRef = admin.firestore().collection('users').doc(uid);
    const userSnap = await userRef.get();
    if (userSnap.exists && userSnap.data()?.isBanned) {
        throw new HttpsError('permission-denied', 'Ваш аккаунт заблокирован. Доступ к этой функции ограничен.');
    }
}

function assertEmailVerified(auth: any) {
    if (!auth.token.email_verified) {
        throw new HttpsError('permission-denied', 'Требуется подтверждение почты (Email Verification).');
    }
}

export const sendMessage = onCall(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Доступ запрещен.');

    const uid = request.auth.uid;
    await assertNotBanned(uid); // Проверка бана
    assertEmailVerified(request.auth);

    const { text, replyTo } = request.data as any;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        throw new HttpsError('invalid-argument', 'Сообщение не может быть пустым.');
    }

    // Очистка текста
    let cleanText = text;
    cleanText = cleanText.replace(/[\u0300-\u036f\u20d0-\u20ff\ufe20-\ufe2f]/g, ''); // Anti-Zalgo
    cleanText = cleanText.replace(/[\u200B-\u200D\uFEFF\u00AD]/g, ''); // Anti-Invisible
    cleanText = cleanText.trim().replace(/(\r\n|\n|\r){3,}/g, '\n\n'); // Anti-Vertical Spam

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

            // Кулдаун
            const lastMessageTime = userData.last_chat_message;
            if (lastMessageTime && Date.now() - lastMessageTime.toDate().getTime() < 3000) {
                throw new HttpsError('resource-exhausted', 'Слишком часто. Охладите трахание.');
            }

            const newMessage: any = {
                text: sanitizedText,
                author_uid: uid,
                author_username: userData.username,
                author_avatar_url: userData.avatar_url || '',
                createdAt: FieldValue.serverTimestamp(),
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
            t.update(userRef, { last_chat_message: FieldValue.serverTimestamp() });
        });
        return { status: 'success' };
    } catch (error: any) {
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', 'Ошибка сервера.');
    }
});

export const deleteComment = onCall(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Необходима авторизация.');

    const uid = request.auth.uid;
    await assertNotBanned(uid); // Забаненный не может удалять (даже свое)

    const { profileUid, commentId } = request.data;

    try {
        const commentRef = db.collection('users').doc(profileUid).collection('comments').doc(commentId);
        const commentDoc = await commentRef.get();

        if (!commentDoc.exists) throw new HttpsError('not-found', 'Комментарий не найден.');

        // Удалить может автор коммента ИЛИ владелец профиля
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
    if (!request.auth) throw new HttpsError('unauthenticated', 'Необходима авторизация.');

    const uid = request.auth.uid;
    await assertNotBanned(uid); // <--- ИСПРАВЛЕНО (была ошибка с переменной uid)
    assertEmailVerified(request.auth);

    const { profileUid, text } = request.data;

    if (!profileUid || !text || typeof text !== 'string' || !text.trim()) {
        throw new HttpsError('invalid-argument', 'Некорректные данные.');
    }
    if (text.length > 1000) throw new HttpsError('invalid-argument', 'Комментарий слишком длинный.');

    try {
        const authorDoc = await db.collection('users').doc(uid).get();
        if (!authorDoc.exists) throw new HttpsError('not-found', 'Ваш профиль не найден.');

        const authorData = authorDoc.data()!;

        await db.collection('users').doc(profileUid).collection('comments').add({
            text: text.trim(),
            author_uid: uid,
            author_username: authorData.username,
            author_avatar_url: authorData.avatar_url || '',
            author_equipped_frame: authorData.equipped_frame || null, // Добавим рамку и сюда
            createdAt: FieldValue.serverTimestamp()
        });

        return { status: 'success', message: 'Комментарий добавлен!' };
    } catch (error: any) {
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', 'Ошибка сервера.');
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
    if (!request.auth) throw new HttpsError('unauthenticated', 'Auth required.');

    const uid = request.auth.uid;
    await assertNotBanned(uid);
    assertEmailVerified(request.auth);

    // Принимаем и рамку, и фон
    const { equipped_frame, equipped_bg } = request.data;
    const userRef = db.collection('users').doc(uid);

    try {
        const userDoc = await userRef.get();
        if (!userDoc.exists) throw new HttpsError('not-found', 'User not found.');
        const userData = userDoc.data() as any;

        const updates: any = {};

        // Проверка рамки
        if (equipped_frame !== undefined) {
            if (equipped_frame !== null && !userData.owned_items?.includes(equipped_frame)) {
                throw new HttpsError('permission-denied', 'Нет прав на эту рамку.');
            }
            updates.equipped_frame = equipped_frame;
        }

        // Проверка фона
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
    if (!request.auth) throw new HttpsError('unauthenticated', 'Auth required.');

    const uid = request.auth.uid;
    await assertNotBanned(uid);
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
    if (day % 5 === 0) return 250; // День 5, 10, 15, 20, 25
    return 50 + (Math.floor((day - 1) / 5) * 10); // Постепенный рост: 50, 60, 70...
}

export const getDailyBonus = onCall(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Auth required.');

    const uid = request.auth.uid;
    await assertNotBanned(uid);
    assertEmailVerified(request.auth);

    const userRef = db.collection('users').doc(uid);

    try {
        const result = await db.runTransaction(async (t) => {
            const userDoc = await t.get(userRef);
            if (!userDoc.exists) throw new HttpsError('not-found', 'User not found.');

            const data = userDoc.data() as any;
            const lastBonus = data.last_daily_bonus ? data.last_daily_bonus.toDate() : null;
            // Текущий сохраненный стрик (то, что забрали ВЧЕРА)
            let currentStreak = data.daily_streak || 0;

            const now = new Date();

            // Если бонусов не было или цикл завершен (был 30), сбрасываем на 0
            if (currentStreak >= 30) {
                currentStreak = 0;
            }

            if (lastBonus) {
                const diff = now.getTime() - lastBonus.getTime();

                // Защита от абуза (20 часов)
                if (diff < 20 * 60 * 60 * 1000) {
                    const hoursLeft = Math.ceil((20 * 60 * 60 * 1000 - diff) / 3600000);
                    throw new HttpsError('resource-exhausted', `Бонус доступен через ${hoursLeft} ч.`);
                }

                // Если пропустил более 48 часов - сброс
                if (diff > 48 * 60 * 60 * 1000) {
                    currentStreak = 0; // Сброс на начало
                }
            }

            // Начисляем за СЛЕДУЮЩИЙ день
            const dayToClaim = currentStreak + 1;
            const bonusAmount = getRewardValue(dayToClaim);
            let rewardMessage = `День ${dayToClaim}: получено ${bonusAmount} PC.`;
            let specialReward = null;

            // Логика 30-го дня
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
                daily_streak: dayToClaim // Сохраняем новый день
            });

            return {
                status: 'success',
                message: rewardMessage,
                new_balance: newBalance,
                streak: dayToClaim, // Возвращаем актуальный день (1-30)
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

export const playSlotMachine = onCall(
    { secrets: ["TELEGRAM_BOT_TOKEN"] },
    async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Auth required.');

    const uid = request.auth.uid;
    await assertNotBanned(uid);

    const { bet } = request.data;
    const MAX_BET = 1000;

    if (typeof bet !== 'number' || bet <= 0) throw new HttpsError('invalid-argument', 'Invalid bet.');
    if (bet > MAX_BET) throw new HttpsError('invalid-argument', `Max bet is ${MAX_BET}.`);

    const userRef = db.collection('users').doc(uid);

    try {
        let notificationMessage: string | null = null;

        const result = await db.runTransaction(async (t) => {
            const userDoc = await t.get(userRef);
            if (!userDoc.exists) throw new HttpsError('not-found', 'User not found.');

            const data = userDoc.data() as any;
            const username = data.username || "Unknown";
            const credits = data.casino_credits ?? 100;

            if (credits < bet) throw new HttpsError('failed-precondition', 'Not enough credits.');

            // === ЛОГИКА СПУСКА В ЯМУ (THE DESCENT) ===
            const now = Date.now();
            const lastSpinTime = data.last_game_played ? data.last_game_played.toDate().getTime() : 0;
            const ONE_HOUR = 60 * 60 * 1000;

            let glitchLevel = data.glitch_level || 0;
            let spinsInLevel = data.spins_in_level || 0;

            // 1. Проверка на сброс КД (если прошел час - обнуляем уровень)
            if (now - lastSpinTime > ONE_HOUR) {
                glitchLevel = 0;
                spinsInLevel = 0;
            }

            // 2. Увеличение счетчика
            spinsInLevel++;

            // 3. Повышение уровня каждые 10 спинов (макс уровень 5)
            if (spinsInLevel >= 10) {
                if (glitchLevel < 5) {
                    glitchLevel++;
                }
                spinsInLevel = 0; // Сбрасываем счетчик десятка
            }

            // 4. Определение шанса Глитча от уровня
            // Уровень 0: ~3% (Стандарт)
            // Уровень 1: 10%
            // Уровень 2: 20%
            // Уровень 3: 30%
            // Уровень 4: 40%
            // Уровень 5: 50% (Смертельная зона)
            let glitchChanceThreshold = 3.1;

            if (glitchLevel === 1) glitchChanceThreshold = 10.0;
            if (glitchLevel === 2) glitchChanceThreshold = 20.0;
            if (glitchLevel === 3) glitchChanceThreshold = 30.0;
            if (glitchLevel === 4) glitchChanceThreshold = 40.0;
            if (glitchLevel === 5) glitchChanceThreshold = 50.0;

            // ==========================================

            // === КРИПТО-РАНДОМ ===
            const randomInt = crypto.randomInt(0, 10000); // 0 - 9999
            const randPercent = randomInt / 100; // 0.00 - 99.99

            const newBalanceAfterBet = credits - bet;
            let finalReels: string[] = [];
            let winMultiplier = 0;
            let lossAmount = 0;

            // === ТАБЛИЦА ВЕРОЯТНОСТЕЙ ===

            // 1. ДЖЕКПОТ (0.1%)
            // Шанс джекпота не меняется от уровня, мечта должна жить
            if (randPercent < 0.1) {
                finalReels = ['protomap_logo', 'protomap_logo', 'protomap_logo'];
                winMultiplier = 100;
                const win = Math.floor(bet * 100);
                notificationMessage = `🚨 *JACKPOT ALERT!* 🚨\n\nИгрок *${username}* выжил в Бездне!\nУровень угрозы: ${glitchLevel}\nВыигрыш: *${win} PC* 💎`;
            }
            // 2. ГЛИТЧ (Динамический шанс!)
            // Если randPercent попадает в зону риска (например, < 50 на 5 уровне)
            else if (randPercent < glitchChanceThreshold) {
                finalReels = ['glitch-6', 'glitch-6', 'glitch-6'];
                lossAmount = Math.floor(bet * 2) + 666;
                notificationMessage = `☠️ *GLITCHED [LVL ${glitchLevel}]* ☠️\n\n*${username}* поглощен Бездной.\nПотеряно: *${lossAmount} PC*.`;
            }
            // 3. СЕРДЦА (2%)
            else if (randPercent < (glitchChanceThreshold + 2.0)) {
                finalReels = ['heart', 'heart', 'heart'];
                winMultiplier = 10;
                const win = Math.floor(bet * 10);
                if (win >= 2000) notificationMessage = `🔥 *BIG WIN!* 🔥\n\n*${username}* (Lvl ${glitchLevel}) поднял *${win} PC*!`;
            }
            // 4. БАРАНЫ (7%)
            else if (randPercent < (glitchChanceThreshold + 9.0)) {
                finalReels = ['ram', 'ram', 'ram'];
                winMultiplier = 5;
            }
            // 5. ЛАПКИ (15%)
            else if (randPercent < (glitchChanceThreshold + 24.0)) {
                finalReels = ['paw', 'paw', 'paw'];
                winMultiplier = 2;
            }
            // 6. ПРОИГРЫШ
            else {
                const sym = ['paw', 'ram', 'heart', 'protomap_logo'];
                do {
                    finalReels = [
                        sym[crypto.randomInt(0, 4)],
                        sym[crypto.randomInt(0, 4)],
                        sym[crypto.randomInt(0, 4)]
                    ];
                } while (finalReels[0] === finalReels[1] && finalReels[1] === finalReels[2]);
            }

            const win = Math.floor(bet * winMultiplier);
            const finalCalc = newBalanceAfterBet + win - lossAmount;
            const final = finalCalc < 0 ? 0 : finalCalc;

            t.update(userRef, {
                casino_credits: final,
                last_game_played: FieldValue.serverTimestamp(),
                glitch_level: glitchLevel,
                spins_in_level: spinsInLevel
            });

            return {
                reels: finalReels,
                winAmount: win,
                lossAmount,
                newBalance: final,
                // Возвращаем данные о текущем уровне, чтобы фронтенд мог пугать игрока
                currentGlitchLevel: glitchLevel,
                spinsToNextLevel: 10 - spinsInLevel
            };
        });

        if (notificationMessage) {
            sendToCasinoChat(notificationMessage).catch(console.error);
        }

        return { data: result };
    } catch (error: any) {
        if (error.code) throw error;
        throw new HttpsError('internal', 'Game error.');
    }
});

export const playCoinFlip = onCall(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Auth required.');

    const uid = request.auth.uid;
    await assertNotBanned(uid);
    assertEmailVerified(request.auth);

    const { bet, choice } = request.data;
    if (typeof bet !== 'number' || bet <= 0) throw new HttpsError('invalid-argument', 'Invalid bet.');

    const userRef = db.collection('users').doc(uid);

    try {
        const result = await db.runTransaction(async (t) => {
            const userDoc = await t.get(userRef);
            if (!userDoc.exists) throw new HttpsError('not-found', 'User not found.');

            const data = userDoc.data() as any;
            const credits = data.casino_credits ?? 100;

            if (credits < bet) throw new HttpsError('failed-precondition', 'Недостаточно средств.');

            const winMultiplier = 1.95;
            const outcome = Math.random() < 0.5 ? 'heads' : 'tails';
            const hasWon = choice === outcome;

            let final = credits - bet;
            if (hasWon) final += Math.floor(bet * winMultiplier);

            t.update(userRef, { casino_credits: final });

            return { outcome, hasWon, newBalance: final, creditsChange: final - credits };
        });
        return { data: result };
    } catch (error: any) {
        if (error.code) throw error;
        throw new HttpsError('internal', 'Game error.');
    }
});

export const getLeaderboard = onCall(async (request) => {
    // Проверка авторизации
    if (!request.auth) throw new HttpsError('unauthenticated', 'Auth required.');

    try {
        // Берем топ-10 богачей
        const snapshot = await db.collection('users')
            .orderBy('casino_credits', 'desc')
            .limit(10)
            .get();

        const leaderboard = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                username: data.username || 'Неизвестный',
                avatar_url: data.avatar_url || '',
                casino_credits: data.casino_credits || 0,
                equipped_frame: data.equipped_frame || null
            };
        });

        return { data: leaderboard };

    } catch (error) {
        console.error("Leaderboard error:", error);
        throw new HttpsError('internal', 'Не удалось загрузить списки лидеров.');
    }
});

// --- GEOCODING HELPERS ---
async function getDistrictCenterCoords(lat: number, lng: number): Promise<[string, number, number] | null> {
    const userAgent = process.env.NOMINATIM_USER_AGENT || 'ProtoMap/1.0';
    try {
        // 1. Reverse Geocoding (Узнаем адрес по координатам)
        // zoom=18 дает подробный адрес, zoom=10 - только город/штат
        const revUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ru&zoom=18`;
        const revRes = await fetch(revUrl, { headers: { 'User-Agent': userAgent } });
        if (!revRes.ok) return null;

        const revData = await revRes.json() as any;
        if (!revData.address) return null;

        const addr = revData.address;

        // Определяем основные компоненты адреса (С учетом специфики США и мелких поселков)
        const cityName = addr.city || addr.town || addr.village || addr.hamlet || addr.municipality || addr.county;
        const stateName = addr.state || addr.region || addr.province; // <--- ВАЖНО: Штат/Регион
        const countryName = addr.country;

        const locationHierarchy = {
            microdistrict: addr.suburb || addr.neighbourhood || addr.residential,
            district: addr.city_district || addr.borough || addr.quarter,
            city: cityName,
            state: stateName,
            country: countryName
        };

        // Уровни поиска от точного к общему
        const attempts = [
            { level: 'Micro', q: locationHierarchy.microdistrict },
            { level: 'District', q: locationHierarchy.district },
            { level: 'City', q: locationHierarchy.city }
        ];

        for (const attempt of attempts) {
            if (!attempt.q) continue;

            // СБОРКА ЗАПРОСА: [Район, Город, Штат, Страна]
            // Добавление Штата критично для США, где куча городов с одинаковыми именами
            const queryParts = [
                attempt.q,
                // Если мы ищем район, добавляем город для уточнения
                (attempt.level !== 'City' && attempt.q !== locationHierarchy.city) ? locationHierarchy.city : null,
                locationHierarchy.state,
                locationHierarchy.country
            ].filter(Boolean);

            const q = queryParts.join(', ');

            // Delay to be nice to Nominatim
            await new Promise(r => setTimeout(r, 1000));

            const searchUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=ru&q=${encodeURIComponent(q)}`;
            const searchRes = await fetch(searchUrl, { headers: { 'User-Agent': userAgent } });

            if (!searchRes.ok) continue;

            const searchData = await searchRes.json() as any[];
            if (searchData && searchData.length > 0) {
                // Мы нашли координаты центра!
                return [attempt.q, parseFloat(searchData[0].lat), parseFloat(searchData[0].lon)];
            }
        }

        // ФОЛЛБЭК (Если центр не найден):
        // Если город определился, но его центр найти не удалось (часто в деревнях),
        // используем исходные координаты с небольшим смещением (Jitter), чтобы сохранить анонимность.
        if (cityName) {
             const jitterLat = lat + (Math.random() - 0.5) * 0.01; // +/- ~500м
             const jitterLng = lng + (Math.random() - 0.5) * 0.01;
             return [cityName, jitterLat, jitterLng];
        }

        return null;
    } catch (e) {
        console.error("Geocoding Error:", e);
        return null;
    }
}

export const addOrUpdateLocation = onRequest({ cors: false }, async (request, response) => {
    if (handleCors(request, response)) return;

    const idToken = request.headers.authorization?.split('Bearer ')[1];
    if (!idToken) { response.status(401).json({ error: "Unauthorized" }); return; }

    try {
        const decoded = await admin.auth().verifyIdToken(idToken);
        const uid = decoded.uid;

        const userDoc = await db.collection("users").doc(uid).get();
        if (userDoc.exists && userDoc.data()?.isBanned) {
            response.status(403).json({ error: "Banned" });
            return;
        }

        // Получаем флаг isManual (Ручная установка)
        const { lat, lng, isManual } = request.body.data;

        if (!lat || !lng) { response.status(400).json({ error: "Invalid coords" }); return; }

        let finalLat = lat;
        let finalLng = lng;
        let cityName = "Unknown Location";

        if (isManual) {
            // === РУЧНОЙ РЕЖИМ (Точность) ===
            // Мы не ищем центр города, мы оставляем координаты как есть.
            // Но нам нужно узнать название места для красоты.
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
            // === АВТО РЕЖИМ (Анонимность) ===
            // Ищем центр района/города
            const place = await getDistrictCenterCoords(lat, lng);
            if (!place) { response.status(400).json({ error: "Geocoding failed" }); return; }

            cityName = place[0];
            finalLat = place[1];
            finalLng = place[2];
        }

        const locRef = db.collection("locations");
        const q = await locRef.where("user_id", "==", uid).limit(1).get();

        if (!q.empty) {
            await locRef.doc(q.docs[0].id).update({ latitude: finalLat, longitude: finalLng, city: cityName });
        } else {
            await locRef.add({ latitude: finalLat, longitude: finalLng, city: cityName, user_id: uid });
        }

        await clearMapCache();

        response.status(200).json({ data: {
            status: 'success',
            message: isManual ? 'Координаты установлены точно!' : 'Геолокация обновлена (Центр района).',
            foundCity: cityName,
            placeLat: finalLat,
            placeLng: finalLng
        }});

    } catch (error) {
        console.error(error);
        response.status(500).json({ error: "Server Error" });
    }
});

export const getLocations = onRequest({ cors: false }, async (request, response) => {
    if (handleCors(request, response)) return;

    // CDN кэширование (тоже помогает)
    response.set('Cache-Control', 'public, max-age=300, s-maxage=600');

    const CACHE_DOC_REF = db.collection('system').doc('map_cache');
    const CACHE_DURATION_MS = 24 * 60 * 60 * 1000;

    try {
        const now = Date.now();

        // 1. Попытка прочитать КЭШ (Всего 1 чтение!)
        const cacheSnap = await CACHE_DOC_REF.get();
        let cacheData = cacheSnap.exists ? cacheSnap.data() : null;

        // Проверяем, свежий ли кэш
        if (cacheData && cacheData.updatedAt && (now - cacheData.updatedAt.toMillis() < CACHE_DURATION_MS)) {
            // КЭШ СВЕЖИЙ! Отдаем его и экономим деньги.
            // payload храним как JSON-строку, чтобы не превышать лимиты полей
            response.status(200).json({ data: JSON.parse(cacheData.payload) });
            return;
        }

        // 2. Если кэш протух или его нет — делаем "ДОРОГУЮ" сборку (N чтений)
        console.log("Cache expired or missing. Rebuilding map data...");

        const locSnap = await db.collection("locations").get();
        if (locSnap.empty) {
            response.status(200).json({ data: [] });
            return;
        }

        const userIds = [...new Set(locSnap.docs.map(d => d.data().user_id).filter(Boolean))];
        const usersMap = new Map();

        // Batch fetching users (как и было)
        for (let i = 0; i < userIds.length; i += 30) {
            const chunk = userIds.slice(i, i + 30);
            const uSnap = await db.collection("users").where(admin.firestore.FieldPath.documentId(), "in", chunk).get();
            uSnap.forEach(doc => usersMap.set(doc.id, doc.data()));
        }

        // Собираем чистый массив данных (минимальный вес)
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

        // 3. Сохраняем новый слепок в базу (1 запись)
        // Чтобы следующие юзеры читали уже его
        await CACHE_DOC_REF.set({
            payload: JSON.stringify(results), // Сжимаем в строку
            updatedAt: FieldValue.serverTimestamp()
        });

        response.status(200).json({ data: results });

    } catch (e) {
        console.error("Map Error:", e);
        response.status(500).json({ error: "Error fetching map" });
    }
});

export const deleteLocation = onCall({ cors: ALLOWED_ORIGINS }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Auth required.');

    const uid = request.auth.uid;
    await assertNotBanned(uid);

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
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");

    const uid = request.auth.uid;
    await assertNotBanned(uid);

    const data = request.data;
    const fields: any = {};

    if (typeof data.status === 'string') fields.status = data.status.trim().substring(0, 100);
    if (typeof data.about_me === 'string') fields.about_me = data.about_me.trim();

    if (data.socials) {
        for (const [k, v] of Object.entries(data.socials)) {
            if (['telegram', 'discord', 'vk', 'twitter', 'website'].includes(k) && typeof v === 'string') {
                const val = v.trim();
                if (val) fields[`socials.${k}`] = val;
                else fields[`socials.${k}`] = FieldValue.delete();
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
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");

    const uid = request.auth.uid;
    await assertNotBanned(uid);

    const { imageBase64 } = request.data;
    if (!imageBase64?.startsWith('data:image/')) throw new HttpsError("invalid-argument", "Bad image.");

    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
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
    // Экранируем символы, которые Telegram считает разметкой
    const charsToEscape = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
    let escapedText = sourceText;
    for (const char of charsToEscape) {
        escapedText = escapedText.replace(new RegExp('\\' + char, 'g'), '\\' + char);
    }
    return escapedText;
}

// --- ФУНКЦИЯ ЖАЛОБ ---
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
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Auth required.");
        }

        const reporterUid = request.auth.uid;

        // 1. ПРОВЕРКА БАНА (Оставляем защиту!)
        await assertNotBanned(reporterUid);

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
            // 2. ЕСЛИ ЭТО КОММЕНТАРИЙ - ПОЛУЧАЕМ ЕГО ТЕКСТ
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

            // 3. СОХРАНЯЕМ В БАЗУ (Для истории)
            await db.collection('reports').add({
                type,
                reportedContentId,
                profileOwnerUid,
                reporterUid,
                reason,
                reportedUsername: reportedUsername || null,
                reporterUsername: reporterUsername || null,
                profileOwnerUsername: profileOwnerUsername || null,
                reportedContentText: reportedContentText || null, // Сохраняем текст нарушения
                status: 'new',
                createdAt: FieldValue.serverTimestamp()
            });

            // 4. ОТПРАВЛЯЕМ КРАСИВОЕ УВЕДОМЛЕНИЕ В TELEGRAM
            const botToken = process.env.TELEGRAM_BOT_TOKEN;
            const chatId = process.env.TELEGRAM_CHAT_ID;

            if (botToken && chatId) {
                const baseUrl = "https://proto-map.vercel.app/profile/";

                // Формируем ссылки [Text](URL)
                const reporterLink = reporterUsername
                    ? `[${escapeMarkdownV2(reporterUsername)}](${baseUrl}${escapeMarkdownV2(reporterUsername)})`
                    : `\`${reporterUid}\``;

                const reportedUserLink = reportedUsername
                    ? `[${escapeMarkdownV2(reportedUsername)}](${baseUrl}${escapeMarkdownV2(reportedUsername)})`
                    : `\`UID: ${reportedContentId}\``;

                const profileLink = profileOwnerUsername
                    ? `[${escapeMarkdownV2(profileOwnerUsername)}](${baseUrl}${escapeMarkdownV2(profileOwnerUsername)})`
                    : `\`${profileOwnerUid}\``;

                // Собираем сообщение
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

                // Отправляем
                await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: message,
                        parse_mode: 'MarkdownV2', // Важно для жирного текста и ссылок
                        disable_web_page_preview: true // Чтобы не засорять чат превьюшками профилей
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
    if (!request.auth) throw new HttpsError('unauthenticated', 'Auth required.');
    const uid = request.auth.uid;

    try {
        const batch = db.batch();

        // Анонимизация комментариев
        const comments = await db.collectionGroup('comments').where('author_uid', '==', uid).get();
        comments.forEach(d => batch.update(d.ref, { author_username: 'Deleted', author_avatar_url: null, author_uid: null }));

        // Анонимизация чата
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