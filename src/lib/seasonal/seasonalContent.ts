type SeasonalEvent = {
    name: string; // Уникальный ID ивента
    isActive: (date: Date) => boolean;
    link: string;
    phrases: string[];
};

const events: SeasonalEvent[] = [
    {
        name: 'Glitch-o-Ween',
        isActive: (date) => {
            const month = date.getMonth(); // 0-11
            const day = date.getDate();
            // Октябрь (9) с 20-го числа
            if (month === 9 && day >= 20) return true;
            // Ноябрь (10) до 2-го числа
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
    {
        name: 'Neon Blizzard',
        isActive: (date) => {
            const month = date.getMonth();
            const day = date.getDate();

            // С 15 Ноября (10) — для раннего теста!
            // В будущем можно поменять на Декабрь (11)
            if (month === 11 && day >= 15) return true;

            // Весь Декабрь (11)
            if (month === 11) return true;

            // Январь (0) до 15-го (Старый Новый год)
            if (month === 0 && day <= 15) return true;

            return false;
        },
        // Ссылка может вести на пост с поздравлением или новогодний ивент
        link: 'https://www.youtube.com/watch?v=Rnil5LyK_B0',
        phrases: [
            '❄️ System status: FROZEN',
            'Merry Glitchmas! 🎄',
            'Stay frosty, user.',
            'Ho-ho-host unreachable.',
            'Powered by peppermint & code',
            '//: DETECTING SNOW...',
            'Cold logic, warm hearts 💙'
        ]
    }
];

const defaultContent = {
    phrase: 'by Orion_Z43',
    link: 'https://t.me/Orion_Z43'
};

// Получить контент (фразочки и ссылки)
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

// Новая функция: Получить имя активного ивента для переключения CSS
export function getActiveEventName(): string | null {
    // Проверка на браузер не обязательна, так как Date работает везде,
    // но для SSR консистентности можно использовать фиксированную дату или текущую.
    const today = new Date();
    const activeEvent = events.find(event => event.isActive(today));
    return activeEvent ? activeEvent.name : null;
}