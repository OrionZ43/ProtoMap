import { onRequest } from "firebase-functions/v2/https";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import fetch from "node-fetch";
import { FieldValue } from "firebase-admin/firestore";
import { v2 as cloudinary } from "cloudinary";

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

// --- ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ПРОВЕРКИ БАНА ---
async function assertNotBanned(uid: string) {
    const userRef = admin.firestore().collection('users').doc(uid);
    const userSnap = await userRef.get();
    if (userSnap.exists && userSnap.data()?.isBanned) {
        throw new HttpsError('permission-denied', 'Ваш аккаунт заблокирован. Доступ к этой функции ограничен.');
    }
}
// ---------------------------------------------

export const sendMessage = onCall(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Доступ запрещен.');

    const uid = request.auth.uid;
    await assertNotBanned(uid); // Проверка бана

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

    const { equipped_frame } = request.data;
    const userRef = db.collection('users').doc(uid);

    try {
        const userDoc = await userRef.get();
        if (!userDoc.exists) throw new HttpsError('not-found', 'User not found.');
        const userData = userDoc.data() as any;

        if (equipped_frame !== null && !userData.owned_items?.includes(equipped_frame)) {
            throw new HttpsError('permission-denied', 'Вы не владеете этим предметом.');
        }

        await userRef.update({ equipped_frame });
        return { data: { status: 'success', message: 'Сохранено!' } };
    } catch (error: any) {
        if (error.code) throw error;
        throw new HttpsError('internal', 'Error saving items.');
    }
});

export const purchaseShopItem = onCall({ cors: ALLOWED_ORIGINS }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Auth required.');

    const uid = request.auth.uid;
    await assertNotBanned(uid);

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

export const playSlotMachine = onCall(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Auth required.');

    const uid = request.auth.uid;
    await assertNotBanned(uid);

    const { bet } = request.data;
    if (typeof bet !== 'number' || bet <= 0) throw new HttpsError('invalid-argument', 'Invalid bet.');

    const userRef = db.collection('users').doc(uid);

    try {
        const result = await db.runTransaction(async (t) => {
            const userDoc = await t.get(userRef);
            if (!userDoc.exists) throw new HttpsError('not-found', 'User not found.');

            const data = userDoc.data() as any;
            const credits = data.casino_credits ?? 100;

            if (credits < bet) throw new HttpsError('failed-precondition', 'Недостаточно средств.');

            const newBalanceAfterBet = credits - bet;
            let finalReels: string[] = [];
            let winMultiplier = 0;
            let lossAmount = 0;

            const rand = Math.random() * 100;

            if (rand < 0.1) { finalReels = ['protomap_logo', 'protomap_logo', 'protomap_logo']; winMultiplier = 100; }
            else if (rand < 3.1) { finalReels = ['glitch-6', 'glitch-6', 'glitch-6']; lossAmount = 666; }
            else if (rand < 5.1) { finalReels = ['heart', 'heart', 'heart']; winMultiplier = 25; }
            else if (rand < 12.1) { finalReels = ['ram', 'ram', 'ram']; winMultiplier = 10; }
            else if (rand < 27.1) { finalReels = ['paw', 'paw', 'paw']; winMultiplier = 5; }
            else {
                const sym = ['paw', 'ram', 'heart', 'protomap_logo'];
                do {
                    finalReels = [sym[Math.floor(Math.random()*4)], sym[Math.floor(Math.random()*4)], sym[Math.floor(Math.random()*4)]];
                } while (finalReels[0] === finalReels[1] && finalReels[1] === finalReels[2]);
            }

            const win = Math.floor(bet * winMultiplier);
            const final = Math.max(0, newBalanceAfterBet + win - lossAmount);

            t.update(userRef, { casino_credits: final, last_game_played: FieldValue.serverTimestamp() });

            return { reels: finalReels, winAmount: win, lossAmount, newBalance: final };
        });
        return { data: result };
    } catch (error: any) {
        if (error.code) throw error;
        throw new HttpsError('internal', 'Game error.');
    }
});

export const getDailyBonus = onCall(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Auth required.');

    const uid = request.auth.uid;
    await assertNotBanned(uid);

    const userRef = db.collection('users').doc(uid);

    try {
        const result = await db.runTransaction(async (t) => {
            const userDoc = await t.get(userRef);
            if (!userDoc.exists) throw new HttpsError('not-found', 'User not found.');

            const data = userDoc.data() as any;
            const lastBonus = data.last_daily_bonus;
            const now = Date.now();
            const dayMs = 24 * 60 * 60 * 1000;

            if (lastBonus && (now - lastBonus.toDate().getTime() < dayMs)) {
                const wait = Math.ceil((dayMs - (now - lastBonus.toDate().getTime())) / 3600000);
                return { status: 'error', message: `Ждите еще ${wait} ч.` };
            }

            const newBalance = (data.casino_credits ?? 100) + 25;
            t.update(userRef, { casino_credits: newBalance, last_daily_bonus: FieldValue.serverTimestamp() });
            return { status: 'success', message: 'Бонус получен!', new_balance: newBalance };
        });

        if (result.status === 'success') return { data: result };
        throw new HttpsError('resource-exhausted', result.message);
    } catch (error: any) {
        if (error.code === 'resource-exhausted') throw error;
        throw new HttpsError('internal', 'Bonus error.');
    }
});

export const playCoinFlip = onCall(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Auth required.');

    const uid = request.auth.uid;
    await assertNotBanned(uid);

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
        // 1. Reverse
        const revUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ru&zoom=18`;
        const revRes = await fetch(revUrl, { headers: { 'User-Agent': userAgent } });
        if (!revRes.ok) return null;
        const revData = await revRes.json() as any;
        if (!revData.address) return null;

        const addr = revData.address;
        const locationHierarchy = {
            microdistrict: addr.suburb || addr.quarter || addr.neighbourhood,
            district: addr.city_district || addr.borough,
            city: addr.city || addr.town || addr.village,
            country: addr.country
        };

        const attempts = [
            { level: 'Micro', q: locationHierarchy.microdistrict },
            { level: 'District', q: locationHierarchy.district },
            { level: 'City', q: locationHierarchy.city }
        ];

        for (const attempt of attempts) {
            if (!attempt.q) continue;
            const q = [attempt.q, locationHierarchy.city, locationHierarchy.country].filter(Boolean).join(', ');

            // Delay to be nice to Nominatim
            await new Promise(r => setTimeout(r, 1000));

            const searchUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=ru&q=${encodeURIComponent(q)}`;
            const searchRes = await fetch(searchUrl, { headers: { 'User-Agent': userAgent } });
            if (!searchRes.ok) continue;

            const searchData = await searchRes.json() as any[];
            if (searchData && searchData.length > 0) {
                return [attempt.q, parseFloat(searchData[0].lat), parseFloat(searchData[0].lon)];
            }
        }
        return null;
    } catch (e) { return null; }
}

export const addOrUpdateLocation = onRequest({ cors: false }, async (request, response) => {
    if (handleCors(request, response)) return;

    const idToken = request.headers.authorization?.split('Bearer ')[1];
    if (!idToken) { response.status(401).json({ error: "Unauthorized" }); return; }

    try {
        const decoded = await admin.auth().verifyIdToken(idToken);
        const uid = decoded.uid;

        // Проверка бана для onRequest
        const userDoc = await db.collection("users").doc(uid).get();
        if (userDoc.exists && userDoc.data()?.isBanned) {
            response.status(403).json({ error: "Banned" });
            return;
        }

        const { lat, lng } = request.body.data;
        if (!lat || !lng) { response.status(400).json({ error: "Invalid coords" }); return; }

        const place = await getDistrictCenterCoords(lat, lng);
        if (!place) { response.status(400).json({ error: "Geocoding failed" }); return; }

        const [city, pLat, pLng] = place;
        const locRef = db.collection("locations");
        const q = await locRef.where("user_id", "==", uid).limit(1).get();

        if (!q.empty) {
            await locRef.doc(q.docs[0].id).update({ latitude: pLat, longitude: pLng, city });
        } else {
            await locRef.add({ latitude: pLat, longitude: pLng, city, user_id: uid });
        }

        response.status(200).json({ data: { status: 'success', message: 'Метка обновлена!', foundCity: city, placeLat: pLat, placeLng: pLng } });

    } catch (error) {
        console.error(error);
        response.status(500).json({ error: "Server Error" });
    }
});

export const getLocations = onRequest({ cors: false }, async (request, response) => {
    if (handleCors(request, response)) return;
    response.set('Cache-Control', 'public, max-age=300, s-maxage=300');

    try {
        const locSnap = await db.collection("locations").get();
        if (locSnap.empty) { response.status(200).json({ data: [] }); return; }

        const userIds = [...new Set(locSnap.docs.map(d => d.data().user_id).filter(Boolean))];
        const usersMap = new Map();

        // Batch fetching users
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
                lat: loc.latitude, lng: loc.longitude, city: loc.city,
                user: {
                    username: user.username || "Unknown",
                    avatar_url: user.avatar_url || null,
                    status: user.status || null,
                    equipped_frame: user.equipped_frame || null
                }
            };
        }).filter(Boolean);

        response.status(200).json({ data: results });
    } catch (e) {
        response.status(500).json({ error: "Error" });
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
        return { avatarUrl: res.secure_url };
    } catch (e) {
        throw new HttpsError("internal", "Upload failed.");
    }
});

export const reportContent = onCall({ secrets: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"] }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");

    const uid = request.auth.uid;
    await assertNotBanned(uid);

    const { type, reportedContentId, profileOwnerUid, reason, reportedUsername, reporterUsername } = request.data;
    if (!reason) throw new HttpsError("invalid-argument", "No reason.");

    try {
        await db.collection('reports').add({
            type, reportedContentId, profileOwnerUid, reporterUid: uid, reason,
            reportedUsername, reporterUsername, status: 'new', createdAt: FieldValue.serverTimestamp()
        });

        // Telegram Notification
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;
        if (botToken && chatId) {
            const msg = `🚨 REPORT: ${type}\nFrom: ${reporterUsername}\nReason: ${reason}`;
            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: msg })
            });
        }
        return { success: true, message: "Отправлено." };
    } catch (e) {
        throw new HttpsError("internal", "Report error.");
    }
});

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

        await admin.auth().deleteUser(uid);
        return { status: 'success', message: 'Аккаунт удален.' };
    } catch (e) {
        throw new HttpsError('internal', 'Delete error.');
    }
});