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
            const month = date.getMonth();
            const day = date.getDate();
            if (month === 9 && day >= 20) return true;
            if (month === 10 && day <= 2) return true;
            return false;
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