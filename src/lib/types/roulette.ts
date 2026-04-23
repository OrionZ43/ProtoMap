export type ItemCode = 'sc' | 'co' | 'ad' | 'od' | 'ew' | 'ps';

export interface PubState {
    turn: 'player' | 'orion';
    php: number; // Player HP
    ohp: number; // Orion HP
    mhp: number; // Max HP
    pit: ItemCode[]; // Player items
    oit: ItemCode[]; // Orion items
    sl: number; // Shells left
    log: string[]; // Action log
    st: 'lobby' | 'playing' | 'result'; // State
    pdbl: boolean; // Player next shot double damage
    odbl: boolean; // Orion next shot double damage
    pskip: boolean; // Player skips turn
    oskip: boolean; // Orion skips turn
    scan: 'live' | 'blank' | null; // Result of last scan
}

export const ITEMS_META: Record<ItemCode, { name: string, desc: string, icon: string, color: string }> = {
    'sc': { name: 'Сканер', desc: 'Показывает текущий патрон', icon: '🔍', color: 'text-blue-400' },
    'co': { name: 'Охладитель', desc: 'Восстанавливает 1 HP', icon: '🧊', color: 'text-cyan-400' },
    'ad': { name: 'Сброс', desc: 'Выбрасывает текущий патрон', icon: '💨', color: 'text-gray-400' },
    'od': { name: 'Овердрайв', desc: 'Следующий выстрел: 2 урона', icon: '🔥', color: 'text-red-500' },
    'ew': { name: 'ЭМИ-граната', desc: 'Противник пропускает ход', icon: '⚡', color: 'text-purple-400' },
    'ps': { name: 'Инвертор', desc: 'Меняет полярность патрона', icon: '🔄', color: 'text-green-400' },
};
