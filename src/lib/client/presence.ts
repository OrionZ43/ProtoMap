import { rtdb } from '$lib/firebase';
import { ref, onValue, set, onDisconnect, serverTimestamp, off, type DatabaseReference } from 'firebase/database';

let connectedRef: DatabaseReference;
let statusRef: DatabaseReference;
let connectedUnsubscribe: (() => void) | null = null;

export function initPresence(uid: string) {
    if (!rtdb) return;

    // Ссылка на статус текущего юзера
    statusRef = ref(rtdb, `status/${uid}`);

    // Ссылка на специальный системный узел, показывающий статус подключения клиента к RTDB
    connectedRef = ref(rtdb, '.info/connected');

    if (connectedUnsubscribe) {
        connectedUnsubscribe();
    }

    const cb = onValue(connectedRef, (snap) => {
        if (snap.val() === true) {
            // Как только мы подключились (или переподключились),
            // мы ставим триггер на отключение.
            // Если соединение разорвется, Firebase сам поставит статус offline.
            onDisconnect(statusRef).set({
                state: 'offline',
                last_changed: serverTimestamp()
            }).then(() => {
                // И только после того как onDisconnect успешно установлен,
                // мы объявляем себя online.
                set(statusRef, {
                    state: 'online',
                    last_changed: serverTimestamp()
                });
            });
        }
    });

    connectedUnsubscribe = () => off(connectedRef, 'value', cb);
}

export function setOffline(uid: string) {
    if (!rtdb || !uid) return;
    const refToSet = ref(rtdb, `status/${uid}`);
    set(refToSet, {
        state: 'offline',
        last_changed: serverTimestamp()
    });
    // Также можно отменить onDisconnect, если юзер вышел сам
    if (statusRef) {
        onDisconnect(statusRef).cancel();
    }

    // Очищаем подписку на .info/connected
    if (connectedUnsubscribe) {
        connectedUnsubscribe();
        connectedUnsubscribe = null;
    }
}
