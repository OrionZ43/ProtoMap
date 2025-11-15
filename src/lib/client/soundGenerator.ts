import { browser } from '$app/environment';

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
    if (!browser) return null;
    if (audioCtx) return audioCtx;
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    return audioCtx;
}

export function generateSpinSound(duration: number = 2.0) {
    const ctx = getAudioContext();
    if (!ctx) return;

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    oscillator.type = 'whitenoise';
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1000, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(8000, ctx.currentTime + duration * 0.4);
    filter.frequency.exponentialRampToValueAtTime(500, ctx.currentTime + duration);

    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    oscillator.connect(filter).connect(gainNode).connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + duration);
}

export function generateWinSound(payout: number) {
    const ctx = getAudioContext();
    if (!ctx) return;

    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50]; // C Major scale
    let noteCount = 3;
    if (payout > 100) noteCount = 4;
    if (payout > 500) noteCount = 7;

    for (let i = 0; i < noteCount; i++) {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = notes[i];
        gainNode.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.2);
        oscillator.connect(gainNode).connect(ctx.destination);
        oscillator.start(ctx.currentTime + i * 0.1);
        oscillator.stop(ctx.currentTime + i * 0.1 + 0.2);
    }
}

export function generateLoseSound() {
    const ctx = getAudioContext();
    if (!ctx) return;

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(150, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.3);
    gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    oscillator.connect(gainNode).connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.3);
}