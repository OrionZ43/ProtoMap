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
        link: 'https://www.youtube.com/watch?v=Rnil5LyK_B0',
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

const defaultContent = {
    phrase: 'by Orion_Z43',
    link: 'https://t.me/Orion_Z43'
};

export function getSeasonalContent(): { phrase: string; link: string } {
    const today = new Date();
    const activeEvent = events.find(event => event.isActive(today));

    if (activeEvent) {
        const randomPhrase = activeEvent.phrases[Math.floor(Math.random() * activeEvent.phrases.length)];
        return {
            phrase: randomPhrase,
            link: activeEvent.link
        };
    }

    return defaultContent;
}