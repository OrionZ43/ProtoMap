<script lang="ts">
	import { createEventDispatcher, onMount, onDestroy } from 'svelte';
	import { fade } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import NeonButton from '$lib/components/NeonButton.svelte';
	import { t } from 'svelte-i18n';

	export let imageFile: File | null = null;
	export let isOpen = false;

	const dispatch = createEventDispatcher();

	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D | null = null;
	let previewCanvas: HTMLCanvasElement;
	let previewCtx: CanvasRenderingContext2D | null = null;

	let image: HTMLImageElement | null = null;
	let imageUrl = '';

	// Transform state
	let zoom = 1;
	let rotation = 0;
	let offsetX = 0;
	let offsetY = 0;
	let flipX = false;
	let flipY = false;

	// Filters
	let brightness = 100;
	let contrast = 100;
	let saturation = 100;

	// Drag state (mouse)
	let isDragging = false;
	let dragStartX = 0;
	let dragStartY = 0;

	// Touch state
	let isTouching = false;
	let lastTouchX = 0;
	let lastTouchY = 0;
	let lastTouchDistance = 0;

	// Constants
	const CANVAS_SIZE = 400;
	const PREVIEW_SIZE = 128;
	const MIN_ZOOM = 0.5;
	const MAX_ZOOM = 3;

	$: if (isOpen && imageFile) {
		loadImage();
	}

	$: if (!isOpen) {
		cleanup();
	}

	function cleanup() {
		if (imageUrl) {
			URL.revokeObjectURL(imageUrl);
			imageUrl = '';
		}
		image = null;
		ctx = null;
		previewCtx = null;
	}

	async function loadImage() {
		if (!imageFile) return;

		cleanup();
		await new Promise(resolve => setTimeout(resolve, 100));

		if (canvas && !ctx) {
			ctx = canvas.getContext('2d', { willReadFrequently: true });
		}
		if (previewCanvas && !previewCtx) {
			previewCtx = previewCanvas.getContext('2d', { willReadFrequently: true });
		}

		imageUrl = URL.createObjectURL(imageFile);
		image = new Image();
		image.crossOrigin = 'anonymous';
		image.onload = () => {
			resetTransform();
			setTimeout(() => {
				if (ctx && image && image.complete) {
					render();
				}
			}, 50);
		};
		image.onerror = (e) => {
			console.error('Image load error:', e);
		};
		image.src = imageUrl;
	}

	function resetTransform() {
		if (!image) return;

		const imgWidth = image.width;
		const imgHeight = image.height;
		const scaleToFit = Math.max(CANVAS_SIZE / imgWidth, CANVAS_SIZE / imgHeight);

		zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scaleToFit));
		rotation = 0;
		offsetX = 0;
		offsetY = 0;
		flipX = false;
		flipY = false;
		brightness = 100;
		contrast = 100;
		saturation = 100;
	}

	function render() {
		if (!ctx || !image || !image.complete) return;

		ctx.fillStyle = '#0a0a0f';
		ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

		ctx.save();

		ctx.translate(CANVAS_SIZE / 2, CANVAS_SIZE / 2);
		ctx.rotate((rotation * Math.PI) / 180);
		ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
		ctx.translate(offsetX, offsetY);
		ctx.scale(zoom, zoom);

		const imgWidth = image.width;
		const imgHeight = image.height;
		const scale = Math.min(CANVAS_SIZE / imgWidth, CANVAS_SIZE / imgHeight);
		const scaledWidth = imgWidth * scale;
		const scaledHeight = imgHeight * scale;

		ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
		ctx.drawImage(image, -scaledWidth / 2, -scaledHeight / 2, scaledWidth, scaledHeight);
		ctx.filter = 'none';

		ctx.restore();

		ctx.save();
		ctx.globalCompositeOperation = 'destination-in';
		ctx.beginPath();
		ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();

		ctx.strokeStyle = 'var(--cyber-yellow, #fcee0a)';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2 - 1, 0, Math.PI * 2);
		ctx.stroke();

		updatePreview();
	}

	function updatePreview() {
		if (!previewCtx || !canvas) return;
		previewCtx.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
		previewCtx.drawImage(canvas, 0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
	}

	// === MOUSE EVENTS ===
	function handleMouseDown(e: MouseEvent) {
		isDragging = true;
		dragStartX = e.clientX - offsetX;
		dragStartY = e.clientY - offsetY;
	}

	function handleMouseMove(e: MouseEvent) {
		if (!isDragging) return;
		offsetX = e.clientX - dragStartX;
		offsetY = e.clientY - dragStartY;
		render();
	}

	function handleMouseUp() {
		isDragging = false;
	}

	function handleWheel(e: WheelEvent) {
		e.preventDefault();
		const delta = e.deltaY > 0 ? -0.1 : 0.1;
		zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom + delta));
		render();
	}

	// === TOUCH EVENTS ===
	function getTouchDistance(touches: TouchList): number {
		if (touches.length < 2) return 0;
		const dx = touches[0].clientX - touches[1].clientX;
		const dy = touches[0].clientY - touches[1].clientY;
		return Math.sqrt(dx * dx + dy * dy);
	}

	function handleTouchStart(e: TouchEvent) {
		e.preventDefault(); // 🔥 Останавливаем прокрутку страницы

		if (e.touches.length === 1) {
			// Single touch - drag
			isTouching = true;
			lastTouchX = e.touches[0].clientX;
			lastTouchY = e.touches[0].clientY;
		} else if (e.touches.length === 2) {
			// Two fingers - pinch zoom
			lastTouchDistance = getTouchDistance(e.touches);
		}
	}

	function handleTouchMove(e: TouchEvent) {
		e.preventDefault(); // 🔥 Останавливаем прокрутку страницы

		if (e.touches.length === 1 && isTouching) {
			// Single touch - drag
			const touch = e.touches[0];
			const deltaX = touch.clientX - lastTouchX;
			const deltaY = touch.clientY - lastTouchY;

			offsetX += deltaX;
			offsetY += deltaY;

			lastTouchX = touch.clientX;
			lastTouchY = touch.clientY;

			render();
		} else if (e.touches.length === 2) {
			// Two fingers - pinch zoom
			const currentDistance = getTouchDistance(e.touches);

			if (lastTouchDistance > 0) {
				const delta = (currentDistance - lastTouchDistance) * 0.01;
				zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom + delta));
				render();
			}

			lastTouchDistance = currentDistance;
		}
	}

	function handleTouchEnd(e: TouchEvent) {
		e.preventDefault(); // 🔥 Останавливаем прокрутку страницы

		if (e.touches.length === 0) {
			isTouching = false;
			lastTouchDistance = 0;
		} else if (e.touches.length === 1) {
			// Остался 1 палец - сбрасываем zoom, продолжаем drag
			lastTouchDistance = 0;
			lastTouchX = e.touches[0].clientX;
			lastTouchY = e.touches[0].clientY;
		}
	}

	function rotateLeft() {
		rotation = (rotation - 90) % 360;
		render();
	}

	function rotateRight() {
		rotation = (rotation + 90) % 360;
		render();
	}

	function toggleFlipX() {
		flipX = !flipX;
		render();
	}

	function toggleFlipY() {
		flipY = !flipY;
		render();
	}

	function zoomIn() {
		zoom = Math.min(MAX_ZOOM, zoom + 0.2);
		render();
	}

	function zoomOut() {
		zoom = Math.max(MIN_ZOOM, zoom - 0.2);
		render();
	}

	function reset() {
		resetTransform();
		render();
	}

	async function handleSave() {
		if (!canvas) return;

		const outputCanvas = document.createElement('canvas');
		outputCanvas.width = PREVIEW_SIZE;
		outputCanvas.height = PREVIEW_SIZE;
		const outputCtx = outputCanvas.getContext('2d');

		if (!outputCtx) return;

		outputCtx.drawImage(canvas, 0, 0, PREVIEW_SIZE, PREVIEW_SIZE);

		outputCanvas.toBlob((blob) => {
			if (blob) {
				const reader = new FileReader();
				reader.onloadend = () => {
					dispatch('save', { imageBase64: reader.result });
					close();
				};
				reader.readAsDataURL(blob);
			}
		}, 'image/webp', 0.95);
	}

	function close() {
		cleanup();
		dispatch('close');
	}

	onDestroy(() => {
		cleanup();
	});
</script>

<svelte:window on:mousemove={handleMouseMove} on:mouseup={handleMouseUp} />

{#if isOpen}
	<div class="modal-overlay" transition:fade={{ duration: 200 }} on:click={close}>
		<div
			class="editor-container cyber-panel"
			on:click|stopPropagation
		>
			<!-- Header -->
			<div class="header">
				<h2 class="title font-display">{$t('edit_profile.avatar_editor.title')}</h2>
				<button class="close-btn" on:click={close} aria-label={$t('edit_profile.avatar_editor.cancel')}>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
						<path d="M18 6L6 18M6 6l12 12" stroke-width="2" stroke-linecap="round"/>
					</svg>
				</button>
			</div>

			<!-- Content -->
			<div class="content">
				<!-- Left: Canvas -->
				<div class="canvas-section">
					<canvas
						bind:this={canvas}
						width={CANVAS_SIZE}
						height={CANVAS_SIZE}
						class="main-canvas"
						on:mousedown={handleMouseDown}
						on:wheel={handleWheel}
						on:touchstart={handleTouchStart}
						on:touchmove={handleTouchMove}
						on:touchend={handleTouchEnd}
					/>
					<p class="canvas-hint">{$t('edit_profile.avatar_editor.hint')}</p>
				</div>

				<!-- Right: Controls -->
				<div class="controls-section">
					<!-- Preview -->
					<div class="control-block">
						<label class="block-label font-display">{$t('edit_profile.avatar_editor.preview')}</label>
						<div class="preview-wrapper">
							<canvas
								bind:this={previewCanvas}
								width={PREVIEW_SIZE}
								height={PREVIEW_SIZE}
								class="preview-canvas"
							/>
						</div>
					</div>

					<!-- Transform -->
					<div class="control-block">
						<label class="block-label font-display">{$t('edit_profile.avatar_editor.zoom')}</label>
						<div class="control-row">
							<span class="control-value">{zoom.toFixed(1)}x</span>
							<div class="button-group">
								<button class="icon-btn" on:click={zoomOut} disabled={zoom <= MIN_ZOOM} title={$t('edit_profile.avatar_editor.zoom_out')}>
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
										<circle cx="11" cy="11" r="8" stroke-width="2"/>
										<path d="M8 11h6M21 21l-4.35-4.35" stroke-width="2" stroke-linecap="round"/>
									</svg>
								</button>
								<button class="icon-btn" on:click={zoomIn} disabled={zoom >= MAX_ZOOM} title={$t('edit_profile.avatar_editor.zoom_in')}>
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
										<circle cx="11" cy="11" r="8" stroke-width="2"/>
										<path d="M11 8v6M8 11h6M21 21l-4.35-4.35" stroke-width="2" stroke-linecap="round"/>
									</svg>
								</button>
							</div>
						</div>
					</div>

					<div class="control-block">
						<label class="block-label font-display">{$t('edit_profile.avatar_editor.rotate')}</label>
						<div class="control-row">
							<span class="control-value">{rotation}°</span>
							<div class="button-group">
								<button class="icon-btn" on:click={rotateLeft} title={$t('edit_profile.avatar_editor.rotate_left')}>
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
										<path d="M2.5 2v6h6M2.66 15.57a10 10 0 1 0 .57-8.38" stroke-width="2" stroke-linecap="round"/>
									</svg>
								</button>
								<button class="icon-btn" on:click={rotateRight} title={$t('edit_profile.avatar_editor.rotate_right')}>
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
										<path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38" stroke-width="2" stroke-linecap="round"/>
									</svg>
								</button>
							</div>
						</div>
					</div>

					<div class="control-block">
						<label class="block-label font-display">{$t('edit_profile.avatar_editor.flip')}</label>
						<div class="button-group full">
							<button class="toggle-btn" class:active={flipX} on:click={toggleFlipX}>
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
									<path d="M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3m8-18h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3M12 3v18" stroke-width="2"/>
								</svg>
								{$t('edit_profile.avatar_editor.flip_horizontal')}
							</button>
							<button class="toggle-btn" class:active={flipY} on:click={toggleFlipY}>
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
									<path d="M3 8V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3M3 12h18" stroke-width="2"/>
								</svg>
								{$t('edit_profile.avatar_editor.flip_vertical')}
							</button>
						</div>
					</div>

					<!-- Adjustments -->
					<div class="control-block">
						<label class="block-label font-display">{$t('edit_profile.avatar_editor.adjustments')}</label>

						<div class="slider-control">
							<div class="slider-header">
								<span>{$t('edit_profile.avatar_editor.brightness')}</span>
								<span class="slider-value">{brightness}%</span>
							</div>
							<input
								type="range"
								bind:value={brightness}
								min="0"
								max="200"
								class="slider"
								on:input={() => render()}
							/>
						</div>

						<div class="slider-control">
							<div class="slider-header">
								<span>{$t('edit_profile.avatar_editor.contrast')}</span>
								<span class="slider-value">{contrast}%</span>
							</div>
							<input
								type="range"
								bind:value={contrast}
								min="0"
								max="200"
								class="slider"
								on:input={() => render()}
							/>
						</div>

						<div class="slider-control">
							<div class="slider-header">
								<span>{$t('edit_profile.avatar_editor.saturation')}</span>
								<span class="slider-value">{saturation}%</span>
							</div>
							<input
								type="range"
								bind:value={saturation}
								min="0"
								max="200"
								class="slider"
								on:input={() => render()}
							/>
						</div>
					</div>

					<!-- Reset -->
					<button class="reset-btn" on:click={reset}>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
							<path d="M1 4v6h6M23 20v-6h-6" stroke-width="2" stroke-linecap="round"/>
							<path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" stroke-width="2" stroke-linecap="round"/>
						</svg>
						{$t('edit_profile.avatar_editor.reset')}
					</button>
				</div>
			</div>

			<!-- Footer -->
			<div class="footer">
				<button class="cancel-btn" on:click={close}>
					{$t('edit_profile.avatar_editor.cancel')}
				</button>
				<NeonButton type="button" on:click={handleSave}>
					{$t('edit_profile.avatar_editor.save')}
				</NeonButton>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.85);
		backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 9999;
		padding: 1rem;
		overflow-y: auto; /* 🔥 Разрешаем скролл самой модалки */
	}

	.editor-container {
		background: rgba(10, 10, 10, 0.5);
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
		border: 1px solid rgba(252, 238, 10, 0.2);
		clip-path: polygon(0 15px, 15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%);
		max-width: 900px;
		width: 100%;
		max-height: 90vh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.header {
		border-bottom: 1px solid rgba(252, 238, 10, 0.2);
		padding: 1.5rem 2rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.title {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--cyber-yellow, #fcee0a);
		letter-spacing: 2px;
		text-transform: uppercase;
	}

	.close-btn {
		background: none;
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: rgba(255, 255, 255, 0.7);
		cursor: pointer;
		padding: 0.5rem;
		transition: all 0.3s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
	}

	.close-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.4);
		color: #fff;
	}

	.content {
		padding: 2rem;
		display: grid;
		grid-template-columns: 1fr 320px;
		gap: 2rem;
		overflow-y: auto;
		flex: 1;
	}

	.canvas-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.main-canvas {
		border: 2px solid var(--cyber-yellow, #fcee0a);
		border-radius: 50%;
		cursor: move;
		background: #000;
		box-shadow: 0 0 20px rgba(252, 238, 10, 0.2);
		max-width: 100%;
		height: auto;
		touch-action: none; /* 🔥 Отключаем дефолтные тач-жесты браузера */
		user-select: none; /* 🔥 Отключаем выделение */
		-webkit-user-select: none;
		-webkit-touch-callout: none; /* 🔥 Отключаем контекстное меню на iOS */
	}

	.canvas-hint {
		font-size: 0.875rem;
		color: rgba(255, 255, 255, 0.5);
		text-align: center;
		margin: 0;
	}

	.controls-section {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		overflow-y: auto;
		max-height: 600px;
		padding-right: 0.5rem;
	}

	.controls-section::-webkit-scrollbar {
		width: 6px;
	}

	.controls-section::-webkit-scrollbar-track {
		background: rgba(255, 255, 255, 0.05);
	}

	.controls-section::-webkit-scrollbar-thumb {
		background: var(--cyber-yellow, #fcee0a);
		border-radius: 3px;
	}

	.control-block {
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.1);
		padding: 1rem;
		border-radius: 4px;
	}

	.block-label {
		display: block;
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--cyber-yellow, #fcee0a);
		letter-spacing: 1px;
		margin-bottom: 0.75rem;
		text-transform: uppercase;
	}

	.preview-wrapper {
		display: flex;
		justify-content: center;
	}

	.preview-canvas {
		border: 2px solid var(--cyber-yellow, #fcee0a);
		border-radius: 50%;
		box-shadow: 0 0 15px rgba(252, 238, 10, 0.2);
		background: #000;
	}

	.control-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.control-value {
		font-family: 'Courier New', monospace;
		font-size: 0.875rem;
		color: rgba(255, 255, 255, 0.7);
		min-width: 50px;
	}

	.button-group {
		display: flex;
		gap: 0.5rem;
	}

	.button-group.full {
		width: 100%;
		flex-direction: column;
	}

	.icon-btn {
		background: rgba(252, 238, 10, 0.1);
		border: 1px solid rgba(252, 238, 10, 0.3);
		color: var(--cyber-yellow, #fcee0a);
		padding: 0.5rem;
		cursor: pointer;
		transition: all 0.3s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
	}

	.icon-btn:hover:not(:disabled) {
		background: rgba(252, 238, 10, 0.2);
		border-color: var(--cyber-yellow, #fcee0a);
		transform: translateY(-1px);
	}

	.icon-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.toggle-btn {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: rgba(255, 255, 255, 0.7);
		padding: 0.5rem 0.75rem;
		cursor: pointer;
		transition: all 0.3s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		border-radius: 4px;
		font-size: 0.875rem;
	}

	.toggle-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.4);
		color: #fff;
	}

	.toggle-btn.active {
		background: rgba(252, 238, 10, 0.2);
		border-color: var(--cyber-yellow, #fcee0a);
		color: var(--cyber-yellow, #fcee0a);
	}

	.slider-control {
		margin-top: 0.75rem;
	}

	.slider-control:first-child {
		margin-top: 0;
	}

	.slider-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
		font-size: 0.875rem;
		color: rgba(255, 255, 255, 0.7);
	}

	.slider-value {
		font-family: 'Courier New', monospace;
		color: var(--cyber-yellow, #fcee0a);
	}

	.slider {
		width: 100%;
		height: 4px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 2px;
		outline: none;
		-webkit-appearance: none;
	}

	.slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 14px;
		height: 14px;
		background: var(--cyber-yellow, #fcee0a);
		border: 2px solid #000;
		border-radius: 50%;
		cursor: pointer;
		box-shadow: 0 0 8px rgba(252, 238, 10, 0.5);
	}

	.slider::-moz-range-thumb {
		width: 14px;
		height: 14px;
		background: var(--cyber-yellow, #fcee0a);
		border: 2px solid #000;
		border-radius: 50%;
		cursor: pointer;
		box-shadow: 0 0 8px rgba(252, 238, 10, 0.5);
	}

	.reset-btn {
		background: rgba(255, 0, 60, 0.1);
		border: 1px solid rgba(255, 0, 60, 0.3);
		color: var(--cyber-red, #ff003c);
		padding: 0.75rem;
		cursor: pointer;
		transition: all 0.3s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		border-radius: 4px;
		font-size: 0.875rem;
		font-weight: 600;
	}

	.reset-btn:hover {
		background: rgba(255, 0, 60, 0.2);
		border-color: var(--cyber-red, #ff003c);
		box-shadow: 0 0 10px rgba(255, 0, 60, 0.3);
	}

	.footer {
		border-top: 1px solid rgba(252, 238, 10, 0.2);
		padding: 1.5rem 2rem;
		display: flex;
		gap: 1rem;
		justify-content: flex-end;
	}

	.cancel-btn {
		padding: 0.75rem 1.5rem;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.3s ease;
		font-size: 0.875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		background: none;
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: rgba(255, 255, 255, 0.7);
	}

	.cancel-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.4);
		color: #fff;
	}

	@media (max-width: 768px) {
		.content {
			grid-template-columns: 1fr;
		}

		.main-canvas {
			width: 100%;
			max-width: 400px;
		}

		.controls-section {
			max-height: none;
		}

		.canvas-hint {
			font-size: 0.75rem;
		}
	}
</style>