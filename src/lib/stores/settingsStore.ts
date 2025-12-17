import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const AUDIO_ENABLED_KEY = 'protomap_audio_enabled';
const CINEMATIC_LOADS_KEY = 'protomap_cinematic_loads_enabled';
const SEASONAL_ENABLED_KEY = 'protomap_seasonal_enabled';

type SettingsState = {
    audioEnabled: boolean;
    cinematicLoadsEnabled: boolean;
    seasonalEnabled: boolean;
};

function createSettingsStore() {
    let initialAudioState = true;
    let initialCinematicState = true;
    let initialSeasonalState = true;

    if (browser) {
        const savedAudio = localStorage.getItem(AUDIO_ENABLED_KEY);
        if (savedAudio !== null) initialAudioState = (savedAudio === 'true');

        const savedCinematic = localStorage.getItem(CINEMATIC_LOADS_KEY);
        if (savedCinematic !== null) initialCinematicState = (savedCinematic === 'true');

        const savedSeasonal = localStorage.getItem(SEASONAL_ENABLED_KEY);
        if (savedSeasonal !== null) initialSeasonalState = (savedSeasonal === 'true');
    }

    const { subscribe, set, update } = writable<SettingsState>({
        audioEnabled: initialAudioState,
        cinematicLoadsEnabled: initialCinematicState,
        seasonalEnabled: initialSeasonalState
    });

    subscribe(currentState => {
        if (browser) {
            localStorage.setItem(AUDIO_ENABLED_KEY, String(currentState.audioEnabled));
            localStorage.setItem(CINEMATIC_LOADS_KEY, String(currentState.cinematicLoadsEnabled));
            localStorage.setItem(SEASONAL_ENABLED_KEY, String(currentState.seasonalEnabled));
        }
    });

    return {
        subscribe,
        set,
        update,
        toggleAudio: () => update(state => ({ ...state, audioEnabled: !state.audioEnabled })),
        toggleCinematicLoads: () => update(state => ({ ...state, cinematicLoadsEnabled: !state.cinematicLoadsEnabled })),
        toggleSeasonal: () => update(state => ({ ...state, seasonalEnabled: !state.seasonalEnabled })),
    };
}

export const settingsStore = createSettingsStore();