/**
 * src/lib/types/roulette.ts
 * Общие типы для VOLT DEADLOCK (клиентская сторона).
 */

export interface Items {
  sc: number; // scanner
  co: number; // coolant
  ad: number; // air_duster
  od: number; // overdrive
  ew: number; // emp_wire
  ps: number; // polarity_switch
}

export const ITEM_META: Record<keyof Items, { label: string; icon: string; desc: string; color: string }> = {
  sc: { label: 'SCANNER',  icon: '⬡', desc: 'Показывает тек. патрон',        color: '#00f0ff' },
  co: { label: 'COOLANT',  icon: '❄', desc: '+1 HP',                          color: '#39ff14' },
  ad: { label: 'AIR DUS',  icon: '💨', desc: 'Выбрасывает текущий патрон',    color: '#bd00ff' },
  od: { label: 'OVERDRIVE',icon: '⚡', desc: 'Следующий выстрел ×2 урона',    color: '#fcee0a' },
  ew: { label: 'EMP WIRE', icon: '⌁', desc: 'Противник пропускает ход',       color: '#ff00c1' },
  ps: { label: 'POLARITY', icon: '⇌', desc: 'Инвертирует текущий патрон',     color: '#ff6a00' },
};
