import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const AUDIO_ENABLED_KEY = 'protomap_audio_enabled';
const CINEMATIC_LOADS_KEY = 'protomap_cinematic_loads_enabled';

type SettingsState = {
    audioEnabled: boolean;
    cinematicLoadsEnabled: boolean;
};

function createSettingsStore() {
    let initialAudioState = true;
    let initialCinematicState = true;

    if (browser) {
        const savedAudio = localStorage.getItem(AUDIO_ENABLED_KEY);
        if (savedAudio !== null) initialAudioState = (savedAudio === 'true');

        const savedCinematic = localStorage.getItem(CINEMATIC_LOADS_KEY);
        if (savedCinematic !== null) initialCinematicState = (savedCinematic === 'true');
    }

    const { subscribe, set, update } = writable<SettingsState>({
        audioEnabled: initialAudioState,
        cinematicLoadsEnabled: initialCinematicState
    });

    subscribe(currentState => {
        if (browser) {
            localStorage.setItem(AUDIO_ENABLED_KEY, String(currentState.audioEnabled));
            localStorage.setItem(CINEMATIC_LOADS_KEY, String(currentState.cinematicLoadsEnabled));
        }
    });

    return {
        subscribe,
        set,
        update,
        toggleAudio: () => update(state => {
            console.log(`[Audio] Состояние изменено на: ${!state.audioEnabled}`);
            return { ...state, audioEnabled: !state.audioEnabled };
        }),
        toggleCinematicLoads: () => update(state => {
            console.log(`[Cinematic] Состояние изменено на: ${!state.cinematicLoadsEnabled}`);
            return { ...state, cinematicLoadsEnabled: !state.cinematicLoadsEnabled };
        }),
    };
}

export const settingsStore = createSettingsStore();