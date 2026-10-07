// Фраза рядом с логотипом в шапке. В сезон — одна из фраз сезона на языке
// интерфейса (season.phrases.* в локалях), в остальные дни — пасхалка из TEASERS.
// Даты сезонов — в ./seasons.ts.
import type { Season } from './seasons';

/** Куда ведёт фраза в сезон. */
export const SEASON_LINKS: Record<Season, string> = {
    anniversary: 'https://t.me/proto_map',
    halloween: 'https://vm.tiktok.com/ZMAqvpf1X/',
    winter: 'https://t.me/proto_map',
    newyear: 'https://t.me/proto_map',
    april: 'https://t.me/proto_map',
};

// === ПАСХАЛКИ И ПРИКОЛЫ (Когда нет ивентов) ===

type Teaser = {
    text: string;
    link?: string; // Опциональная ссылка
};

const TEASERS: Teaser[] =[
    // Стандартное (повторяем несколько раз, чтобы выпадало чаще)
    { text: 'by Orion_Z43' },
    { text: 'by Orion_Z43' },
    { text: 'by Orion_Z43' },

    // Прото-мемы
    { text: 'I ate all your RAM!' },
    { text: 'Beep Boop!' },
    { text: 'Powered by Toasters' },
    { text: 'Visor: Clean. Systems: Online.' },
    { text: 'UwU module loaded' },
    { text: 'Do protogens dream of electric sheep?' },

    // Дружеская реклама (Minecraft style)
    { text: 'Also try PSA!', link: 'https://t.me/psa_union' }
];

const defaultLink = 'https://t.me/Orion_Z43';

/** Пасхалка для дня без сезона; roll — случайное число от 0 до 1. */
export function pickTeaser(roll: number): { phrase: string; link: string } {
    const teaser = TEASERS[Math.floor(roll * TEASERS.length)];
    return {
        phrase: teaser.text,
        // Если у пасхалки есть своя ссылка - берем её, иначе - дефолтную на тебя
        link: teaser.link || defaultLink
    };
}
