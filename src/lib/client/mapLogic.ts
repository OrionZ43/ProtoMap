import L from 'leaflet';
import 'leaflet.markercluster';
import { auth } from '$lib/firebase';
import { userStore, type UserProfile } from '$lib/stores';
import { get } from 'svelte/store';
import { getFunctions, httpsCallable } from "firebase/functions";

const protoIcon = L.icon({
    iconUrl: "/protogen_pin_map.svg",
    iconSize:     [38, 38],
    iconAnchor:   [19, 38],
    popupAnchor:  [0, -40]
});

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

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '© <a href="http://www.openstreetmap.org/copyright">OSM</a> contributors'
    }).addTo(map);

    const markers = L.markerClusterGroup();
    map.addLayer(markers);

    const userMarkers: { [key: string]: L.Marker } = {};

    function createPopupContent(username: string, city: string): string {
        const trimmedUsername = username.trim();
        const profileUrl = `/profile/${encodeURIComponent(username)}`;
        let popupHTML = `Протоген <a href="${profileUrl}" target="_blank">${username}</a> в: ${city || 'Неизвестно'}`;
        const currentUser = get(userStore).user;
        if (currentUser && trimmedUsername === (currentUser.username ? currentUser.username.trim() : '')) { 
            popupHTML += `<br><button class="delete-marker-btn" data-username="${username}">Удалить мою метку</button>`;
        }
        return popupHTML;
    }

    function addOrUpdateMarker(username: string, lat: number, lng: number, city: string): void {
        const popupContent = createPopupContent(username, city);
        if (userMarkers[username]) {
            userMarkers[username].setLatLng([lat, lng]).setPopupContent(popupContent);
        } else {
            const newMarker = L.marker([lat, lng], { icon: protoIcon }).bindPopup(popupContent);
            markers.addLayer(newMarker);
            userMarkers[username] = newMarker;
        }
    }

    async function loadAllMarkers() {
        console.log("Вызов Cloud Function 'getLocations' для загрузки меток...");
        try {
            const functions = getFunctions();
            const getLocationsFunc = httpsCallable(functions, 'getLocations');
            const result = await getLocationsFunc();
            const locations = result.data as any[];

            console.log(`Получено ${locations.length} меток с сервера.`);
            markers.clearLayers();
            Object.keys(userMarkers).forEach(key => delete userMarkers[key]);

            locations.forEach((loc) => {
                if (loc.user && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
                    addOrUpdateMarker(loc.user, loc.lat, loc.lng, loc.city);
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
                addOrUpdateMarker(currentUser.username, data.placeLat, data.placeLng, data.foundCity);
                if (userMarkers[currentUser.username]) {
                    userMarkers[currentUser.username].openPopup();
                }
                alert(data.message);
            } else {
                throw new Error(data.message || 'Ошибка ответа сервера');
            }
        } catch (error) {
            console.error("Ошибка при добавлении/обновлении метки:", error);
            alert(`Не удалось сохранить метку. ${error}`);
        } finally {
            if (geoButton) L.DomUtil.removeClass(geoButton, 'loading');
        }
    }

    function setupMapInteraction(currentUser: UserProfile | null) {
        console.log("Настройка интерактивности для:", currentUser?.username || "Гость");
        map.off('click');
        if (map.geocontrol) { map.removeControl(map.geocontrol); }

        if (currentUser) {
            map.on('click', (e) => {
                if (confirm(`Добавить/переместить метку здесь?`)) {
                    sendLocationToServer(e.latlng.lat, e.latlng.lng, currentUser);
                }
            });

            const GeolocationControl = L.Control.extend({
                options: { position: 'topleft' },
                onAdd: function (map) {
                    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom geolocation-button');
                    container.title = 'Добавить/Переместить по геолокации';
                    container.innerHTML = '<a href="#" role="button" aria-label="Найти меня"><i class="fas fa-map-marker-alt"></i></a>';

                    L.DomEvent.disableClickPropagation(container);
                    L.DomEvent.on(container.firstChild!, 'click', (ev) => {
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
                                (error) => {
                                    L.DomUtil.removeClass(container, 'loading');
                                    alert("Ошибка геолокации: " + error.message);
                                }
                            );
                        } else { alert('Геолокация не поддерживается.'); }
                    });
                    return container;
                }
            });
            map.geocontrol = new GeolocationControl();
            map.addControl(map.geocontrol);

            markers.on('popupopen', (e) => {
            const popupNode = e.popup._contentNode;
            const deleteButton = popupNode.querySelector('.delete-marker-btn');

            if (deleteButton) {
                deleteButton.addEventListener('click', async function(ev) {
                    ev.preventDefault();
                    const usernameToDelete = this.getAttribute('data-username');
                    if (usernameToDelete === currentUser.username && confirm("Вы уверены, что хотите удалить свою метку?")) {
                        this.textContent = "Удаление..."; this.disabled = true;
                        try {
                            const functions = getFunctions();
                            const deleteLocationFunc = httpsCallable(functions, 'deleteLocation');
                            const result = await deleteLocationFunc(null);
                            const data = result.data as any;

                            if (data.status === 'success') {
                                if (userMarkers[usernameToDelete]) {
                                    markers.removeLayer(userMarkers[usernameToDelete]);
                                    delete userMarkers[usernameToDelete];
                                }
                                map.closePopup();
                                alert(data.message);
                            } else {
                                throw new Error(data.message || 'Ошибка удаления на сервере');
                            }
                        } catch (error: any) {
                            console.error("Ошибка удаления метки:", error);
                            alert(`Не удалось удалить метку: ${error.message}`);
                        } finally {
                            this.textContent = "Удалить мою метку";
                            this.disabled = false;
                        }
                    }
                }, { once: true });
            }
        });

        } else {
            map.on('click', () => {
                alert("Пожалуйста, войдите, чтобы добавить свою метку.");
            });
        }
    }

    loadAllMarkers();
    userStore.subscribe((storeValue) => {
        if (!storeValue.loading) {
            setupMapInteraction(storeValue.user);
        }
    });

    return { map, markers, addOrUpdateMarker };
}