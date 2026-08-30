<!-- src/lib/components/chat/Composer.svelte -->
<!--
	Общая панель ввода для личек: текст, изображение, стикеры, голосовое.
	Оформление — как в виджете: жёлтый акцент, радиус 8px, кнопки 34px.

	Компонент презентационный и НИЧЕГО не пишет в Firestore — он только отдаёт
	наружу намерение (onSend / onImage / onVoice / onSticker). Запись остаётся
	у потребителя, потому что у страницы и у виджета разные слои данных
	(dmStore против локального состояния DMInbox).

	Запись микрофона живёт здесь: это чисто UI-состояние, наружу уходит готовый
	Blob.
-->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import { fade } from 'svelte/transition';
	import StickerPicker from '$lib/components/chat/StickerPicker.svelte';
	import type { StickerPack } from '$lib/stores/stickerStore';

	export let packs: StickerPack[] = [];
	export let isSending: boolean = false;
	export let uploadProgress: number = 0;
	export let compact: boolean = false;
	export let placeholder: string = 'Написать...';

	export let onSend: (text: string) => void = () => {};
	export let onImage: (file: File) => void = () => {};
	export let onVoice: (blob: Blob) => void = () => {};
	export let onSticker: (packId: string, filename: string) => void = () => {};
	export let onTyping: () => void = () => {};

	let messageText = '';
	let showStickers = false;
	let isRecording = false;
	let recordSeconds = 0;

	let inputEl: HTMLTextAreaElement;
	let fileInputEl: HTMLInputElement;
	let mediaRecorder: MediaRecorder | null = null;
	let mediaStream: MediaStream | null = null;
	let audioChunks: Blob[] = [];
	let recordTimer: ReturnType<typeof setInterval> | null = null;

	const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

	$: fieldPlaceholder = isRecording ? `Запись... ${fmtRec(recordSeconds)}` : placeholder;

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			submit();
		}
	}

	function submit() {
		const text = messageText.trim();
		if (!text || isSending) return;
		messageText = '';
		resetHeight();
		onSend(text);
	}

	function handleInput() {
		autogrow();
		onTyping();
	}

	function autogrow() {
		if (!inputEl) return;
		inputEl.style.height = 'auto';
		inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + 'px';
	}

	function resetHeight() {
		if (inputEl) inputEl.style.height = 'auto';
	}

	function pickFile(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file || !file.type.startsWith('image/')) return;
		if (file.size > MAX_IMAGE_BYTES) {
			console.warn('[Composer] изображение слишком большое:', file.size);
			return;
		}
		onImage(file);
	}

	function handleSticker(packId: string, filename: string) {
		showStickers = false;
		onSticker(packId, filename);
	}

	async function toggleRecording() {
		if (isRecording) {
			stopRecording();
			return;
		}
		try {
			mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
			audioChunks = [];
			mediaRecorder = new MediaRecorder(mediaStream);
			mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
			mediaRecorder.onstop = () => {
				releaseStream();
				const blob = new Blob(audioChunks, { type: 'audio/webm' });
				if (blob.size > 0) onVoice(blob);
			};
			mediaRecorder.start();
			isRecording = true;
			recordSeconds = 0;
			recordTimer = setInterval(() => (recordSeconds += 1), 1000);
		} catch (err) {
			console.error('[Composer] микрофон недоступен:', err);
		}
	}

	function stopRecording() {
		isRecording = false;
		if (recordTimer) {
			clearInterval(recordTimer);
			recordTimer = null;
		}
		// onstop сам вызовет releaseStream и отдаст Blob
		if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
	}

	/** Дорожки надо гасить явно, иначе индикатор микрофона в браузере горит дальше. */
	function releaseStream() {
		mediaStream?.getTracks().forEach((t) => t.stop());
		mediaStream = null;
	}

	function fmtRec(s: number) {
		return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
	}

	onDestroy(() => {
		if (recordTimer) clearInterval(recordTimer);
		if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
		releaseStream();
	});
</script>

{#if showStickers}
	<div transition:fade={{ duration: 120 }}>
		<StickerPicker {packs} {compact} onPick={handleSticker} />
	</div>
{/if}

<div class="input-area">
	{#if uploadProgress > 0}
		<div class="upload-bar"><div class="upload-fill" style="width:{uploadProgress}%"></div></div>
	{/if}

	<div class="input-row">
		<button
			class="tool-btn"
			title="Изображение"
			aria-label="Отправить изображение"
			on:click={() => fileInputEl.click()}
			disabled={isSending || isRecording}
		>
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				width="18"
				height="18"
			>
				<rect x="3" y="3" width="18" height="18" rx="2" />
				<circle cx="8.5" cy="8.5" r="1.5" />
				<polyline points="21 15 16 10 5 21" />
			</svg>
		</button>
		<input
			bind:this={fileInputEl}
			type="file"
			accept="image/*"
			class="hidden-file"
			on:change={pickFile}
		/>

		<button
			class="tool-btn"
			class:active={showStickers}
			title="Стикеры"
			aria-label="Стикеры"
			on:click={() => (showStickers = !showStickers)}
			disabled={isRecording}
		>
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				width="18"
				height="18"
			>
				<circle cx="12" cy="12" r="10" />
				<path d="M8 13s1.5 2 4 2 4-2 4-2" />
				<line x1="9" y1="9" x2="9.01" y2="9" />
				<line x1="15" y1="9" x2="15.01" y2="9" />
			</svg>
		</button>

		<textarea
			bind:this={inputEl}
			bind:value={messageText}
			on:keydown={handleKeydown}
			on:input={handleInput}
			placeholder={fieldPlaceholder}
			disabled={isSending || isRecording}
			class="input-field"
			rows="1"
			maxlength="1000"
		></textarea>

		{#if isRecording}
			<div class="recording-indicator">
				<div class="rec-rings">
					<div class="rec-ring r1"></div>
					<div class="rec-ring r2"></div>
					<div class="rec-ring r3"></div>
				</div>
				<button
					class="stop-rec-btn"
					on:click={stopRecording}
					title="Остановить запись"
					aria-label="Остановить запись"
				>
					<div class="stop-square"></div>
				</button>
			</div>
		{:else if messageText.trim()}
			<button class="send-btn" on:click={submit} disabled={isSending} aria-label="Отправить">
				<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
					<path
						d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z"
					/>
				</svg>
			</button>
		{:else}
			<button
				class="tool-btn mic-btn"
				on:click={toggleRecording}
				disabled={isSending}
				title="Голосовое"
				aria-label="Записать голосовое"
			>
				<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
					<path
						d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"
					/>
				</svg>
			</button>
		{/if}
	</div>
</div>

<style>
	.input-area {
		flex-shrink: 0;
		border-top: 1px solid rgba(55, 65, 81, 0.5);
	}
	.upload-bar {
		height: 2px;
		background: rgba(255, 255, 255, 0.05);
	}
	.upload-fill {
		height: 100%;
		background: var(--cyber-yellow, #fcee0a);
		transition: width 0.2s;
	}

	.input-row {
		display: flex;
		align-items: flex-end;
		gap: 4px;
		padding: 6px 8px;
	}

	.tool-btn {
		flex-shrink: 0;
		width: 34px;
		height: 34px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #64748b;
		border-radius: 8px;
		transition:
			color 0.2s,
			background 0.2s;
	}
	.tool-btn:hover:not(:disabled) {
		color: #e2e8f0;
		background: rgba(255, 255, 255, 0.06);
	}
	.tool-btn.active {
		color: var(--cyber-yellow, #fcee0a);
		background: rgba(252, 238, 10, 0.08);
	}
	.tool-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.mic-btn:hover:not(:disabled) {
		color: var(--cyber-yellow, #fcee0a);
	}

	.input-field {
		flex: 1;
		min-width: 0;
		padding: 0.45rem 0.5rem;
		background: rgba(31, 41, 55, 0.7);
		color: #e2e8f0;
		border: 1px solid transparent;
		border-radius: 8px;
		font-size: 0.875rem;
		font-family: var(--font-body);
		line-height: 1.4;
		resize: none;
		outline: none;
		max-height: 100px;
		overflow-y: auto;
		transition: border-color 0.2s;
	}
	.input-field:focus {
		border-color: var(--cyber-yellow, #fcee0a);
	}
	.input-field::placeholder {
		color: #475569;
	}
	.input-field:disabled {
		opacity: 0.5;
	}

	.send-btn {
		flex-shrink: 0;
		width: 34px;
		height: 34px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--cyber-yellow, #fcee0a);
		color: #000;
		border-radius: 8px;
		transition: box-shadow 0.2s;
	}
	.send-btn:hover:not(:disabled) {
		box-shadow: 0 0 10px rgba(252, 238, 10, 0.4);
	}
	.send-btn:disabled {
		background: #374151;
		color: #6b7280;
	}

	.hidden-file {
		display: none;
	}

	/* ── Запись ──────────────────────────────────────────────────────────── */
	.recording-indicator {
		position: relative;
		width: 34px;
		height: 34px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.rec-rings {
		position: absolute;
		inset: 0;
	}
	.rec-ring {
		position: absolute;
		inset: 0;
		border-radius: 50%;
		border: 1.5px solid var(--cyber-red, #ff003c);
		animation: ring-expand 1.8s ease-out infinite;
	}
	.rec-ring.r2 {
		animation-delay: 0.6s;
	}
	.rec-ring.r3 {
		animation-delay: 1.2s;
	}
	@keyframes ring-expand {
		0% {
			transform: scale(0.4);
			opacity: 0.8;
		}
		100% {
			transform: scale(1.6);
			opacity: 0;
		}
	}
	.stop-rec-btn {
		position: relative;
		z-index: 1;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: var(--cyber-red, #ff003c);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.stop-square {
		width: 8px;
		height: 8px;
		background: #fff;
		border-radius: 1px;
	}

	@media (prefers-reduced-motion: reduce) {
		.rec-ring {
			animation: none !important;
		}
	}
</style>
