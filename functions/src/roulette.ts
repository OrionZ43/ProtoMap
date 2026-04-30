/**
 * VOLT DEADLOCK — Cloud Functions v2
 * Гипер-оптимизированная логика казино-рулетки.
 *
 * Архитектура:
 *  - startRoulette:       Списывает 500 PC, генерирует игру, пишет в RTDB.
 *  - makeRouletteAction:  Обрабатывает ход игрока + ВСЕ ходы Ориона в одном вызове.
 *  - abandonRoulette:     Вызывается при уходе со страницы; удаляет игру без возврата.
 *
 * RTDB структура:
 *  games/{id}   → публичный стейт (только чтение для владельца)
 *  secrets/{id} → массив патронов (нет прав у клиента)
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

/* ══════════════════════════════════════════════════════════
   ТИПЫ (короткие ключи = меньше байт в RTDB)
══════════════════════════════════════════════════════════ */

/** Предметы игрока/Ориона. Счётчик каждого типа. */
export interface Items {
  sc: number; // scanner
  co: number; // coolant
  ad: number; // air_duster
  od: number; // overdrive
  ew: number; // emp_wire
  ps: number; // polarity_switch
}

/** Публичный стейт в RTDB (читает клиент). */
export interface PubState {
  uid:   string;
  turn:  'p' | 'o';
  php:   number;       // player HP
  ohp:   number;       // orion HP
  mhp:   number;       // max HP (для отображения)
  pit:   Items;        // player items
  oit:   Items;        // orion items
  sl:    number;       // shells left
  log:   string;       // последнее действие для UI
  st:    'a' | 'p' | 'o'; // active | player-won | orion-won
  pdbl:  boolean;      // overdrive игрока активен
  odbl:  boolean;      // overdrive Ориона активен
  pskip: boolean;      // ход игрока будет пропущен (EMP)
  oskip: boolean;      // ход Ориона будет пропущен (EMP)
  scan:  number | null; // результат сканера (-1 нет, 0 пусто, 1 заряд)
}

/** Секретный стейт (только бэкенд). */
interface Secrets {
  ammo: number[]; // 0=blank, 1=live
}

/* ══════════════════════════════════════════════════════════
   КОНСТАНТЫ И ХЕЛПЕРЫ
══════════════════════════════════════════════════════════ */

const ENTRY_FEE   = 500;
const WIN_REWARD  = 1000;
const MAX_ITEM    = 5;   // максимум одного предмета
const ITEM_KEYS: (keyof Items)[] = ['sc', 'co', 'ad', 'od', 'ew', 'ps'];

const rtdb   = () => admin.app().database("https://protomap-1e1db-default-rtdb.europe-west1.firebasedatabase.app");
const fstore = () => admin.firestore();

function emptyItems(): Items {
  return { sc: 0, co: 0, ad: 0, od: 0, ew: 0, ps: 0 };
}

/** Выдаёт 2-4 случайных предмета. */
function distributeItems(): Items {
  const it = emptyItems();
  const count = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i++) {
    const k = ITEM_KEYS[Math.floor(Math.random() * ITEM_KEYS.length)];
    it[k] = Math.min(MAX_ITEM, it[k] + 1);
  }
  return it;
}

/** Суммирует предметы (cap = MAX_ITEM). */
function mergeItems(target: Items, source: Items) {
  for (const k of ITEM_KEYS) {
    target[k] = Math.min(MAX_ITEM, target[k] + source[k]);
  }
}

/** Генерирует перемешанный магазин (2-8 патронов, хотя бы 1 боевой и 1 холостой). */
function generateAmmo(): number[] {
  const total  = 2 + Math.floor(Math.random() * 7);
  const lives  = Math.max(1, Math.floor(Math.random() * (total - 1)) + 1);
  const blanks = Math.max(1, total - lives);
  const arr    = [...Array(lives).fill(1), ...Array(blanks).fill(0)];
  // Fisher-Yates
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function genHp(): number {
  return 4 + Math.floor(Math.random() * 3); // 4-6
}

/** Перезарядка магазина + выдача новых предметов. Мутирует ammo[]. */
function reloadMagazine(pub: PubState, ammo: number[]): void {
  const fresh = generateAmmo();
  ammo.push(...fresh);
  pub.sl = ammo.length;
  mergeItems(pub.pit, distributeItems());
  mergeItems(pub.oit, distributeItems());
  pub.log += ' ║ 🔄 Новый магазин [' + fresh.length + ' патр.]';
}

/* ══════════════════════════════════════════════════════════
   ИИ ОРИОНА — вычисляется на сервере в рамках одного вызова
══════════════════════════════════════════════════════════ */

function orionDecide(pub: PubState, ammo: number[]): string {
  const oit    = pub.oit;
  const shell  = ammo[0];
  const isLive = shell === 1;
  const total  = ammo.length;
  const lives  = ammo.filter(x => x === 1).length;
  const liveOdds = total > 0 ? lives / total : 0;
  const pItems = Object.values(pub.pit).reduce((a, b) => a + b, 0);

  // ── Предметы (приоритет сверху вниз) ──────────────────

  // EMP: нейтрализуем overdrive игрока или многочисленный инвентарь
  if (oit.ew > 0 && (pub.pdbl || pItems >= 4)) {
    return 'item_ew';
  }

  // Coolant: heal при критическом HP
  if (oit.co > 0 && pub.ohp === 1) {
    return 'item_co';
  }

  // Air Duster: выброс боевого при угрозе жизни
  if (oit.ad > 0 && isLive && pub.ohp <= 2 && !pub.odbl) {
    return 'item_ad';
  }

  // Polarity Switch: тактические инверсии
  if (oit.ps > 0) {
    // холостой при низкой вероятности боевых → сделать боевым, стрелять в игрока
    if (!isLive && liveOdds < 0.35) {
      return 'item_ps';
    }
    // боевой, Орион почти мёртв, игрок здоров → инвертируем (станет холостым), безопасный выстрел в себя
    if (isLive && pub.ohp === 1 && pub.php > 2) {
      return 'item_ps';
    }
  }

  // Coolant: heal при отставании по HP
  if (oit.co > 0 && pub.ohp < pub.php && pub.ohp <= 2) {
    return 'item_co';
  }

  // Overdrive: активируем перед боевым выстрелом в игрока
  if (oit.od > 0 && isLive && !pub.odbl && pub.ohp > 2) {
    return 'item_od';
  }

  // ── Выстрел ───────────────────────────────────────────
  if (isLive) {
    return 'shoot_enemy'; // точно стреляем в игрока
  } else {
    return 'shoot_self';  // холостой → бесплатный доп. ход
  }
}

/* ══════════════════════════════════════════════════════════
   ОБРАБОТКА ДЕЙСТВИЯ (универсальная для игрока и Ориона)
   Возвращает true если ход остаётся у того же игрока.
══════════════════════════════════════════════════════════ */

function processAction(
  action:   string,
  isPlayer: boolean,
  pub:      PubState,
  ammo:     number[]
): boolean {
  const items: Items = isPlayer ? pub.pit : pub.oit;
  const who = isPlayer ? 'Игрок' : 'Орион';

  /* ── ПРЕДМЕТЫ ── */

  if (action === 'item_sc') {
    if (items.sc <= 0) throw new HttpsError('failed-precondition', 'Нет сканера');
    items.sc--;
    if (isPlayer) pub.scan = ammo[0]; // показываем только игроку
    pub.log = isPlayer
      ? `[SCANNER] Следующий: ${ammo[0] === 1 ? '⚡ БОЕВОЙ' : '○ ХОЛОСТОЙ'}`
      : '[ОРИОН] Орион просканировал патрон';
    return true; // ход продолжается
  }

  if (action === 'item_co') {
    if (items.co <= 0) throw new HttpsError('failed-precondition', 'Нет кулера');
    items.co--;
    if (isPlayer) pub.php = Math.min(pub.mhp, pub.php + 1);
    else          pub.ohp = Math.min(pub.mhp, pub.ohp + 1);
    pub.log = `[COOLANT] ${who} восстановил 1 HP`;
    return true;
  }

  if (action === 'item_ad') {
    if (items.ad <= 0) throw new HttpsError('failed-precondition', 'Нет продувки');
    items.ad--;
    const ejected = ammo.shift()!;
    pub.sl   = ammo.length;
    pub.scan = null;
    pub.log  = `[AIR DUSTER] ${who} выбросил: ${ejected === 1 ? '⚡ БОЕВОЙ' : '○ ХОЛОСТОЙ'}`;
    if (ammo.length === 0) reloadMagazine(pub, ammo);
    return true;
  }

  if (action === 'item_od') {
    if (items.od <= 0) throw new HttpsError('failed-precondition', 'Нет overdrive');
    items.od--;
    if (isPlayer) pub.pdbl = true;
    else          pub.odbl = true;
    pub.log = `[OVERDRIVE] ${who}: следующий выстрел ×2 урона!`;
    return true;
  }

  if (action === 'item_ew') {
    if (items.ew <= 0) throw new HttpsError('failed-precondition', 'Нет EMP');
    items.ew--;
    if (isPlayer) pub.oskip = true;
    else          pub.pskip = true;
    pub.log = isPlayer
      ? '[EMP WIRE] Орион пропустит следующий ход!'
      : '[ЭМИ ВОЛНА] Ваш ход будет пропущен!';
    return true;
  }

  if (action === 'item_ps') {
    if (items.ps <= 0) throw new HttpsError('failed-precondition', 'Нет переключателя');
    items.ps--;
    ammo[0]  = 1 - ammo[0]; // инвертируем
    pub.scan = null;
    pub.log  = `[POLARITY] ${who}: патрон инвертирован → ${ammo[0] === 1 ? '⚡ БОЕВОЙ' : '○ ХОЛОСТОЙ'}`;
    return true;
  }

  /* ── ВЫСТРЕЛЫ ── */

  if (action === 'shoot_self' || action === 'shoot_enemy') {
    const shell = ammo.shift()!;
    pub.sl   = ammo.length;
    pub.scan = null;

    const dbl    = isPlayer ? pub.pdbl : pub.odbl;
    const damage = shell === 1 ? (dbl ? 2 : 1) : 0;

    // Сбрасываем overdrive после выстрела
    if (isPlayer) pub.pdbl = false;
    else          pub.odbl = false;

    if (action === 'shoot_self') {
      if (isPlayer) pub.php -= damage;
      else          pub.ohp -= damage;
      pub.log = isPlayer
        ? shell === 1
          ? `[В СЕБЯ] ⚡ Боевой! -${damage} HP!`
          : '[В СЕБЯ] ○ Холостой. Доп. ход!'
        : shell === 1
          ? `[ОРИОН В СЕБЯ] ⚡ Попал! -${damage} HP Ориона`
          : '[ОРИОН В СЕБЯ] ○ Холостой. Орион ходит снова.';
    } else {
      if (isPlayer) pub.ohp -= damage;
      else          pub.php -= damage;
      pub.log = isPlayer
        ? shell === 1
          ? `[ОГОНЬ] ⚡ Попал в Ориона! -${damage} HP!`
          : '[ОГОНЬ] ○ Холостой. Орион жив.'
        : shell === 1
          ? `[ОРИОН СТРЕЛЯЕТ] ⚡ Попадание! -${damage} HP!`
          : '[ОРИОН СТРЕЛЯЕТ] ○ Холостой. Пронесло!';
    }

    // Проверка смерти
    if (pub.php <= 0) { pub.st = 'o'; pub.php = 0; }
    if (pub.ohp <= 0) { pub.st = 'p'; pub.ohp = 0; }

    // Перезарядка если магазин пуст (и игра ещё идёт)
    if (ammo.length === 0 && pub.st === 'a') {
      reloadMagazine(pub, ammo);
    }

    // Холостой в себя = доп. ход
    if (action === 'shoot_self' && shell === 0) return true;
    return false; // ход переходит
  }

  throw new HttpsError('invalid-argument', `Неизвестное действие: ${action}`);
}

/* ══════════════════════════════════════════════════════════
   ЗАВЕРШЕНИЕ ИГРЫ — начисляем/ничего и удаляем из RTDB
══════════════════════════════════════════════════════════ */

async function finishGame(uid: string, playerWon: boolean): Promise<void> {
  if (!playerWon) return; // ставка уже списана при старте
  const ref = fstore().collection('users').doc(uid);
  await fstore().runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) return;
    const credits: number = snap.data()!.casino_credits ?? 0;
    t.update(ref, { casino_credits: credits + WIN_REWARD });
  });
}

/* ══════════════════════════════════════════════════════════
   ЭКСПОРТИРУЕМЫЕ CLOUD FUNCTIONS
══════════════════════════════════════════════════════════ */

export const startRoulette = onCall(
  { region: 'us-central1', enforceAppCheck: true },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Требуется авторизация');
    const uid = req.auth.uid;

    // --- Списать ставку (транзакция Firestore) ---
    const userRef = fstore().collection('users').doc(uid);
    await fstore().runTransaction(async (t) => {
      const snap = await t.get(userRef);
      if (!snap.exists) throw new HttpsError('not-found', 'Пользователь не найден');
      const credits: number = snap.data()!.casino_credits ?? 0;
      if (credits < ENTRY_FEE) {
        throw new HttpsError('failed-precondition', `Недостаточно PC (нужно ${ENTRY_FEE})`);
      }
      t.update(userRef, { casino_credits: credits - ENTRY_FEE });
    });

    // --- Уничтожить старую игру (защита от дублей) ---
    const existing = await rtdb()
      .ref('games')
      .orderByChild('uid')
      .equalTo(uid)
      .limitToFirst(1)
      .once('value');
    if (existing.exists()) {
      const oldId = Object.keys(existing.val())[0];
      await Promise.all([
        rtdb().ref(`games/${oldId}`).remove(),
        rtdb().ref(`secrets/${oldId}`).remove(),
      ]);
    }

    // --- Генерация игры ---
    const hp   = genHp();
    const ammo = generateAmmo();
    const gid  = rtdb().ref('games').push().key!;

    const pub: PubState = {
      uid,
      turn:  'p',
      php:   hp,
      ohp:   hp,
      mhp:   hp,
      pit:   distributeItems(),
      oit:   distributeItems(),
      sl:    ammo.length,
      log:   '⚡ VOLT DEADLOCK инициализирован. Твой ход, оператор.',
      st:    'a',
      pdbl:  false,
      odbl:  false,
      pskip: false,
      oskip: false,
      scan:  null,
    };

    const secrets: Secrets = { ammo };

    await Promise.all([
      rtdb().ref(`games/${gid}`).set(pub),
      rtdb().ref(`secrets/${gid}`).set(secrets),
    ]);

    return { gameId: gid };
  }
);

/* ─────────────────────────────────────────────────────── */

export const makeRouletteAction = onCall(
  { region: 'us-central1', enforceAppCheck: true },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Требуется авторизация');
    const uid = req.auth.uid;
    const { gameId, action } = req.data as { gameId: string; action: string };

    if (!gameId || !action) {
      throw new HttpsError('invalid-argument', 'Отсутствует gameId или action');
    }

    const VALID_ACTIONS = new Set([
      'shoot_self', 'shoot_enemy',
      'item_sc', 'item_co', 'item_ad', 'item_od', 'item_ew', 'item_ps',
    ]);
    if (!VALID_ACTIONS.has(action)) {
      throw new HttpsError('invalid-argument', 'Недопустимое действие');
    }

    // --- Загрузка стейта ---
    const [pubSnap, secSnap] = await Promise.all([
      rtdb().ref(`games/${gameId}`).once('value'),
      rtdb().ref(`secrets/${gameId}`).once('value'),
    ]);
    if (!pubSnap.exists() || !secSnap.exists()) {
      throw new HttpsError('not-found', 'Игра не найдена');
    }

    const pub: PubState  = pubSnap.val();
    const secrets: Secrets = secSnap.val();
    const ammo: number[] = [...secrets.ammo]; // мутируемая копия

    // --- Валидация ---
    if (pub.uid  !== uid)   throw new HttpsError('permission-denied', 'Это не ваша игра');
    if (pub.st   !== 'a')   throw new HttpsError('failed-precondition', 'Игра уже завершена');
    if (pub.turn !== 'p')   throw new HttpsError('failed-precondition', 'Сейчас не ваш ход');

    // --- Ход игрока ---
    const playerKeepTurn = processAction(action, true, pub, ammo);

    // --- Передача хода ---
    if (pub.st === 'a') {
      if (!playerKeepTurn) {
        // Передача к Ориону (учитываем oskip от EMP)
        if (pub.oskip) {
          pub.oskip = false;
          pub.turn  = 'p'; // Орион пропускает → снова игрок
        } else {
          pub.turn = 'o';
        }
      }
      // else: игрок держит ход (холостой в себя / предмет)

      // --- Цикл ходов Ориона (всё в одном вызове!) ---
      let itr = 0;
      while (pub.st === 'a' && pub.turn === 'o' && itr < 30) {
        itr++;

        // EMP на Ориона
        if (pub.oskip) {
          pub.oskip = false;
          pub.turn  = 'p';
          break;
        }

        const orionAction    = orionDecide(pub, ammo);
        const orionKeepTurn  = processAction(orionAction, false, pub, ammo);

        if (pub.st !== 'a') break; // кто-то умер

        if (!orionKeepTurn) {
          // Передача игроку (учитываем pskip)
          if (pub.pskip) {
            pub.pskip = false;
            pub.turn  = 'o'; // EMP — игрок пропускает → Орион снова
          } else {
            pub.turn = 'p';
            break;
          }
        }
        // else: Орион держит ход (предмет / холостой в себя)
      }
    }

    // --- Запись результата ---
    if (pub.st !== 'a') {
      // Игра закончена: начисляем/нет, удаляем из RTDB
      await finishGame(uid, pub.st === 'p');
      await rtdb().ref().update({
        [`games/${gameId}`]:   null,
        [`secrets/${gameId}`]: null,
      });
    } else {
      // Атомарно обновляем оба узла
      await rtdb().ref().update({
        [`games/${gameId}`]:   pub,
        [`secrets/${gameId}`]: { ammo },
      });
    }

    return { st: pub.st, log: pub.log };
  }
);

/* ─────────────────────────────────────────────────────── */

/** Вызывается фронтендом при уходе со страницы — сессия сгорает. */
export const abandonRoulette = onCall(
  { region: 'us-central1', enforceAppCheck: true },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Требуется авторизация');
    const uid = req.auth.uid;
    const { gameId } = req.data as { gameId: string };
    if (!gameId) throw new HttpsError('invalid-argument', 'Нет gameId');

    const snap = await rtdb().ref(`games/${gameId}`).once('value');
    if (!snap.exists()) return { ok: true };

    const pub: PubState = snap.val();
    if (pub.uid !== uid) throw new HttpsError('permission-denied', 'Не ваша игра');
    if (pub.st  !== 'a') return { ok: true }; // уже завершена

    // Орион побеждает по умолчанию (ставка уже списана, возврата нет)
    await Promise.all([
      rtdb().ref(`games/${gameId}`).remove(),
      rtdb().ref(`secrets/${gameId}`).remove(),
    ]);

    return { ok: true };
  }
);
