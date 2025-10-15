import L from 'leaflet';
import 'leaflet.markercluster';
import { auth } from '$lib/firebase';
import { userStore, type UserProfile } from '$lib/stores';
import { getFunctions, httpsCallable } from "firebase/functions";
import { modal } from '$lib/stores/modalStore';

type MarkerUserData = {
    username: string;
    avatar_url: string;
    status?: string | null;
};

function createCyberPopup(userData: MarkerUserData, city: string, isOwner: boolean): string {
    const profileUrl = `/profile/${encodeURIComponent(userData.username.trim())}`;
    const defaultAvatar = `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${encodeURIComponent(userData.username.trim())}`;

    const avatarImg = `<img src="${userData.avatar_url || defaultAvatar}" alt="Аватар" class="popup-avatar" onerror="this.onerror=null; this.src='${defaultAvatar}';"/>`;

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

function createUserAvatarIcon(avatarUrl: string | null | undefined, username: string): L.DivIcon {
    const defaultAvatar = `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${encodeURIComponent(username.trim())}`;
    const imageUrl = avatarUrl || defaultAvatar;
    const iconSize = 38;
    const iconHtml = `<div class="user-avatar-marker" style="width: ${iconSize}px; height: ${iconSize}px;"><img src="${imageUrl}" alt="Аватар ${username}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: 2px solid var(--cyber-yellow, #fcee0a); background-color: #333;" onerror="this.onerror=null; this.src='${defaultAvatar}';"/></div>`;
    return L.divIcon({ html: iconHtml, className: 'custom-leaflet-div-icon', iconSize: [iconSize, iconSize], iconAnchor: [iconSize / 2, iconSize], popupAnchor: [0, -42] });
}

export function initMap(containerId: string) {
    console.log("Инициализация карты в контейнере:", containerId);

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
    });

    if (map.attributionControl) {
        map.attributionControl.setPrefix(false);
    }

    const baseLayers = {
        "Стандартная": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OSM' }),
        "Тёмная": L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 20, attribution: '© CARTO' })
    };
    const storageKey = 'protomap-selected-theme';
    let savedLayerName = "Стандартная";

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

    const markers = L.markerClusterGroup({ iconCreateFunction: createClusterIcon });
    map.addLayer(markers);

    const userMarkers: { [key: string]: L.Marker } = {};

    function addOrUpdateMarker(userData: MarkerUserData, lat: number, lng: number, city: string): void {
        const isOwner = currentUserProfile?.username?.trim() === userData.username.trim();
        const popupContent = createCyberPopup(userData, city, isOwner);
        const customUserIcon = createUserAvatarIcon(userData.avatar_url, userData.username);
        const usernameKey = userData.username.trim();

        if (userMarkers[usernameKey]) {
            userMarkers[usernameKey].setLatLng([lat, lng]).setIcon(customUserIcon).setPopupContent(popupContent);
        } else {
            const newMarker = L.marker([lat, lng], { icon: customUserIcon }).bindPopup(popupContent);
            markers.addLayer(newMarker);
            userMarkers[usernameKey] = newMarker;
        }
    }

    async function loadAllMarkers() {
        try {
            const functions = getFunctions();
            const getLocationsFunc = httpsCallable(functions, 'getLocations');
            const result = await getLocationsFunc();
            const locations = result.data as Array<{user: MarkerUserData, lat: number, lng: number, city: string}>;

            markers.clearLayers();
            Object.keys(userMarkers).forEach(key => delete userMarkers[key]);

            locations.forEach((loc) => {
                if (loc.user && loc.user.username && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
                    addOrUpdateMarker(loc.user, loc.lat, loc.lng, loc.city);
                }
            });
            console.log("Все метки из базы данных добавлены на карту.");
        } catch (error) {
            console.error("Ошибка при обработке меток:", error);
        }
    }

    async function sendLocationToServer(lat: number, lng: number, currentUser: UserProfile) {
        const geoButton = document.querySelector('.geolocation-button');
        if (geoButton) L.DomUtil.addClass(geoButton, 'loading');
        try {
            const idToken = await auth.currentUser?.getIdToken(true);
            if (!idToken) throw new Error("Не удалось получить токен пользователя.");

            const functions = getFunctions();
            const addOrUpdateLocationFunc = httpsCallable(functions, 'addOrUpdateLocation');
            const result = await addOrUpdateLocationFunc({ lat, lng });

            const data = result.data as any;
            if (data.status === 'success') {
                const currentUserData: MarkerUserData = {
                    username: currentUser.username,
                    avatar_url: currentUser.avatar_url,
                    status: currentUser.status
                };
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
        console.log("Настройка интерактивности для:", currentUser?.username || "Гость");
        map.off('click');

        if (currentUser) {
            map.on('click', (e: L.LeafletMouseEvent) => {
                modal.confirm("Подтверждение", "Добавить/переместить вашу метку в эту точку?", () => {
                    sendLocationToServer(e.latlng.lat, e.latlng.lng, currentUser);
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
                                        sendLocationToServer(position.coords.latitude, position.coords.longitude, currentUser);
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

        if (markers.getLayers().length > 0) {
            loadAllMarkers();
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

    return { map, markers, addOrUpdateMarkerFn: addOrUpdateMarker };
}