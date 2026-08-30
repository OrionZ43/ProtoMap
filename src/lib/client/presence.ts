import { rtdb } from '$lib/firebase';
import { ref, onValue, set, onDisconnect, serverTimestamp, off, type DatabaseReference } from 'firebase/database';

export type PresenceState = {
    state: 'online' | 'offline';
    last_changed: number | null;
};

/**
 * Подписка на присутствие ЧУЖОГО пользователя (status/{uid}).
 * initPresence ниже пишет свой статус, а это — чтение чужого: нужно для
 * индикатора «в эфире» в списке диалогов и в шапке чата.
 *
 * Возвращает функцию отписки. Вызывать её обязательно: на странице личек
 * подписок столько же, сколько собеседников, и утечка тут заметная.
 */
export function watchUserPresence(
    uid: string,
    cb: (p: PresenceState) => void
): () => void {
    if (!rtdb || !uid) return () => {};

    // try/catch здесь не перестраховка: функция вызывается из реактивного блока
    // страницы личек, то есть во время рендера. Если rtdb оказался заглушкой
    // (сборка без секретов, тесты) — ref() бросает, а исключение при рендере в
    // Svelte разрушает всё дерево компонентов: ложится не индикатор статуса,
    // а вся страница. Возвращаем no-op и живём без индикатора.
    try {
        const statusRef = ref(rtdb, `status/${uid}`);
        return onValue(
            statusRef,
            (snap) => {
                const val = snap.val();
                cb({
                    state: val?.state === 'online' ? 'online' : 'offline',
                    last_changed: typeof val?.last_changed === 'number' ? val.last_changed : null
                });
            },
            (err) => {
                console.warn('[presence] подписка не удалась:', err.message);
                cb({ state: 'offline', last_changed: null });
            }
        );
    } catch (err) {
        console.warn('[presence] RTDB недоступен:', err);
        return () => {};
    }
}

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
