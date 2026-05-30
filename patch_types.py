import re

with open('src/lib/types/roulette.ts', 'r') as f:
    content = f.read()

new_types = """
export type GameEventType =
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
}
"""

content = content + new_types

with open('src/lib/types/roulette.ts', 'w') as f:
    f.write(content)
