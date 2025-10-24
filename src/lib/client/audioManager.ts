import { Howl } from 'howler';
import { settingsStore } from '$lib/stores/settingsStore';
import { get } from 'svelte/store';
import { browser } from '$app/environment';


export type SoundName =
    | 'click'
    | 'success'
    | 'fail'
    | 'message'
    | 'click_alt'
    | 'popup_open'
    | 'popup_close';

const soundFiles: Record<SoundName, string> = {
    click: '/sounds/click.mp3',
    success: '/sounds/sucsess.mp3',
    fail: '/sounds/fail.mp3',
    message: '/sounds/message.mp3',
    click_alt: '/sounds/click_for_other_buttons.mp3',
    popup_open: '/sounds/popup_open.mp3',
    popup_close: '/sounds/popup_closed.mp3',
};

let sounds: Partial<Record<SoundName, Howl>> = {};
let isInitialized = false;

function initialize() {
    if (!browser || isInitialized) {
        return;
    }

    console.log('[AudioManager] Инициализация и предзагрузка звуков...');

    for (const key in soundFiles) {
        const soundName = key as SoundName;
        sounds[soundName] = new Howl({
            src: [soundFiles[soundName]],
            preload: true,
            volume: 0.7
        });
    }

    isInitialized = true;
    console.log('[AudioManager] Звуки загружены.');
}

function play(soundName: SoundName) {
    if (!browser) {
        return;
    }

    const { audioEnabled } = get(settingsStore);

    if (!audioEnabled) {
        return;
    }

    const sound = sounds[soundName];

    if (sound) {
        sound.play();
    } else {
        console.warn(`[AudioManager] Звук с именем "${soundName}" не найден.`);
    }
}

export const AudioManager = {
    initialize,
    play,
};