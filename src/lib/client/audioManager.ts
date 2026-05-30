import { Howl, Howler } from 'howler'; // <--- Добавили Howler
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
	| 'popup_close'
	| 'entercasino'
	| 'vd_shot_live'
	| 'vd_shot_blank'
	| 'vd_reload'
	| 'vd_item_scanner'
	| 'vd_item_generic'
	| 'vd_item_emp'
	| 'vd_win'
	| 'vd_lose';

const soundFiles: Record<SoundName, string> = {
	click: '/sounds/click.mp3',
	success: '/sounds/sucsess.mp3',
	fail: '/sounds/fail.mp3',
	message: '/sounds/message.mp3',
	click_alt: '/sounds/click_for_other_buttons.mp3',
	popup_open: '/sounds/popup_open.mp3',
	popup_close: '/sounds/popup_closed.mp3',
	entercasino: '/sounds/entercasino.mp3',
	vd_shot_live: '/sounds/vd_shot_live.mp3',
	vd_shot_blank: '/sounds/vd_shot_blank.mp3',
	vd_reload: '/sounds/vd_reload.mp3',
	vd_item_scanner: '/sounds/vd_item_scanner.mp3',
	vd_item_generic: '/sounds/vd_item_generic.mp3',
	vd_item_emp: '/sounds/vd_item_emp.mp3',
	vd_win: '/sounds/vd_win.mp3',
	vd_lose: '/sounds/vd_lose.mp3'
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

	document.addEventListener('visibilitychange', handleVisibilityChange);

	settingsStore.subscribe((state) => {
		if (!document.hidden) {
			Howler.mute(!state.audioEnabled);
		}
	});

	const { audioEnabled } = get(settingsStore);
	Howler.mute(!audioEnabled);

	isInitialized = true;
	console.log('[AudioManager] Звуки загружены. Слушатели установлены.');
}

function handleVisibilityChange() {
	if (document.hidden) {
		Howler.mute(true);
	} else {
		const { audioEnabled } = get(settingsStore);
		Howler.mute(!audioEnabled);
	}
}

function play(soundName: SoundName) {
	if (!browser) return;

	const { audioEnabled } = get(settingsStore);
	if (!audioEnabled) return;

	const sound = sounds[soundName];
	if (sound) {
		sound.play();
	} else {
		console.warn(`[AudioManager] Звук с именем "${soundName}" не найден.`);
	}
}

export const AudioManager = {
	initialize,
	play
};
