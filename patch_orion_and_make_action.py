import re

with open('functions/src/roulette.ts', 'r') as f:
    content = f.read()

# Replace orionDecide
orion_decide_old = """function orionDecide(pub: PubState, ammo: number[]): string {
  const oit = pub.oit;
  const shell = ammo[0];

  // 1. Лечиться если мало ХП (приоритет 1)
  if (pub.ohp <= 2 && oit.co > 0) return 'item_co';

  // 2. Сканер, если не знаем что в стволе
  if (pub.scan === null && oit.sc > 0 && ammo.length > 1) return 'item_sc';

  // Мы знаем патрон (через сканер или логику)?
  const isKnown = pub.scan !== null || ammo.length === 1;

  if (isKnown) {
    const live = shell === 1;

    // 3. Если боевой -> юзаем overdrive и стреляем в игрока
    if (live) {
      if (oit.od > 0 && !pub.odbl) return 'item_od';
      return 'shoot_enemy';
    }

    // 4. Если холостой -> можем выбросить или выстрелить в себя
    if (!live) {
      if (oit.ps > 0 && ammo.length === 1 && pub.php > 1) {
        // превратить в боевой и убить
        return 'item_ps';
      }
      return 'shoot_self'; // безопасно, доп. ход
    }
  }

  // 5. Не знаем -> вероятностный подход
  const lives = ammo.filter((x) => x === 1).length;
  const odds  = lives / ammo.length;

  // Опасный патрон? Выбросим!
  if (odds > 0.5 && oit.ad > 0) return 'item_ad';

  // Низкий шанс боевого -> стреляем в себя
  if (odds < 0.4) return 'shoot_self';

  // Иначе стреляем в игрока
  return 'shoot_enemy';
}"""

orion_decide_new = """function orionDecide(pub: PubState, ammo: number[]): string {
  const oit = pub.oit;
  const total = ammo.length;
  const lives = ammo.filter(x => x === 1).length;
  const liveOdds = total > 0 ? lives / total : 0;
  const pItems = Object.values(pub.pit).reduce((a, b) => a + b, 0);

  // ── ЗНАНИЕ О ПАТРОНЕ ──────────────────────────────────
  // Орион знает текущий патрон ТОЛЬКО если:
  //   (a) сам юзал сканер на этом ходу (pub.scan !== null и actor === 'orion')
  //   (b) остался 1 патрон в магазине (детерминировано)
  // В остальных случаях — вероятностная оценка.
  const knowsShell = total === 1 || pub.scan !== null;          // детерминированное знание
  const shell      = knowsShell ? ammo[0] : null;  // null = не знает точно
  const isLive     = shell !== null ? shell === 1 : null;

  // ── БЛЕФ: ~15% шанс ошибки/случайного действия ───────
  const BLUFF_CHANCE = 0.15;
  const bluffRoll = Math.random();

  // ── ПРЕДМЕТЫ (только если нет блефа) ─────────────────
  if (bluffRoll >= BLUFF_CHANCE) {

    // EMP: нейтрализовать overdrive или богатый инвентарь
    if (oit.ew > 0 && (pub.pdbl || pItems >= 4)) return 'item_ew';

    // Coolant: лечиться при критическом HP
    if (oit.co > 0 && pub.ohp === 1) return 'item_co';

    // Scanner: использовать если не знаем патрон и есть неопределённость
    if (oit.sc > 0 && !knowsShell && liveOdds > 0.3 && liveOdds < 0.7) return 'item_sc';

    // Air Duster: выбросить боевой, только если ЗНАЕМ что он боевой
    if (oit.ad > 0 && isLive === true && pub.ohp <= 2 && !pub.odbl) return 'item_ad';

    // Polarity Switch: тактические инверсии только при точном знании
    if (oit.ps > 0 && knowsShell) {
      if (isLive === false && liveOdds < 0.35) return 'item_ps';
      if (isLive === true  && pub.ohp === 1 && pub.php > 2) return 'item_ps';
    }

    // Coolant: heal при отставании
    if (oit.co > 0 && pub.ohp < pub.php && pub.ohp <= 2) return 'item_co';

    // Overdrive: активировать перед боевым, только если знаем
    if (oit.od > 0 && isLive === true && !pub.odbl && pub.ohp > 2) return 'item_od';
  }

  // ── ВЫСТРЕЛ ───────────────────────────────────────────
  if (knowsShell) {
    // Детерминированное решение
    if (isLive) return 'shoot_enemy';
    else        return 'shoot_self';
  }

  // Вероятностное решение: стрелять в себя если шанс боевого < 40%
  // (экономим HP, получаем доп. ход при холостом)
  if (liveOdds < 0.40) return 'shoot_self';
  return 'shoot_enemy';
}"""

content = content.replace(orion_decide_old, orion_decide_new)

# Update makeRouletteAction block
make_action_old = """    // --- Ход игрока ---
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

    // --- Запись результата ---"""

make_action_new = """    const events: GameEvent[] = [];

    // --- Ход игрока ---
    const playerKeepTurn = processAction(action, true, pub, ammo, events);

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
        const orionKeepTurn  = processAction(orionAction, false, pub, ammo, events);

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

    pub.events = events.length > 0 ? events : [{type: 'game_over', actor: 'orion', log: 'No events'} as GameEvent];
    pub.log = pub.events[pub.events.length - 1]?.log ?? pub.log;

    // --- Запись результата ---"""

content = content.replace(make_action_old, make_action_new)

# Update start game init pub
start_pub_old = """    const pub: PubState = {
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
    };"""
start_pub_new = """    const pub: PubState = {
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
      events: [],
    };"""

content = content.replace(start_pub_old, start_pub_new)

with open('functions/src/roulette.ts', 'w') as f:
    f.write(content)
