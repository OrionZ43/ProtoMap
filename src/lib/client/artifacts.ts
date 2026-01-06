export type ArtifactDef = {
    id: string;
    icon: string;
    color: string;
    rarity: 'common' | 'uncommon' | 'rare' | 'legendary' | 'cursed';
};

export const ARTIFACTS_DATA: Record<string, ArtifactDef> = {
    'toast':        { id: 'toast',        icon: '🍞', color: '#cd7f32', rarity: 'common' },
    'ram_stick':    { id: 'ram_stick',    icon: '💾', color: '#39ff14', rarity: 'common' },
    // 👇 НОВОЕ
    'rubber_duck':  { id: 'rubber_duck',  icon: '🐤', color: '#ffd700', rarity: 'common' },

    'energy_drink': { id: 'energy_drink', icon: '⚡', color: '#00f3ff', rarity: 'uncommon' },
    'gpu_fan':      { id: 'gpu_fan',      icon: '🌀', color: '#00f3ff', rarity: 'uncommon' },

    'spaghetti':    { id: 'spaghetti',    icon: '🍝', color: '#ffcc00', rarity: 'cursed' },
    'blue_screen':  { id: 'blue_screen',  icon: '💻', color: '#0000ff', rarity: 'cursed' },
    'bug':          { id: 'bug',          icon: '🪲', color: '#ff003c', rarity: 'cursed' },
    // 👇 НОВОЕ
    '404_error':    { id: '404_error',    icon: '🚫', color: '#888888', rarity: 'cursed' },
    'ransomware':   { id: 'ransomware',   icon: '💀', color: '#ff0000', rarity: 'cursed' },

    'banhammer':    { id: 'banhammer',    icon: '🔨', color: '#ff003c', rarity: 'rare' },
    'source_code':  { id: 'source_code',  icon: '📜', color: '#00ff9d', rarity: 'rare' },
    // 👇 НОВОЕ
    'rtx_card':     { id: 'rtx_card',     icon: '📼', color: '#76b900', rarity: 'rare' },

    'orion_tear':   { id: 'orion_tear',   icon: '💎', color: '#bd00ff', rarity: 'legendary' },
    // 👇 НОВОЕ
    'admin_key':    { id: 'admin_key',    icon: '🗝️', color: '#ffffff', rarity: 'legendary' }
};