with open('functions/src/roulette.ts', 'r') as f:
    content = f.read()

new_types = """export type GameEventType =
  | 'item_used'
  | 'shoot'
  | 'reload'
  | 'skip_turn'
  | 'game_over';

export interface GameEvent {
  type:    GameEventType;
  actor:   'player' | 'orion';
  item?:   keyof Items;
  target?: 'self' | 'enemy';
  isLive?: boolean;
  damage?: number;
  shellCount?: number;
  winner?: 'player' | 'orion';
  log: string;
}"""

content = content.replace("export interface PubState {", f"{new_types}\n\nexport interface PubState {{")
content = content.replace("  scan:  number | null; // результат сканера (-1 нет, 0 пусто, 1 заряд)\n}", "  scan:  number | null; // результат сканера (-1 нет, 0 пусто, 1 заряд)\n  events: GameEvent[];\n}")

with open('functions/src/roulette.ts', 'w') as f:
    f.write(content)
