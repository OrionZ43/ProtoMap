// src/lib/client/mapLogic.ts

import L from 'leaflet';
import 'leaflet.markercluster';
import { auth } from '$lib/firebase';
import { userStore, type UserProfile } from '$lib/stores';
import { get } from 'svelte/store';
import { getFunctions, httpsCallable } from "firebase/functions";
import { modal } from '$lib/stores/modalStore';

function createUserAvatarIcon(avatarUrl: string | null | undefined, username: string): L.DivIcon {
    const defaultAvatar = `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${encodeURIComponent(username.trim())}`;
    const imageUrl = avatarUrl || defaultAvatar;
    const iconSize = 38;
    const iconHtml = `
        <div class="user-avatar-marker" style="width: ${iconSize}px; height: ${iconSize}px;">
            <img src="${imageUrl}" alt="Аватар ${username}"
                 style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: 2px solid var(--cyber-yellow, #fcee0a); background-color: #333;"
                 onerror="this.onerror=null; this.src='${defaultAvatar}';" />
        </div>
    `;
    return L.divIcon({
        html: iconHtml,
        className: 'custom-leaflet-div-icon',
        iconSize: [iconSize, iconSize],
        iconAnchor: [iconSize / 2, iconSize],
        popupAnchor: [0, -(iconSize + 2)]
    });
}

export function initMap(containerId: string) {
    console.log("Инициализация карты в контейнере:", containerId);

    const southWest = L.latLng(-90, -180);
    const northEast = L.latLng(90, 180);
    const bounds = L.latLngBounds(southWest, northEast);

    const map = L.map(containerId, {
        center: [54.5, 30.0],
        zoom: 4,
        maxBounds: bounds,
        maxBoundsViscosity: 1.0,
        minZoom: 2
    });

    if (map.attributionControl) {
        map.attributionControl.setPrefix('<a href="https://leafletjs.com" title="A JS library for interactive maps">Leaflet</a>');
    }

    const cartoDarkMatter = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    });

    const cartoPositron = L.tileLayer('https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}{r}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    });

    const osmStandard = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });

    osmStandard.addTo(map);

    const baseLayers = {
        "Стандартная (OSM)": osmStandard,
        "Кибер-карта (Dark)": cartoDarkMatter,
        "Нейтральная (Wikimedia)": cartoPositron,

    };

    const layersControl = L.control.layers(baseLayers);
    layersControl.addTo(map);

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

    const markers = L.markerClusterGroup();
    map.addLayer(markers);

    const userMarkers: { [key: string]: L.Marker } = {};

    function createPopupContent(username: string, city: string): string {
        const trimmedUsername = username.trim();
        const profileUrl = `/profile/${encodeURIComponent(trimmedUsername)}`;
        let popupHTML = `Протоген <a href="${profileUrl}" target="_blank">${trimmedUsername}</a> в: ${city || 'Неизвестно'}`;

        const currentUser = get(userStore).user;
        if (currentUser && trimmedUsername === (currentUser.username ? currentUser.username.trim() : '')) {
            popupHTML += `<br><button class="delete-marker-btn" data-username="${trimmedUsername}">Удалить мою метку</button>`;
        }
        return popupHTML;
    }

    function addOrUpdateMarker(username: string, lat: number, lng: number, city: string, avatarUrl?: string | null): void {
        const popupContent = createPopupContent(username, city);
        const customUserIcon = createUserAvatarIcon(avatarUrl, username);
        const trimmedUsernameForMapKey = username.trim();

        if (userMarkers[trimmedUsernameForMapKey]) {
            userMarkers[trimmedUsernameForMapKey].setLatLng([lat, lng])
                                 .setIcon(customUserIcon)
                                 .setPopupContent(popupContent);
        } else {
            const newMarker = L.marker([lat, lng], { icon: customUserIcon }).bindPopup(popupContent);
            markers.addLayer(newMarker);
            userMarkers[trimmedUsernameForMapKey] = newMarker;
        }
    }

    async function loadAllMarkers() {
        console.log("Вызов Cloud Function 'getLocations' для загрузки меток...");
        try {
            const functions = getFunctions();
            const getLocationsFunc = httpsCallable(functions, 'getLocations');
            const result = await getLocationsFunc();
            const locations = result.data as Array<{user: string, lat: number, lng: number, city: string, avatar_url?: string | null}>;

            console.log(`Получено ${locations.length} меток с сервера.`);
            markers.clearLayers();
            Object.keys(userMarkers).forEach(key => delete userMarkers[key]);

            locations.forEach((loc) => {
                if (loc.user && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
                    addOrUpdateMarker(loc.user, loc.lat, loc.lng, loc.city, loc.avatar_url);
                }
            });
            console.log("Все метки из базы данных добавлены на карту.");
        } catch (error) {
            console.error("Ошибка вызова Cloud Function 'getLocations':", error);
        }
    }

    async function sendLocationToServer(lat: number, lng: number, currentUser: UserProfile) {
        console.log(`Отправка координат (${lat}, ${lng}) на сервер...`);
        const geoButton = document.querySelector('.geolocation-button');
        if (geoButton) L.DomUtil.addClass(geoButton, 'loading');

        try {
            const idToken = await auth.currentUser?.getIdToken();
            if (!idToken) throw new Error("Не удалось получить токен пользователя.");

            const functions = getFunctions();
            const addOrUpdateLocationFunc = httpsCallable(functions, 'addOrUpdateLocation');
            const result = await addOrUpdateLocationFunc({ lat, lng }, {
                headers: { 'Authorization': `Bearer ${idToken}` }
            });

            const data = result.data as any;
            if (data.status === 'success') {
                addOrUpdateMarker(currentUser.username, data.placeLat, data.placeLng, data.foundCity, currentUser.avatar_url);

                const trimmedUsernameKey = currentUser.username.trim();
                if (userMarkers[trimmedUsernameKey]) {
                    userMarkers[trimmedUsernameKey].openPopup();
                }
                modal.success("Готово!", data.message || "Ваша метка успешно обновлена!");
            } else {
                throw new Error(data.message || 'Ошибка ответа сервера');
            }
        } catch (error: any) {
            console.error("Ошибка при добавлении/обновлении метки:", error);
            const errorMessage = error?.message || 'Произошла неизвестная ошибка.';
            modal.error("Ошибка сохранения", `Не удалось сохранить метку. <br><small class="text-gray-400">Детали: ${errorMessage}</small>`);
        } finally {
            if (geoButton) L.DomUtil.removeClass(geoButton, 'loading');
        }
    }

    function setupMapInteraction(currentUser: UserProfile | null) {
        console.log("Настройка интерактивности для:", currentUser?.username || "Гость");
        map.off('click');

        if (currentUser) {
            map.on('click', (e: L.LeafletMouseEvent) => {
                modal.confirm(
                    "Подтверждение",
                    "Добавить или переместить вашу метку в эту точку?",
                    () => {
                        sendLocationToServer(e.latlng.lat, e.latlng.lng, currentUser);
                    }
                );
            });

            if (!(map as any).geocontrol || !map.hasControl((map as any).geocontrol)) {
                const GeolocationControl = L.Control.extend({
                    options: { position: 'topleft' as L.ControlPosition },
                    onAdd: function (mapInstance: L.Map) {
                        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom geolocation-button');
                        container.title = 'Добавить/Переместить по геолокации';
                        container.innerHTML = '<a href="#" role="button" aria-label="Найти меня"><i class="fas fa-map-marker-alt"></i></a>';

                        L.DomEvent.disableClickPropagation(container);
                        L.DomEvent.on(container.firstChild as HTMLElement, 'click', (ev: MouseEvent) => {
                            L.DomEvent.stop(ev);
                            if ('geolocation' in navigator) {
                                L.DomUtil.addClass(container, 'loading');
                                navigator.geolocation.getCurrentPosition(
                                    (position) => {
                                        L.DomUtil.removeClass(container, 'loading');
                                        const lat = parseFloat(position.coords.latitude.toFixed(3));
                                        const lng = parseFloat(position.coords.longitude.toFixed(3));
                                        sendLocationToServer(lat, lng, currentUser);
                                    },
                                    (geoError) => {
                                        L.DomUtil.removeClass(container, 'loading');
                                        modal.error("Ошибка геолокации", geoError.message || "Не удалось определить ваше местоположение.");
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
                const deleteButton = popupNode.querySelector('.delete-marker-btn') as HTMLButtonElement | null;

                if (deleteButton && currentUser && currentUser.username) {
                    deleteButton.addEventListener('click', function(this: HTMLButtonElement, ev: MouseEvent) {
                        ev.preventDefault();
                        const usernameToDelete = this.getAttribute('data-username');
                        if (usernameToDelete && usernameToDelete === currentUser.username.trim()) {
                            modal.confirm(
                                "Удаление метки",
                                "Вы уверены, что хотите безвозвратно удалить свою метку с карты?",
                                async () => {
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
                                            modal.success("Успешно", data.message || "Ваша метка была удалена.");
                                        } else {
                                            throw new Error(data.message || 'Ошибка удаления на сервере');
                                        }
                                    } catch (delError: any) {
                                        console.error("Ошибка удаления метки:", delError);
                                        modal.error("Ошибка", `Не удалось удалить метку: ${delError.message}`);
                                    }
                                }
                            );
                        }
                    }, { once: true });
                }
            });

        } else {
            map.on('click', () => {
                modal.warning("Требуется авторизация", "Пожалуйста, войдите в систему, чтобы добавить свою метку на карту.");
            });
            if ((map as any).geocontrol && map.hasControl((map as any).geocontrol)) {
                map.removeControl((map as any).geocontrol);
                (map as any).geocontrol = null;
            }
        }
    }

    loadAllMarkers();

    userStore.subscribe((storeValue) => {
        if (!storeValue.loading) {
            setupMapInteraction(storeValue.user);
        }
    });

    return { map, markers, addOrUpdateMarkerFn: addOrUpdateMarker };
}