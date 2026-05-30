with open('functions/src/roulette.ts', 'r') as f:
    content = f.read()

content = content.replace("export interface GameEventType { type: string } // placeholder for compilation", "")
content = content.replace("export type GameEventT =", "export type GameEventType =")
content = content.replace("type:    GameEventT;", "type:    GameEventType;")

with open('functions/src/roulette.ts', 'w') as f:
    f.write(content)
