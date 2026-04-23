import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

const db = admin.firestore();
const rtdb = admin.database();

const COST = 500;
const REWARD = 1000;

interface PubState {
    turn: 'player' | 'orion';
    php: number; // Player HP
    ohp: number; // Orion HP
    mhp: number; // Max HP
    pit: string[]; // Player items
    oit: string[]; // Orion items
    sl: number; // Shells left
    log: string[]; // Action log
    st: 'lobby' | 'playing' | 'result'; // State
    pdbl: boolean; // Player next shot is double damage
    odbl: boolean; // Orion next shot is double damage
    pskip: boolean; // Player skips turn
    oskip: boolean; // Orion skips turn
    scan: 'live' | 'blank' | null; // Result of last scan (if any)
}

function generateAmmo(): ('live' | 'blank')[] {
    const minLive = 1;
    const minBlank = 1;
    const maxTotal = 8;

    // Random total between 2 and 8
    const total = Math.floor(Math.random() * 7) + 2;

    let live = Math.floor(Math.random() * (total - 1)) + 1;
    let blank = total - live;

    if (live === 0) live = 1;
    if (blank === 0) blank = 1;
    if (live + blank > maxTotal) {
        // Adjust if over
        live = Math.min(live, Math.floor(maxTotal / 2));
        blank = maxTotal - live;
    }

    const ammo: ('live' | 'blank')[] = [];
    for (let i = 0; i < live; i++) ammo.push('live');
    for (let i = 0; i < blank; i++) ammo.push('blank');

    return ammo.sort(() => Math.random() - 0.5);
}

function generateItems(): string[] {
    const itemsPool = ['sc', 'co', 'ad', 'od', 'ew', 'ps'];
    const count = Math.floor(Math.random() * 4) + 1; // 1 to 4 items
    const items: string[] = [];
    for (let i = 0; i < count; i++) {
        items.push(itemsPool[Math.floor(Math.random() * itemsPool.length)]);
    }
    return items;
}

export const startRoulette = onCall({ region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Auth required');
    const uid = request.auth.uid;

    const userRef = db.collection('users').doc(uid);

    try {
        await db.runTransaction(async (t) => {
            const userDoc = await t.get(userRef);
            if (!userDoc.exists) throw new HttpsError('not-found', 'User not found');
            const data = userDoc.data()!;
            if ((data.proto_coins || 0) < COST) {
                throw new HttpsError('failed-precondition', 'Недостаточно ProtoCoins');
            }
            t.update(userRef, { proto_coins: data.proto_coins - COST });
        });

        // Delete old games in RTDB
        const oldGameRef = rtdb.ref(`games/${uid}`);
        await oldGameRef.remove();
        const oldSecretRef = rtdb.ref(`secrets/${uid}`);
        await oldSecretRef.remove();

        const hp = Math.floor(Math.random() * 3) + 4; // 4 to 6
        const ammo = generateAmmo();

        const pub: PubState = {
            turn: 'player',
            php: hp,
            ohp: hp,
            mhp: hp,
            pit: generateItems(),
            oit: generateItems(),
            sl: ammo.length,
            log: ['Игра началась. Ваш ход.'],
            st: 'playing',
            pdbl: false,
            odbl: false,
            pskip: false,
            oskip: false,
            scan: null,
        };

        await rtdb.ref(`secrets/${uid}`).set({ ammo });
        await rtdb.ref(`games/${uid}`).set(pub);

        return { gameId: uid };
    } catch (e) {
        throw new HttpsError('internal', e instanceof Error ? e.message : String(e));
    }
});

export const makeRouletteAction = onCall({ region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Auth required');
    const uid = request.auth.uid;

    const action = request.data.action;
    const itemIndex = request.data.itemIndex;

    const gameRef = rtdb.ref(`games/${uid}`);
    const secretRef = rtdb.ref(`secrets/${uid}`);

    const [gameSnap, secretSnap] = await Promise.all([
        gameRef.once('value'),
        secretRef.once('value')
    ]);

    if (!gameSnap.exists() || !secretSnap.exists()) {
        throw new HttpsError('not-found', 'Игра не найдена');
    }

    const pub = gameSnap.val() as PubState;
    const secret = secretSnap.val() as { ammo: ('live' | 'blank')[] };

    // RTDB doesn't store empty arrays, provide defaults
    pub.pit = pub.pit || [];
    pub.oit = pub.oit || [];
    pub.log = pub.log || [];

    if (pub.st !== 'playing') {
        throw new HttpsError('failed-precondition', 'Игра уже завершена');
    }
    if (pub.turn !== 'player') {
        throw new HttpsError('failed-precondition', 'Не ваш ход');
    }

    function addLog(msg: string) {
        pub.log.push(msg);
        if (pub.log.length > 10) pub.log.shift();
    }

    // Check game over
    async function checkGameOver() {
        if (pub.php <= 0 || pub.ohp <= 0) {
            pub.st = 'result';
            if (pub.ohp <= 0) {
                addLog('Орион уничтожен. Вы победили!');
                const userRef = db.collection('users').doc(uid);
                await db.runTransaction(async (t) => {
                    const doc = await t.get(userRef);
                    if (doc.exists) {
                        t.update(userRef, { proto_coins: (doc.data()?.proto_coins || 0) + REWARD });
                    }
                });
            } else {
                addLog('Ваши системы отказали. Вы проиграли.');
            }
            return true;
        }
        if (pub.sl <= 0) {
            // Reload
            const newAmmo = generateAmmo();
            secret.ammo = newAmmo;
            pub.sl = newAmmo.length;
            pub.pit = [...pub.pit, ...generateItems()].slice(0, 8);
            pub.oit = [...pub.oit, ...generateItems()].slice(0, 8);
            pub.scan = null;
            addLog(`Магазин пуст. Перезарядка. Патронов: ${pub.sl}. Выданы предметы.`);
        }
        return false;
    }

    let endTurn = false;

    // --- Player Action Processing ---
    if (action === 'shoot_self' || action === 'shoot_enemy') {
        const bullet = secret.ammo.shift()!;
        pub.sl--;
        const isLive = bullet === 'live';
        const damage = isLive ? (pub.pdbl ? 2 : 1) : 0;
        pub.pdbl = false;
        pub.scan = null;

        if (action === 'shoot_self') {
            if (isLive) {
                pub.php -= damage;
                addLog(`Вы выстрелили в себя: БОЕВОЙ. -${damage} HP.`);
                endTurn = true;
            } else {
                addLog('Вы выстрелили в себя: ХОЛОСТОЙ. Ход остаётся у вас.');
            }
        } else {
            if (isLive) {
                pub.ohp -= damage;
                addLog(`Вы выстрелили в Ориона: БОЕВОЙ. Ориону -${damage} HP.`);
            } else {
                addLog('Вы выстрелили в Ориона: ХОЛОСТОЙ.');
            }
            endTurn = true;
        }

    } else if (action === 'item') {
        if (typeof itemIndex !== 'number' || itemIndex < 0 || itemIndex >= pub.pit.length) {
            throw new HttpsError('invalid-argument', 'Неверный предмет');
        }
        const item = pub.pit[itemIndex];
        pub.pit.splice(itemIndex, 1);

        switch(item) {
            case 'sc':
                pub.scan = secret.ammo[0];
                addLog(`Сканер: Следующий патрон ${pub.scan === 'live' ? 'БОЕВОЙ' : 'ХОЛОСТОЙ'}.`);
                break;
            case 'co':
                pub.php = Math.min(pub.php + 1, pub.mhp);
                addLog('Охладитель: Восстановлено 1 HP.');
                break;
            case 'ad':
                const discarded = secret.ammo.shift()!;
                pub.sl--;
                pub.scan = null;
                addLog(`Выброшен патрон: ${discarded === 'live' ? 'БОЕВОЙ' : 'ХОЛОСТОЙ'}.`);
                break;
            case 'od':
                pub.pdbl = true;
                addLog('Овердрайв: Следующий выстрел нанесет двойной урон.');
                break;
            case 'ew':
                pub.oskip = true;
                addLog('ЭМИ-граната: Орион пропустит следующий ход.');
                break;
            case 'ps':
                secret.ammo[0] = secret.ammo[0] === 'live' ? 'blank' : 'live';
                pub.scan = null;
                addLog('Инвертор: Полярность следующего патрона изменена.');
                break;
        }
    } else {
        throw new HttpsError('invalid-argument', 'Неизвестное действие');
    }

    if (await checkGameOver()) {
        await Promise.all([
            gameRef.update(pub),
            secretRef.update(secret)
        ]);
        return { success: true };
    }

    if (endTurn) {
        pub.turn = 'orion';
    }

    // --- AI / Turn Handling Loop ---
    // This loop continues until it's genuinely the player's turn to make a move,
    // or the game ends.
    while (pub.turn === 'orion' || (pub.turn === 'player' && pub.pskip)) {
        if (pub.st !== 'playing') break;

        if (pub.turn === 'player' && pub.pskip) {
            pub.pskip = false;
            addLog('Вы пропускаете ход из-за ЭМИ.');
            pub.turn = 'orion';
            // Continue the loop so Orion can take its turn
        }

        if (pub.turn === 'orion' && pub.oskip) {
            pub.oskip = false;
            addLog('Орион пропускает ход из-за ЭМИ.');
            pub.turn = 'player';
            continue;
        }

        // --- Orion AI Logic ---
        if (pub.turn === 'orion') {
            const knowsNext = pub.scan !== null || secret.ammo.length === 1;
            const nextIsLive = knowsNext ? secret.ammo[0] === 'live' : null;

            // Use item logic (70% chance if useful)
            let usedItem = false;
            if (pub.oit.length > 0 && Math.random() < 0.7) {
                for (let i = 0; i < pub.oit.length; i++) {
                    const oItem = pub.oit[i];
                    if (oItem === 'sc' && !knowsNext) {
                        pub.oit.splice(i, 1);
                        pub.scan = secret.ammo[0];
                        addLog('Орион использовал Сканер.');
                        usedItem = true; break;
                    }
                    if (oItem === 'co' && pub.ohp < pub.mhp) {
                        pub.oit.splice(i, 1);
                        pub.ohp++;
                        addLog('Орион использовал Охладитель.');
                        usedItem = true; break;
                    }
                    if (oItem === 'od' && knowsNext && nextIsLive && !pub.odbl) {
                        pub.oit.splice(i, 1);
                        pub.odbl = true;
                        addLog('Орион использовал Овердрайв.');
                        usedItem = true; break;
                    }
                    if (oItem === 'ps' && knowsNext && !nextIsLive) {
                        pub.oit.splice(i, 1);
                        secret.ammo[0] = 'live';
                        pub.scan = null;
                        addLog('Орион использовал Инвертор.');
                        usedItem = true; break;
                    }
                    if (oItem === 'ew' && !pub.pskip) {
                        pub.oit.splice(i, 1);
                        pub.pskip = true;
                        addLog('Орион использовал ЭМИ-гранату.');
                        usedItem = true; break;
                    }
                    if (oItem === 'ad' && knowsNext && !nextIsLive) {
                        pub.oit.splice(i, 1);
                        const discarded = secret.ammo.shift()!;
                        pub.sl--;
                        pub.scan = null;
                        addLog('Орион выбросил патрон.');
                        usedItem = true; break;
                    }
                }
            }

            if (usedItem) {
                if (await checkGameOver()) break;
                continue; // Can use another item or shoot
            }

            // Shoot
            const bullet = secret.ammo.shift()!;
            pub.sl--;
            const isLive = bullet === 'live';
            const damage = isLive ? (pub.odbl ? 2 : 1) : 0;
            pub.odbl = false;
            pub.scan = null;

            let target = 'player';
            if (knowsNext) {
                target = nextIsLive ? 'player' : 'orion';
            } else {
                target = Math.random() < 0.5 ? 'player' : 'orion';
            }

            if (target === 'orion') {
                if (isLive) {
                    pub.ohp -= damage;
                    addLog(`Орион выстрелил в себя: БОЕВОЙ. Ориону -${damage} HP.`);
                    pub.turn = 'player';
                } else {
                    addLog('Орион выстрелил в себя: ХОЛОСТОЙ.');
                    // Keeps turn
                }
            } else {
                if (isLive) {
                    pub.php -= damage;
                    addLog(`Орион выстрелил в вас: БОЕВОЙ. Вам -${damage} HP.`);
                } else {
                    addLog('Орион выстрелил в вас: ХОЛОСТОЙ.');
                }
                pub.turn = 'player';
            }

            if (await checkGameOver()) break;
        }
    }

    await Promise.all([
        gameRef.update(pub),
        secretRef.update(secret)
    ]);
    return { success: true };
});

export const abandonRoulette = onCall({ region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Auth required');
    const uid = request.auth.uid;

    await rtdb.ref(`games/${uid}`).remove();
    await rtdb.ref(`secrets/${uid}`).remove();

    return { success: true };
});
