// functions/src/index.ts

import { onRequest } from "firebase-functions/v2/https";
import { onCall, HttpsError } from "firebase-functions/v2/https"; // Импортируем onCall и HttpsError
import * as admin from "firebase-admin";
import fetch from "node-fetch";

// Инициализируем Firebase Admin SDK один раз
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

const ALLOWED_ORIGINS = ["http://localhost:5173",
    "https://proto-map.vercel.app" ];

/**
 * Вызываемая HTTP-функция для проверки, доступно ли имя пользователя.
 */
export const checkUsername = onRequest(
  { cors: ALLOWED_ORIGINS }, // Разрешаем запросы с любого домена
  async (request, response) => {
      response.set('Access-Control-Allow-Origin', ALLOWED_ORIGINS.includes(request.headers.origin as string) ? request.headers.origin : "");
    response.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    // Проверяем метод запроса
    if (request.method !== "POST") {
      response.status(405).send("Method Not Allowed");
      return;
    }

    // Получаем username из тела запроса, обернутого в 'data'
    const username = request.body.data.username;

    // Валидация входных данных
    if (!username || typeof username !== "string" || username.length < 4) {
      response.status(400).json({ error: { message: "Имя пользователя не предоставлено или слишком короткое" } });
      return;
    }

    try {
      // Ищем пользователя в коллекции 'users'
      const usersRef = db.collection("users");
      const snapshot = await usersRef.where("username", "==", username).limit(1).get();

      // Формируем результат
      const resultData = {
        isAvailable: snapshot.empty,
      };

      // Отправляем успешный JSON-ответ с полем "data"
      response.status(200).json({ data: resultData });

    } catch (error) {
      console.error("Error checking username:", error);
      // Отправляем ошибку в правильном JSON-формате
      response.status(500).json({ error: { message: "Internal server error" } });
    }
  },
);

/**
 * Вспомогательная функция для геокодирования
 */
async function getDistrictCenterCoords(lat: number, lng: number): Promise<[string, number, number] | null> {
    const userAgent = process.env.NOMINATIM_USER_AGENT || 'ProtoMap/1.0 (contact@example.com)';

    // Этап 1: Reverse Geocoding
    const reverseGeocodeUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ru`;

    let placeNameFound: string | null = null;
    let cityContext: string | null = null;
    let countryContext: string | null = null;

    try {
        console.log(`Этап 1: Запрос к Nominatim для (${lat}, ${lng})`);
        const reverseResponse = await fetch(reverseGeocodeUrl, {
          headers: { 'User-Agent': userAgent },
        });
        if (!reverseResponse.ok) throw new Error(`Nominatim reverse API failed with status ${reverseResponse.status}`);
        const reverseData = await reverseResponse.json() as any;
        const address = reverseData.address;

        if (!address) {
          console.error("Этап 1: Nominatim не вернул 'address' в ответе.");
          return null;
        }
        console.log("Этап 1: Ответ от Nominatim:", address);

        placeNameFound = address.suburb || address.city_district || address.county || address.city || address.town || address.village || address.state;
        cityContext = address.city || address.town || address.village;
        countryContext = address.country;

        if (!placeNameFound) {
          console.error("Этап 1: Не удалось определить подходящее название места.");
          return null;
        }
        console.log(`Этап 1: Найдено место для поиска центра: '${placeNameFound}'`);

    } catch (error) {
        console.error("Этап 1: Ошибка:", error);
        return null;
    }

    // Пауза перед вторым запросом
    await new Promise(resolve => setTimeout(resolve, 1100));

    // Этап 2: Forward Geocoding
    try {
        const queryParts = [placeNameFound, cityContext && cityContext !== placeNameFound ? cityContext : null, countryContext].filter(Boolean);
        const query = queryParts.join(', ');
        const forwardGeocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&accept-language=ru`;

        console.log(`Этап 2: Запрос к Nominatim по названию: '${query}'`);
        const forwardResponse = await fetch(forwardGeocodeUrl, {
          headers: { 'User-Agent': userAgent },
        });
        if (!forwardResponse.ok) throw new Error(`Nominatim forward API failed with status ${forwardResponse.status}`);
        const forwardData = await forwardResponse.json() as any[];

        if (forwardData && forwardData.length > 0) {
            const placeLocation = forwardData[0];
            const placeLat = parseFloat(placeLocation.lat);
            const placeLng = parseFloat(placeLocation.lon);
            console.log(`Этап 2: Найдены координаты для '${query}': ${placeLat}, ${placeLng}`);
            return [placeNameFound, placeLat, placeLng];
        } else {
            console.warn(`Этап 2: Координаты для '${query}' не найдены.`);
            if (cityContext && placeNameFound !== cityContext) {
                await new Promise(resolve => setTimeout(resolve, 1100));
                const cityQuery = `${cityContext}, ${countryContext || ''}`.trim();
                const cityForwardUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cityQuery)}&limit=1&accept-language=ru`;
                console.log(`Этап 2 (Fallback): Запрос по городу: '${cityQuery}'`);
                const cityForwardResponse = await fetch(cityForwardUrl, { headers: { 'User-Agent': userAgent } });
                if (cityForwardResponse.ok) {
                    const cityForwardData = await cityForwardResponse.json() as any[];
                    if (cityForwardData && cityForwardData.length > 0) {
                        const cityLocation = cityForwardData[0];
                        const cityLat = parseFloat(cityLocation.lat);
                        const cityLng = parseFloat(cityLocation.lon);
                        console.log(`Этап 2 (Fallback): Найдены координаты города: ${cityLat}, ${cityLng}`);
                        return [placeNameFound, cityLat, cityLng];
                    }
                }
            }
            return null;
        }
    } catch (error) {
        console.error("Этап 2: Ошибка:", error);
        return null;
    }
}


/**
 * Вызываемая HTTP-функция для добавления/обновления метки пользователя.
 */
export const addOrUpdateLocation = onRequest(
  { cors: ALLOWED_ORIGINS },
  async (request, response) => {
      response.set('Access-Control-Allow-Origin', ALLOWED_ORIGINS.includes(request.headers.origin as string) ? request.headers.origin : "");
    response.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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


/**
 * Вызываемая HTTP-функция для получения всех меток с данными их пользователей.
 */
export const getLocations = onRequest(
  { cors: ALLOWED_ORIGINS },
  async (request, response) => {
      // Установка заголовков CORS
      const origin = request.headers.origin as string;
      if (ALLOWED_ORIGINS.includes(origin)) {
          response.set('Access-Control-Allow-Origin', origin);
      } else {
          // Если источник не разрешен, можно не устанавливать заголовок или установить специфическое значение
          // В данном случае, если не разрешен, заголовок не будет установлен, что может вызвать проблемы
          // Если хочешь строгую проверку, лучше вернуть ошибку, если origin не в списке
      }
      response.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); // OPTIONS нужен для preflight-запросов
      response.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      // Обработка preflight-запроса (OPTIONS)
      if (request.method === 'OPTIONS') {
          response.status(204).send('');
          return;
      }

    try {
      const locationsSnapshot = await db.collection("locations").get();
      if (locationsSnapshot.empty) {
        response.status(200).json({ data: [] });
        return;
      }

      // Собираем все уникальные user_id из меток
      const userIds: string[] = [];
      locationsSnapshot.forEach((doc) => {
          const userId = doc.data().user_id;
          if (userId && !userIds.includes(userId)) {
              userIds.push(userId);
          }
      });

      if (userIds.length === 0) {
        response.status(200).json({ data: [] });
        return;
      }

      // Загружаем данные всех нужных пользователей одним запросом
      const usersSnapshot = await db.collection("users").where(admin.firestore.FieldPath.documentId(), "in", userIds).get();

      const usersMap = new Map<string, any>(); // Типизируем Map
      usersSnapshot.forEach((doc) => {
        usersMap.set(doc.id, doc.data());
      });

      const results = locationsSnapshot.docs.map((doc) => {
        const locationData = doc.data();
        const userData = usersMap.get(locationData.user_id);

        return {
          lat: locationData.latitude,
          lng: locationData.longitude,
          city: locationData.city,
          user: userData ? userData.username : "неизвестно",
          // ИЗМЕНЕНИЕ: Добавляем avatar_url
          // Если у пользователя нет avatar_url в Firestore, или поле отсутствует,
          // userData.avatar_url будет undefined, и мы передадим null (или пустую строку).
          // Клиентская логика в mapLogic.ts уже умеет это обрабатывать и подставлять DiceBear.
          avatar_url: userData ? (userData.avatar_url || null) : null,
        };
      }).filter(item => item.user !== "неизвестно"); // Опционально: отфильтровать метки без пользователя

      response.status(200).json({ data: results });

    } catch (error) {
      console.error("Error fetching locations:", error);
      response.status(500).json({ error: { message: "Internal server error" } });
    }
  },
);


/**
 * Вызываемая HTTP-функция для удаления метки пользователя.
 */
export const deleteLocation = onCall(
  { cors: ALLOWED_ORIGINS }, // cors можно оставить для совместимости
  async (request) => {
    // 1. Проверяем авторизацию. onCall делает это проще.
    // Если токен невалидный или отсутствует, Firebase сам вернет ошибку 'unauthenticated'.
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
        // 2. Возвращаем объект с результатом
        return { status: 'success', message: 'Ваша метка удалена.' };
      } else {
        console.log(`Метка для UserID=${user_id} не найдена.`);
        return { status: 'success', message: 'Метка не найдена.' };
      }
    } catch (error) {
      console.error("Ошибка удаления метки:", error);
      // 3. Выбрасываем стандартизированную ошибку
      throw new HttpsError('internal', 'Ошибка сервера при удалении метки.');
    }
  }
);