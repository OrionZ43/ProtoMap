import L from 'leaflet';
import 'leaflet.markercluster';
import { auth } from '$lib/firebase';
import { userStore, type UserProfile } from '$lib/stores';
import { getFunctions, httpsCallable } from "firebase/functions";
import { modal } from '$lib/stores/modalStore';
import { AudioManager } from '$lib/client/audioManager';

type MarkerUserData = {
    username: string;
    avatar_url: string;
    status?: string | null;
    equipped_frame?: string | null;
};

function createCyberPopup(userData: MarkerUserData, city: string, isOwner: boolean): string {
    const profileUrl = `/profile/${encodeURIComponent(userData.username.trim())}`;
    const defaultAvatar = `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${encodeURIComponent(userData.username.trim())}`;

    const frameClass = userData.equipped_frame || '';
    const avatarImg = `
        <div class="avatar-wrapper-popup ${frameClass}">
            <img src="${userData.avatar_url || defaultAvatar}" alt="Avatar" class="popup-avatar" onerror="this.onerror=null; this.src='${defaultAvatar}';"/>
        </div>
    `;

    const statusHTML = userData.status
        ? `<p class="popup-status">"${escapeHtml(userData.status)}"</p>`
        : '<p class="popup-status-empty">//: Статус не установлен</p>';

    const signalStrength = 90 + Math.floor(Math.random() * 10);
    const zoneStatus = ["СТАБИЛЬНО", "СИНХРОНИЗАЦИЯ", "НОРМА"][Math.floor(Math.random() * 3)];

    const deleteButtonHTML = isOwner
        ? `<button class="popup-delete-btn" data-username="${escapeHtml(userData.username)}">Удалить</button>`
        : '';

    const html = `
        <div class="liquid-glass-popup">
            <div class="popup-header">
                ${avatarImg}
                <span class="popup-username">${escapeHtml(userData.username)}</span>
            </div>

            ${statusHTML}

            <div class="location-data">
                <div class="data-item">
                    <span class="data-label">ЛОКАЦИЯ</span>
                    <span class="data-value">${escapeHtml(city)}</span>
                </div>
                <div class="data-item">
                    <span class="data-label">СИГНАЛ</span>
                    <span class="data-value">${signalStrength}%</span>
                </div>
                <div class="data-item">
                    <span class="data-label">СТАТУС ЗОНЫ</span>
                    <span class="data-value text-green-400">${zoneStatus}</span>
                </div>
            </div>

            <div class="popup-actions">
                <a href="${profileUrl}" target="_blank" class="popup-profile-btn">Профиль</a>
                ${deleteButtonHTML}
            </div>
        </div>
    `;
    return html;
}

function escapeHtml(unsafe: string): string {
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function createUserAvatarIcon(userData: MarkerUserData): L.DivIcon {
    const defaultAvatar = `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${encodeURIComponent(userData.username.trim())}`;
    const imageUrl = userData.avatar_url || defaultAvatar;
    const iconSize = 38;

    const frameClass = userData.equipped_frame || '';
    const iconHtml = `<div class="user-avatar-marker ${frameClass}" style="width: ${iconSize}px; height: ${iconSize}px;"><img src="${imageUrl}" alt="Аватар ${userData.username}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; background-color: #333;" onerror="this.onerror=null; this.src='${defaultAvatar}';"/></div>`;

    return L.divIcon({ html: iconHtml, className: 'custom-leaflet-div-icon', iconSize: [iconSize, iconSize], iconAnchor: [iconSize / 2, iconSize], popupAnchor: [0, -42] });
}

function clearClientCache() {
    localStorage.removeItem('protomap_markers_cache');
    localStorage.removeItem('protomap_markers_time');
}

export function initMap(containerId: string) {
    let currentUserProfile: UserProfile | null = null;

    const southWest = L.latLng(-90, -180);
    const northEast = L.latLng(90, 180);
    const bounds = L.latLngBounds(southWest, northEast);

    const map = L.map(containerId, {
        center: [54.5, 30.0],
        zoom: 4,
        minZoom: 2,
        maxBounds: bounds,
        maxBoundsViscosity: 1.0,
        preferCanvas: true,
        zoomAnimation: true,
    });

    if (map.attributionControl) {
        map.attributionControl.setPrefix(false);
    }

    const baseLayers = {
        "Стандартная": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OSM' }),
        "Полночь": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19,attribution: '© OSM',className: 'map-black'}),
        "Тёмная": L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 20, attribution: '© CARTO' }),
        "Синий неон": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '© OSM', className: 'matrix-tiles'}),
    };
    const storageKey = 'protomap-selected-theme';
    let savedLayerName = "Тёмная";

    try {
        const storedName = localStorage.getItem(storageKey);
        if (storedName && baseLayers[storedName]) {
            savedLayerName = storedName;
        }
    } catch (e) {
        console.error("Не удалось получить доступ к localStorage", e);
    }

    baseLayers[savedLayerName].addTo(map);

    const layersControl = L.control.layers(baseLayers).addTo(map);
    map.on('baselayerchange', function (e: L.LayersControlEvent) {
        try {
            localStorage.setItem(storageKey, e.name);
        } catch (error) {
            console.error("Не удалось сохранить тему карты в localStorage", error);
        }
    });

    const controlContainer = layersControl.getContainer();
    if (controlContainer) {
        controlContainer.classList.add('cyber-layers-control');
        setTimeout(() => {
            const inputs = controlContainer.querySelectorAll('.leaflet-control-layers-base input[type="radio"]');
            inputs.forEach(input => {
                const nextElement = input.nextElementSibling;
                if (nextElement && nextElement.tagName === 'SPAN') {
                    nextElement.classList.add('custom-radio-span');
                }
            });
        }, 0);
    }

    const createClusterIcon = function (cluster: L.MarkerCluster) {
        const count = cluster.getChildCount();
        let sizeClass = 'small';
        if (count >= 10) sizeClass = 'medium';
        if (count >= 50) sizeClass = 'large';
        const chargeAngle = Math.round((Math.min(count, 100) / 100) * 360);
        const html = `<div class="reactor-cluster ${sizeClass}"><div class="reactor-glow"></div><div class="reactor-ring outer"></div><div class="reactor-ring middle"></div><div class="reactor-charge-indicator" style="--charge-angle: ${chargeAngle}deg;"></div><div class="reactor-core"><span class="count">${count}</span></div><div class="particle p1"></div><div class="particle p2"></div><div class="particle p3"></div><div class="particle p4"></div></div>`;
        return L.divIcon({ html: html, className: 'custom-cluster-icon-wrapper', iconSize: L.point(80, 80, true) });
    };

    const markers = L.markerClusterGroup({
        iconCreateFunction: createClusterIcon,
        showCoverageOnHover: false
    });
    map.addLayer(markers);

    const userMarkers: { [key: string]: L.Marker } = {};

    // === ОПТИМИЗАЦИЯ: Хелпер для создания объекта маркера (чтобы не дублировать код) ===
    function createMarkerLayer(userData: MarkerUserData, lat: number, lng: number, city: string): L.Marker {
        const isOwner = currentUserProfile?.username?.trim() === userData.username.trim();
        const popupContent = createCyberPopup(userData, city, isOwner);
        const customUserIcon = createUserAvatarIcon(userData);

        let popupOptions: L.PopupOptions = { autoPan: true };

        if (lat > 80) {
            popupOptions = {
                offset: [0, 340],
                className: 'popup-inverted',
                autoPan: true
            };
        }

        return L.marker([lat, lng], { icon: customUserIcon }).bindPopup(popupContent, popupOptions);
    }

    // === ОПТИМИЗАЦИЯ: Функция для единичного обновления (когда юзер двигается сам) ===
    function addOrUpdateMarker(userData: MarkerUserData, lat: number, lng: number, city: string): void {
        const usernameKey = userData.username.trim();

        if (userMarkers[usernameKey]) {
            // Обновляем существующий
            const marker = userMarkers[usernameKey];
            const customUserIcon = createUserAvatarIcon(userData);
            const isOwner = currentUserProfile?.username?.trim() === userData.username.trim();
            const popupContent = createCyberPopup(userData, city, isOwner);

            // Пересчитываем опции на случай если уехал на север
            let popupOptions: L.PopupOptions = { autoPan: true };
            if (lat > 80) {
                popupOptions = { offset: [0, 340], className: 'popup-inverted', autoPan: true };
            }

            marker.setLatLng([lat, lng]).setIcon(customUserIcon);
            marker.unbindPopup();
            marker.bindPopup(popupContent, popupOptions);
        } else {
            // Создаем новый и добавляем (так как это единичное действие, addLayer тут ок)
            const newMarker = createMarkerLayer(userData, lat, lng, city);
            markers.addLayer(newMarker);
            userMarkers[usernameKey] = newMarker;
        }
    }

    // === ОПТИМИЗАЦИЯ: Массовый рендер (С ЗАЩИТОЙ ОТ ДУБЛЕЙ) ===
    function renderMarkers(locations: any[]) {
        // 1. Очищаем карту от старого мусора
        markers.clearLayers();

        // Очищаем хеш-таблицу ссылок
        Object.keys(userMarkers).forEach(key => delete userMarkers[key]);

        const batchMarkers: L.Marker[] = [];

        // 2. Проходимся по данным
        locations.forEach((loc) => {
            if (loc.user && loc.user.username && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
                const usernameKey = loc.user.username.trim();

                // 🔥 ЗАЩИТА ОТ ДУБЛИКАТОВ 🔥
                // Если мы УЖЕ добавили этого юзера в текущем цикле рендера — пропускаем его.
                // Это спасет, если в базе задвоились записи.
                if (userMarkers[usernameKey]) {
                    console.warn(`[Map] Duplicate signal detected for: ${usernameKey}. Ignoring echo.`);
                    return;
                }

                const marker = createMarkerLayer(loc.user, loc.lat, loc.lng, loc.city);

                // Сохраняем ссылку (и заодно помечаем, что юзер уже есть)
                userMarkers[usernameKey] = marker;

                // Добавляем в пачку
                batchMarkers.push(marker);
            }
        });

        // 3. Добавляем на карту ОДНИМ ВЫЗОВОМ
        if (batchMarkers.length > 0) {
            markers.addLayers(batchMarkers);
        }
    }

    async function loadAllMarkers() {
        const CACHE_KEY = 'protomap_markers_cache';
        const CACHE_TIME_KEY = 'protomap_markers_time';
        const CLIENT_CACHE_DURATION = 5 * 60 * 1000;

        try {
            const cachedData = localStorage.getItem(CACHE_KEY);
            const cachedTime = localStorage.getItem(CACHE_TIME_KEY);
            const now = Date.now();

            if (cachedData && cachedTime && (now - parseInt(cachedTime) < CLIENT_CACHE_DURATION)) {
                const locations = JSON.parse(cachedData);
                renderMarkers(locations);
                return;
            }

            const functions = getFunctions();
            const getLocationsFunc = httpsCallable(functions, 'getLocations');
            const result = await getLocationsFunc();
            const locations = result.data as Array<{user: MarkerUserData, lat: number, lng: number, city: string}>;

            try {
                localStorage.setItem(CACHE_KEY, JSON.stringify(locations));
                localStorage.setItem(CACHE_TIME_KEY, now.toString());
            } catch (e) {
                console.warn("Quota exceeded for localStorage");
            }

            renderMarkers(locations);
        } catch (error) {
            console.error("Ошибка при обработке меток:", error);
        }
    }

    async function sendLocationToServer(lat: number, lng: number, currentUser: UserProfile, isManual: boolean) {
        const geoButton = document.querySelector('.geolocation-button');
        if (geoButton) L.DomUtil.addClass(geoButton, 'loading');
        try {
            const idToken = await auth.currentUser?.getIdToken(true);
            if (!idToken) throw new Error("Не удалось получить токен пользователя.");

            const functions = getFunctions();
            const addOrUpdateLocationFunc = httpsCallable(functions, 'addOrUpdateLocation');
            const result = await addOrUpdateLocationFunc({ lat, lng, isManual });

            const data = result.data as any;
            if (data.status === 'success') {
                const currentUserData: MarkerUserData = {
                    username: currentUser.username,
                    avatar_url: currentUser.avatar_url,
                    status: currentUser.status,
                    equipped_frame: currentUser.equipped_frame
                };
                clearClientCache();
                addOrUpdateMarker(currentUserData, data.placeLat, data.placeLng, data.foundCity);
                const trimmedUsernameKey = currentUser.username.trim();
                if (userMarkers[trimmedUsernameKey]) {
                    userMarkers[trimmedUsernameKey].openPopup();
                }
                modal.success("Готово!", data.message || "Ваша метка успешно обновлена!");
            } else {
                throw new Error(data.message || 'Ошибка ответа сервера');
            }
        } catch (error: any) {
            modal.error("Ошибка сохранения", `Не удалось сохранить метку: ${error.message}`);
        } finally {
            if (geoButton) L.DomUtil.removeClass(geoButton, 'loading');
        }
    }

    function setupMapInteraction(currentUser: UserProfile | null) {
        map.off('click');

        if (currentUser) {
            map.on('click', (e: L.LeafletMouseEvent) => {
                const { lat, lng } = e.latlng;
                modal.confirm("Ручная установка", "Установить точное местоположение в этой точке?", () => {
                    sendLocationToServer(lat, lng, currentUser, true);
                });
            });

            if (!(map as any).geocontrol) {
                const GeolocationControl = L.Control.extend({
                    options: { position: 'topleft' as L.ControlPosition },
                    onAdd: function () {
                        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom geolocation-button');
                        container.title = 'Добавить/Переместить по геолокации';
                        container.innerHTML = '<a href="#" role="button"><i class="fas fa-map-marker-alt"></i></a>';
                        L.DomEvent.on(container, 'click', L.DomEvent.stop).on(container, 'click', () => {
                            if ('geolocation' in navigator) {
                                L.DomUtil.addClass(container, 'loading');
                                navigator.geolocation.getCurrentPosition(
                                    (position) => {
                                        sendLocationToServer(position.coords.latitude, position.coords.longitude, currentUser, false);
                                        L.DomUtil.removeClass(container, 'loading');
                                    },
                                    (geoError) => {
                                        modal.error("Ошибка геолокации", geoError.message);
                                        L.DomUtil.removeClass(container, 'loading');
                                    }
                                );
                            } else { modal.warning("Не поддерживается", "Ваш браузер не поддерживает геолокацию."); }
                        });
                        return container;
                    }
                });
                (map as any).geocontrol = new GeolocationControl();
                map.addControl((map as any).geocontrol);
            }

            markers.on('popupopen', (e: L.LeafletEvent & { popup: L.Popup }) => {
                const popupNode = e.popup._contentNode as HTMLElement;
                const deleteButton = popupNode.querySelector('.popup-delete-btn');
                if (deleteButton && currentUser && currentUser.username) {
                    deleteButton.addEventListener('click', function(this: HTMLButtonElement, ev: MouseEvent) {
                        ev.preventDefault();
                        const usernameToDelete = this.getAttribute('data-username');
                        if (usernameToDelete && usernameToDelete === currentUser.username.trim()) {
                            modal.confirm("Удаление метки", "Вы уверены?", async () => {
                                this.textContent = "Удаление...";
                                this.disabled = true;
                                try {
                                    const functions = getFunctions();
                                    const deleteLocationFunc = httpsCallable(functions, 'deleteLocation');
                                    const result = await deleteLocationFunc();
                                    const data = result.data as any;
                                    if (data.status === 'success') {
                                        clearClientCache();
                                        if (userMarkers[usernameToDelete]) {
                                            markers.removeLayer(userMarkers[usernameToDelete]);
                                            delete userMarkers[usernameToDelete];
                                        }
                                        map.closePopup();
                                        modal.success("Успешно", data.message || "Метка удалена.");
                                    } else {
                                        throw new Error(data.message);
                                    }
                                } catch (delError: any) {
                                    modal.error("Ошибка", `Не удалось удалить метку: ${delError.message}`);
                                }
                            });
                        }
                    }, { once: true });
                }
            });

        } else {
            map.on('click', () => {
                modal.warning("Требуется авторизация", "Пожалуйста, войдите, чтобы добавить свою метку.");
            });
            if ((map as any).geocontrol) {
                map.removeControl((map as any).geocontrol);
                (map as any).geocontrol = null;
            }
        }
    }

    loadAllMarkers();

    userStore.subscribe((storeValue) => {
        if (storeValue.loading) {
            return;
        }
        currentUserProfile = storeValue.user;
        setupMapInteraction(storeValue.user);
    });

    map.on('popupopen', (e) => {
        AudioManager.play('popup_open');
    });

    map.on('popupclose', (e) => {
        AudioManager.play('popup_close');
    });

    return { map, markers };
}