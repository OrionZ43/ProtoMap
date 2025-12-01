type SeasonalEvent = {
    name: string;
    isActive: (date: Date) => boolean;
    link: string;
    phrases: string[];
};

const events: SeasonalEvent[] = [
    {
        name: 'Glitch-o-Ween',
        isActive: (date) => {
            const m = date.getMonth();
            const d = date.getDate();
            return (m === 9 && d >= 20) || (m === 10 && d <= 2);
        },
        link: 'https://vm.tiktok.com/ZMAqvpf1X/',
        phrases: [
            'by a spooky ghost 👻',
            'Happy Halloween!',
            'powered by ectoplasm',
            'treats, no tricks!',
            '// system anomaly...',
        ]
    },
    {
        name: 'Winter Chill',
        isActive: (date) => {
            const m = date.getMonth();
            const d = date.getDate();
            return (m === 11 && d >= 1 && d < 15);
        },
        link: 'https://t.me/proto_map',
        phrases: [
            '❄️ Frost protocols loaded',
            'Stay warm, user.',
            'Temperature dropping...',
            'Ice detected in sector 7',
            '//: SYSTEM COOLING ACTIVE',
            'Cold logic only.'
        ]
    },
    {
        name: 'Glitchmas',
        isActive: (date) => {
            const m = date.getMonth();
            const d = date.getDate();
            return (m === 11 && d >= 15) || (m === 0 && d <= 14);
        },
        link: 'https://t.me/proto_map',
        phrases: [
            '🎄 Merry Glitchmas!',
            'Ho-ho-host unreachable.',
            'Powered by peppermint',
            'Gift received: [ERROR]',
            '//: DEPLOYING FESTIVE MOOD',
            'Happy New Cycle!',
            'Snow.exe is running...'
        ]
    }
];

// === ПАСХАЛКИ И ПРИКОЛЫ (Когда нет ивентов) ===

type Teaser = {
    text: string;
    link?: string; // Опциональная ссылка
};

const TEASERS: Teaser[] = [
    // Стандартное (повторяем несколько раз, чтобы выпадало чаще)
    { text: 'by Orion_Z43' },
    { text: 'by Orion_Z43' },
    { text: 'by Orion_Z43' },

    // Тизеры
    { text: 'Something is coming...' },
    { text: '31.12' },

    // Прото-мемы
    { text: 'I ate all your RAM 💾' },
    { text: 'Beep Boop! 🤖' },
    { text: 'Powered by Toasters' },
    { text: 'Visor: Clean. Systems: Online.' },
    { text: 'UwU module loaded' },
    { text: 'Do protogens dream of electric sheep?' },

    // Дружеская реклама (Minecraft style)
    { text: 'Also try PSA!', link: 'https://t.me/psa_union' }
];

const defaultLink = 'https://t.me/Orion_Z43';

export function getSeasonalContent(): { phrase: string; link: string } {
    const today = new Date();
    const activeEvent = events.find(event => event.isActive(today));

    // Если есть активный праздник
    if (activeEvent) {
        const randomPhrase = activeEvent.phrases[Math.floor(Math.random() * activeEvent.phrases.length)];
        return {
            phrase: randomPhrase,
            link: activeEvent.link
        };
    }

    // Если праздников нет (Рандомные пасхалки)
    const randomTeaser = TEASERS[Math.floor(Math.random() * TEASERS.length)];
    return {
        phrase: randomTeaser.text,
        // Если у пасхалки есть своя ссылка - берем её, иначе - дефолтную на тебя
        link: randomTeaser.link || defaultLink
    };
}

export function getActiveEventName(): string | null {
    const today = new Date();
    const activeEvent = events.find(event => event.isActive(today));
    return activeEvent ? activeEvent.name : null;
}