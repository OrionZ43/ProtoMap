import re

with open('functions/src/roulette.ts', 'r') as f:
    content = f.read()

# 1. Update PubState
pubstate_search = r"""export interface PubState {
  uid:   string;
  turn:  'p' | 'o';
  php:   number;
  ohp:   number;
  mhp:   number;
  pit:   Items;
  oit:   Items;
  sl:    number;
  log:   string;
  st:    'a' | 'p' | 'o';
  pdbl:  boolean;
  odbl:  boolean;
  pskip: boolean;
  oskip: boolean;
  scan:  number \| null \| undefined;
}"""

pubstate_replace = """export interface GameEventType { type: string } // placeholder for compilation
export type GameEventT =
  | 'item_used'
  | 'shoot'
  | 'reload'
  | 'skip_turn'
  | 'game_over';

export interface GameEvent {
  type:    GameEventT;
  actor:   'player' | 'orion';
  item?:   keyof Items;
  target?: 'self' | 'enemy';
  isLive?: boolean;
  damage?: number;
  shellCount?: number;
  winner?: 'player' | 'orion';
  log: string;
}

export interface PubState {
  uid:   string;
  turn:  'p' | 'o';
  php:   number;
  ohp:   number;
  mhp:   number;
  pit:   Items;
  oit:   Items;
  sl:    number;
  log:   string;
  st:    'a' | 'p' | 'o';
  pdbl:  boolean;
  odbl:  boolean;
  pskip: boolean;
  oskip: boolean;
  scan:  number | null | undefined;
  events: GameEvent[];
}"""

content = content.replace("export interface PubState {\n  uid:   string;\n  turn:  'p' | 'o';\n  php:   number;\n  ohp:   number;\n  mhp:   number;\n  pit:   Items;\n  oit:   Items;\n  sl:    number;\n  log:   string;\n  st:    'a' | 'p' | 'o';\n  pdbl:  boolean;\n  odbl:  boolean;\n  pskip: boolean;\n  oskip: boolean;\n  scan:  number | null | undefined;\n}", pubstate_replace)


# 2. Update processAction signature and body
process_action_old = """function processAction(
  action:   string,
  isPlayer: boolean,
  pub:      PubState,
  ammo:     number[]
): boolean {"""

process_action_new = """function processAction(
  action:   string,
  isPlayer: boolean,
  pub:      PubState,
  ammo:     number[],
  events:   GameEvent[]
): boolean {"""

content = content.replace(process_action_old, process_action_new)

# replace logs with events in processAction body
# Scanner
content = content.replace("""pub.log = `[SCANNER] ${who} проверил патрон: ${ammo[0] === 1 ? '⚡ БОЕВОЙ' : '○ ХОЛОСТОЙ'}`;""", """pub.log = `[SCANNER] ${who} проверил патрон: ${ammo[0] === 1 ? '⚡ БОЕВОЙ' : '○ ХОЛОСТОЙ'}`;\n    events.push({ type: 'item_used', actor: isPlayer ? 'player' : 'orion', item: 'sc', log: pub.log });""")

# Coolant
content = content.replace("""pub.log = `[COOLANT] ${who} восстановил 1 HP (теперь ${isPlayer ? pub.php : pub.ohp})`;""", """pub.log = `[COOLANT] ${who} восстановил 1 HP (теперь ${isPlayer ? pub.php : pub.ohp})`;\n    events.push({ type: 'item_used', actor: isPlayer ? 'player' : 'orion', item: 'co', log: pub.log });""")

# Air Duster (skip reload events inside here, will handle later)
content = content.replace("""pub.log  = `[AIR DUSTER] ${who} выбросил: ${ejected === 1 ? '⚡ БОЕВОЙ' : '○ ХОЛОСТОЙ'}`;""", """pub.log  = `[AIR DUSTER] ${who} выбросил: ${ejected === 1 ? '⚡ БОЕВОЙ' : '○ ХОЛОСТОЙ'}`;\n    events.push({ type: 'item_used', actor: isPlayer ? 'player' : 'orion', item: 'ad', log: pub.log });""")

content = content.replace("""if (ammo.length === 0) reloadMagazine(pub, ammo);""", """if (ammo.length === 0 && pub.st === 'a') {\n      const prevLen = ammo.length;\n      reloadMagazine(pub, ammo);\n      events.push({ type: 'reload', actor: isPlayer ? 'player' : 'orion', shellCount: ammo.length - prevLen, log: '🔄 Новый магазин' });\n    }""")


# Overdrive
content = content.replace("""pub.log = `[OVERDRIVE] ${who}: следующий выстрел ×2 урона!`;""", """pub.log = `[OVERDRIVE] ${who}: следующий выстрел ×2 урона!`;\n    events.push({ type: 'item_used', actor: isPlayer ? 'player' : 'orion', item: 'od', log: pub.log });""")

# EMP Wire
content = content.replace("""pub.log = isPlayer
      ? '[EMP WIRE] Орион пропустит следующий ход!'
      : '[ЭМИ ВОЛНА] Ваш ход будет пропущен!';""", """pub.log = isPlayer
      ? '[EMP WIRE] Орион пропустит следующий ход!'
      : '[ЭМИ ВОЛНА] Ваш ход будет пропущен!';
    events.push({ type: 'item_used', actor: isPlayer ? 'player' : 'orion', item: 'ew', log: pub.log });
    events.push({ type: 'skip_turn', actor: isPlayer ? 'orion' : 'player', log: pub.log });""")

# Polarity Switch
content = content.replace("""pub.log  = `[POLARITY] ${who}: патрон инвертирован → ${ammo[0] === 1 ? '⚡ БОЕВОЙ' : '○ ХОЛОСТОЙ'}`;""", """pub.log  = `[POLARITY] ${who}: патрон инвертирован → ${ammo[0] === 1 ? '⚡ БОЕВОЙ' : '○ ХОЛОСТОЙ'}`;\n    events.push({ type: 'item_used', actor: isPlayer ? 'player' : 'orion', item: 'ps', log: pub.log });""")

# Shoot Action
shoot_old = """    if (action === 'shoot_self') {
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
    }"""

shoot_new = """    if (action === 'shoot_self') {
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

    events.push({
      type:   'shoot',
      actor:  isPlayer ? 'player' : 'orion',
      target: action === 'shoot_self' ? 'self' : 'enemy',
      isLive: shell === 1,
      damage,
      log: pub.log,
    });

    // Проверка смерти
    if (pub.php <= 0) { pub.st = 'o'; pub.php = 0; }
    if (pub.ohp <= 0) { pub.st = 'p'; pub.ohp = 0; }

    if (pub.php <= 0 || pub.ohp <= 0) {
      events.push({ type: 'game_over', actor: isPlayer ? 'player' : 'orion', winner: pub.st === 'p' ? 'player' : 'orion', log: pub.st === 'p' ? 'Игрок победил' : 'Орион победил' });
    }

    // Перезарядка если магазин пуст (и игра ещё идёт)
    if (ammo.length === 0 && pub.st === 'a') {
      const prevLen = ammo.length;
      reloadMagazine(pub, ammo);
      events.push({ type: 'reload', actor: isPlayer ? 'player' : 'orion', shellCount: ammo.length - prevLen, log: '🔄 Новый магазин' });
    }"""
content = content.replace(shoot_old, shoot_new)

with open('functions/src/roulette.ts', 'w') as f:
    f.write(content)
