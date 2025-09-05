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

const ALLOWED_ORIGINS = ["http://localhost:5173",
    "https://proto-map.vercel.app" ];

    const handleCors = (request: any, response: any): boolean => {
    const origin = request.headers.origin as string;

    // ЛОГИРОВАНИЕ ДЛЯ ОТЛАДКИ
    console.log(`[CORS] Request received from origin: ${origin}`);
    console.log(`[CORS] Request method: ${request.method}`);
    console.log(`[CORS] Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);

    if (ALLOWED_ORIGINS.includes(origin)) {
        response.set('Access-Control-Allow-Origin', origin);
        console.log(`[CORS] Origin '${origin}' is allowed. 'Access-Control-Allow-Origin' header set.`);
    } else {
        console.warn(`[CORS] Origin '${origin}' is NOT in the allowed list.`);
    }

    if (request.method === 'OPTIONS') {
        console.log('[CORS] Preflight (OPTIONS) request detected. Sending headers and 204 status.');
        response.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        response.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        response.status(204).send('');
        return true;
    }

    console.log('[CORS] Not a preflight request. Continuing to function logic.');
    return false;
};

export const checkUsername = onRequest(
  { cors: false },
  async (request, response) => {
    if (handleCors(request, response)) { return; }
    if (request.method !== "POST") {
      response.status(405).send("Method Not Allowed");
      return;
    }

    const username = request.body.data.username;

    if (!username || typeof username !== "string" || username.length < 4) {
      response.status(400).json({ error: { message: "Имя пользователя не предоставлено или слишком короткое" } });
      return;
    }

    try {
      const usersRef = db.collection("users");
      const snapshot = await usersRef.where("username", "==", username).limit(1).get();
      const resultData = {
        isAvailable: snapshot.empty,
      };

      response.status(200).json({ data: resultData });

    } catch (error) {
      console.error("Error checking username:", error);
      response.status(500).json({ error: { message: "Internal server error" } });
    }
  },
);

async function getDistrictCenterCoords(lat: number, lng: number): Promise<[string, number, number] | null> {
    const userAgent = process.env.NOMINATIM_USER_AGENT || 'ProtoMap/1.0 (kovalevd418@gmail.com)';

    try {
        const reverseGeocodeUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ru&zoom=18`;
        console.log(`Этап 1: Запрос к Nominatim для (${lat}, ${lng})`);

        const reverseResponse = await fetch(reverseGeocodeUrl, { headers: { 'User-Agent': userAgent } });
        if (!reverseResponse.ok) throw new Error(`Nominatim reverse API failed`);
        const reverseData = await reverseResponse.json() as any;

        if (!reverseData || !reverseData.address) {
            console.error("Этап 1: Nominatim не вернул 'address' в ответе.");
            return null;
        }

        const address = reverseData.address;
        console.log("Этап 1: Получен адрес:", address);

        const locationHierarchy = {
            microdistrict: address.suburb || address.quarter || address.neighbourhood,
            district: address.city_district || address.borough,
            city: address.city || address.town || address.village,
            country: address.country
        };

        const searchAttempts = [
            { level: 'Микрорайон', query: locationHierarchy.microdistrict },
            { level: 'Район города', query: locationHierarchy.district },
            { level: 'Город/НП', query: locationHierarchy.city }
        ];

        for (const attempt of searchAttempts) {
            if (!attempt.query) {
                console.log(`Пропускаем уровень '${attempt.level}', так как он не определен.`);
                continue;
            }

            const queryParts = [
                attempt.query,
                locationHierarchy.city,
                locationHierarchy.country
            ].filter((part, index, self) => part && self.indexOf(part) === index);

            const searchQuery = queryParts.join(', ');

            console.log(`Попытка поиска для уровня '${attempt.level}' по строке: "${searchQuery}"`);

            const forwardUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=ru&q=${encodeURIComponent(searchQuery)}`;

            await new Promise(resolve => setTimeout(resolve, 1100));

            const forwardResponse = await fetch(forwardUrl, { headers: { 'User-Agent': userAgent } });
            if (!forwardResponse.ok) {
                console.warn(`Запрос для уровня '${attempt.level}' не удался, пробую следующий...`);
                continue;
            }

            const forwardData = await forwardResponse.json() as any[];

            if (forwardData && forwardData.length > 0) {
                const placeLocation = forwardData[0];
                const placeLat = parseFloat(placeLocation.lat);
                const placeLng = parseFloat(placeLocation.lon);
                console.log(`УСПЕХ на уровне '${attempt.level}'! Найдены координаты: ${placeLat}, ${placeLng}`);

                return [attempt.query, placeLat, placeLng];
            } else {
                console.log(`На уровне '${attempt.level}' ничего не найдено, пробую следующий...`);
            }
        }

        console.error("Все попытки геокодирования провалились.");
        return null;

    } catch (error) {
        console.error("Глобальная ошибка в getDistrictCenterCoords:", error);
        return null;
    }
}

export const addOrUpdateLocation = onRequest(
  { cors: false }, // <-- ИЗМЕНЕНИЕ
  async (request, response) => {
    if (handleCors(request, response)) { return; }
    const idToken = request.headers.authorization?.split('Bearer ')[1];
    if (!idToken) {
        response.status(401).json({ error: { message: "Unauthorized: No token provided" } });
        return;
    }

    let decodedToken;
    try {
        decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (error) {
        response.status(401).json({ error: { message: "Unauthorized: Invalid token" } });
        return;
    }

    const user_id = decodedToken.uid;
    const { lat, lng } = request.body.data;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      response.status(400).json({ error: { message: "Invalid coordinates" } });
      return;
    }

    const placeDetails = await getDistrictCenterCoords(lat, lng);
    if (!placeDetails) {
      response.status(400).json({ error: { message: "Не удалось определить местоположение (геокодер)." } });
      return;
    }
    const [place_name, place_lat, place_lng] = placeDetails;

    const locationsCollection = db.collection("locations");

    try {
        const querySnapshot = await locationsCollection.where("user_id", "==", user_id).limit(1).get();
        let action_message: string;
        let statusCode = 200;

        if (!querySnapshot.empty) {
            const docId = querySnapshot.docs[0].id;
            await locationsCollection.doc(docId).update({
                latitude: place_lat,
                longitude: place_lng,
                city: place_name,
            });
            action_message = "Ваша метка обновлена!";
        } else {
            await locationsCollection.add({
                latitude: place_lat,
                longitude: place_lng,
                city: place_name,
                user_id: user_id,
            });
            action_message = "Ваша метка добавлена!";
            statusCode = 201;
        }

        response.status(statusCode).json({
            data: {
                status: 'success',
                message: action_message,
                foundCity: place_name,
                placeLat: place_lat,
                placeLng: place_lng
            }
        });

    } catch (error) {
        console.error("Error saving location:", error);
        response.status(500).json({ error: { message: "Internal server error" } });
    }
  }
);

export const getLocations = onRequest(
  { cors: false }, // <-- ИЗМЕНЕНИЕ
  async (request, response) => {
    if (handleCors(request, response)) { return; }

    try {
      const locationsSnapshot = await db.collection("locations").get();
      if (locationsSnapshot.empty) {
        response.status(200).json({ data: [] });
        return;
      }

      const userIds = [...new Set(locationsSnapshot.docs.map((doc) => doc.data().user_id).filter(Boolean))];

      if (userIds.length === 0) {
        response.status(200).json({ data: [] });
        return;
      }

      const usersMap = new Map<string, any>();
      const chunkPromises: Promise<void>[] = [];

      for (let i = 0; i < userIds.length; i += 30) {
          const chunk = userIds.slice(i, i + 30);

          const promise = db.collection("users")
              .where(admin.firestore.FieldPath.documentId(), "in", chunk)
              .get()
              .then(usersSnapshot => {
                  usersSnapshot.forEach((doc) => {
                      usersMap.set(doc.id, doc.data());
                  });
              });

          chunkPromises.push(promise);
      }

      await Promise.all(chunkPromises);

      const results = locationsSnapshot.docs.map((doc) => {
        const locationData = doc.data();
        const userData = usersMap.get(locationData.user_id);

        return {
          lat: locationData.latitude,
          lng: locationData.longitude,
          city: locationData.city,
          user: userData ? userData.username : "неизвестно",
          avatar_url: userData ? (userData.avatar_url || null) : null,
        };
      }).filter(item => item.user !== "неизвестно");

      response.status(200).json({ data: results });

    } catch (error) {
      console.error("Error fetching locations:", error);
      response.status(500).json({ error: { message: "Internal server error" } });
    }
  },
);

export const deleteLocation = onCall(
  { cors: ALLOWED_ORIGINS },
  async (request) => {
    if (!request.auth) {
      console.log("Вызов deleteLocation без аутентификации.");
      throw new HttpsError(
        'unauthenticated',
        'Для выполнения этой операции необходимо войти в систему.'
      );
    }

    const user_id = request.auth.uid;

    try {
      console.log(`Удаление метки для UserID=${user_id}`);
      const querySnapshot = await db.collection("locations").where("user_id", "==", user_id).limit(1).get();

      if (!querySnapshot.empty) {
        const docId = querySnapshot.docs[0].id;
        await db.collection("locations").doc(docId).delete();
        console.log(`Метка для UserID=${user_id} удалена.`);
        return { status: 'success', message: 'Ваша метка удалена.' };
      } else {
        console.log(`Метка для UserID=${user_id} не найдена.`);
        return { status: 'success', message: 'Метка не найдена.' };
      }
    } catch (error) {
      console.error("Ошибка удаления метки:", error);
      throw new HttpsError('internal', 'Ошибка сервера при удалении метки.');
    }
  }
);

interface ProfileData {
    about_me: string;
    socials: {
        telegram: string;
        discord: string;
        vk: string;
        twitter: string;
        website: string;
    }
}

export const updateProfileData = onCall<ProfileData>(
    {},
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Необходимо войти в систему для обновления профиля.");
        }

        const uid = request.auth.uid;
        const data = request.data;

        if (!data) {
            throw new HttpsError("invalid-argument", "Данные для обновления не предоставлены.");
        }

        const fieldsToUpdate: { [key: string]: any } = {};

        if (typeof data.about_me === 'string') {
            fieldsToUpdate.about_me = data.about_me.trim();
        }

        if (data.socials && typeof data.socials === 'object') {
            for (const [key, rawValue] of Object.entries(data.socials)) {

                if (['telegram', 'discord', 'vk', 'twitter', 'website'].includes(key)) {

                    if (typeof rawValue === 'string') {
                        let cleanedValue = rawValue.trim();

                        if (key === 'vk' || key === 'twitter') {
                            cleanedValue = cleanedValue.replace(/\s/g, '');
                        }
                        if (key === 'telegram') {
                            cleanedValue = cleanedValue.replace(/\s/g, '').replace(/^@/, '');
                        }

                        if (cleanedValue) {
                            fieldsToUpdate[`socials.${key}`] = cleanedValue;
                        } else {
                            fieldsToUpdate[`socials.${key}`] = FieldValue.delete();
                        }
                    }
                }
            }
        }

        if (Object.keys(fieldsToUpdate).length === 0) {
            console.log(`Нет данных для обновления для UID ${uid}.`);
            return { message: "Нет изменений для сохранения." };
        }

        try {
            await db.collection('users').doc(uid).update(fieldsToUpdate);
            console.log(`Текстовые данные для UID ${uid} успешно обновлены.`, fieldsToUpdate);
            return { message: "Профиль успешно обновлен!" };
        } catch (error) {
            console.error("Ошибка обновления профиля в Firestore:", error);
            throw new HttpsError("internal", "Ошибка сервера при сохранении профиля.");
        }
    }
);
interface UploadAvatarData {
    imageBase64: string;
}

export const uploadAvatar = onCall<UploadAvatarData>(
  {
    secrets: ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"],
  },
  async (request) => {
    // 1. Проверяем аутентификацию пользователя
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Необходимо войти в систему для загрузки аватара.");
    }
    const uid = request.auth.uid;

    const imageBase64 = request.data.imageBase64;
    if (!imageBase64 || typeof imageBase64 !== 'string' || !imageBase64.startsWith('data:image/')) {
        throw new HttpsError("invalid-argument", "Не предоставлены корректные данные изображения в формате base64 Data URL.");
    }

    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
        console.error("uploadAvatar: Cloudinary environment variables are not set!");
        throw new HttpsError("internal", "Ошибка конфигурации сервера.");
    }

    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true,
    });

    try {
        const uploadResult = await cloudinary.uploader.upload(imageBase64, {
            folder: "protomap_avatars",
            public_id: uid,
            overwrite: true,
            format: "webp",
            transformation: [{ width: 256, height: 256, crop: "fill", gravity: "face" }]
        });

        const newAvatarUrl = uploadResult.secure_url;
        console.log(`Cloudinary upload successful for UID ${uid}. URL: ${newAvatarUrl}`);

        await db.collection('users').doc(uid).update({
            avatar_url: newAvatarUrl
        });
        console.log(`Firestore updated successfully for UID ${uid}.`);

        return { avatarUrl: newAvatarUrl };

    } catch (error: any) {
        console.error(`Cloudinary/Firestore error for UID ${uid}:`, error);

        let errorMessage = "Ошибка обработки аватара.";
        if (error.message) {
            console.error("Detailed error:", error.message);
        }

        throw new HttpsError("internal", errorMessage, "Server-side processing failed.");
    }
  }
);