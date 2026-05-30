<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, slide } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import { tweened } from 'svelte/motion';
	import { getFunctions, httpsCallable } from 'firebase/functions';
	import { auth } from '$lib/firebase';
	import { sendEmailVerification } from 'firebase/auth';
	import { modal } from '$lib/stores/modalStore';
	import { t } from 'svelte-i18n';
	import { get } from 'svelte/store'; // Нужно для перевода в JS

	export let data;

	const opacity = tweened(0, { duration: 400, easing: quintOut });
	onMount(() => opacity.set(1));

	// Хелпер для перевода в JS (для модалок)
	const translate = (key: string, vars: Record<string, any> = {}) => get(t)(key, vars);

	// --- ЛОГИКА TELEGRAM ---
	let tgLinkCode = '';
	let isGeneratingCode = false;

	async function generateTgCode() {
		isGeneratingCode = true;
		try {
			const functions = getFunctions();
			const getCodeFunc = httpsCallable(functions, 'getTelegramAuthCode');
			const res = await getCodeFunc();
			tgLinkCode = (res.data as any).code;
		} catch (e: any) {
			modal.error(translate('ui.error'), e.message);
		} finally {
			isGeneratingCode = false;
		}
	}

	let isToggling2FA = false;
	async function toggle2FA(event: Event) {
		const checkbox = event.target as HTMLInputElement;
		// Возвращаем UI в исходное состояние до получения ответа от сервера
		checkbox.checked = data.is2FAEnabled;
		isToggling2FA = true;
		try {
			const functions = getFunctions();
			const toggleFunc = httpsCallable(functions, 'toggle2FA');
			const res = await toggleFunc();
			data.is2FAEnabled = (res.data as any).is2FAEnabled;
			checkbox.checked = data.is2FAEnabled;
			modal.success(translate('ui.success'), data.is2FAEnabled ? '2FA включена' : '2FA отключена');
		} catch (e: any) {
			modal.error(translate('ui.error'), e.message);
		} finally {
			isToggling2FA = false;
		}
	}

	// --- ЛОГИКА EMAIL ---
	let verificationSent = false;
	async function sendVerification() {
		if (!auth.currentUser) return;
		try {
			await sendEmailVerification(auth.currentUser);
			verificationSent = true;
			modal.success(
				translate('ui.success'),
				`${translate('auth.check_email', { email: auth.currentUser.email })}`
			);
		} catch (e: any) {
			modal.error(translate('ui.error'), e.message);
		}
	}

	// --- УДАЛЕНИЕ АККАУНТА ---
	async function handleDeleteAccount() {
		modal.confirm(
			translate('security.modal_del_title'),
			translate('security.modal_del_text'),
			async () => {
				try {
					modal.info(translate('ui.loading'), translate('security.modal_wiping'));
					const functions = getFunctions();
					const deleteAccountFunc = httpsCallable(functions, 'deleteAccount');
					await deleteAccountFunc();
					window.location.href = '/';
				} catch (error: any) {
					modal.error(translate('ui.error'), error.message);
				}
			}
		);
	}
</script>

<svelte:head>
	<title>{$t('security.tab_title')} | ProtoMap</title>
</svelte:head>

<div class="security-container cyber-panel" style="opacity: {$opacity}">
	<h1 class="page-title font-display">{$t('security.page_title')}</h1>

	<div class="sections-grid">
		<!-- 1. ИДЕНТИФИКАЦИЯ (EMAIL) -->
		<section class="sec-card">
			<h3 class="sec-title text-cyber-cyan">{$t('security.email_title')}</h3>

			<div class="info-row">
				<span class="label">EMAIL:</span>
				<span class="value font-mono">{data.email}</span>
			</div>

			<div class="status-row">
				{#if data.emailVerified}
					<div class="status-badge success">
						<i class="fas fa-check-circle"></i>
						{$t('security.verified')}
					</div>
					<p class="desc">{$t('security.verified_desc')}</p>
				{:else}
					<div class="status-badge warning">
						<i class="fas fa-exclamation-triangle"></i>
						{$t('security.not_verified')}
					</div>
					<p class="desc text-orange-400">{$t('security.not_verified_desc')}</p>

					<button class="action-btn" on:click={sendVerification} disabled={verificationSent}>
						{verificationSent ? $t('security.btn_sent') : $t('security.btn_verify')}
					</button>
				{/if}
			</div>
		</section>

		<!-- 2. СВЯЗЬ (TELEGRAM) И 2FA -->
		<section class="sec-card">
			<h3 class="sec-title text-cyber-purple">{$t('security.tg_title')}</h3>

			<div class="info-row" style="margin-top: 1rem; border-bottom: none;">
				<span class="label"
					>{$t('security.2fa_label', { default: 'ДВУХФАКТОРНАЯ АУТЕНТИФИКАЦИЯ:' })}</span
				>
				<label
					class="toggle-container"
					class:disabled={!data.telegram_id}
					title={!data.telegram_id
						? $t('security.2fa_no_tg', { default: 'Сначала привяжите Telegram' })
						: ''}
				>
					<input
						type="checkbox"
						checked={data.is2FAEnabled}
						on:change={toggle2FA}
						disabled={!data.telegram_id || isToggling2FA}
					/>
					<span class="slider"></span>
				</label>
			</div>
			{#if !data.telegram_id}
				<p class="desc text-orange-400" style="margin-top: -0.5rem; margin-bottom: 1rem;">
					{$t('security.2fa_no_tg_desc', { default: 'Привяжите Telegram, чтобы включить 2FA' })}
				</p>
			{/if}

			{#if data.telegram_id}
				<div class="info-row">
					<span class="label">{$t('security.status')}</span>
					<span class="status-badge success">{$t('security.connected')}</span>
				</div>
				<div class="info-row">
					<span class="label">{$t('security.user')}</span>
					<span class="value text-cyber-purple"
						>@{data.telegram_username || 'ID: ' + data.telegram_id}</span
					>
				</div>
				<p class="desc">{$t('security.tg_connected_desc')}</p>
			{:else}
				<p class="desc">{$t('security.tg_desc')}</p>

				{#if !tgLinkCode}
					<button class="action-btn purple" on:click={generateTgCode} disabled={isGeneratingCode}>
						{isGeneratingCode ? $t('security.btn_generating') : $t('security.btn_gen')}
					</button>
				{:else}
					<div class="code-box" transition:slide>
						<p class="code-label">{$t('security.code_instruction')}</p>
						<div class="code-val">/link {tgLinkCode}</div>
						<a href="https://t.me/OrionNeurobot" target="_blank" class="bot-link"
							>{$t('security.bot_link')}</a
						>
					</div>
				{/if}
			{/if}
		</section>

		<!-- 3. ОПАСНАЯ ЗОНА -->
		<section class="sec-card danger">
			<h3 class="sec-title text-cyber-red">{$t('security.danger_title')}</h3>
			<p class="desc">{$t('security.danger_desc')}</p>

			<button class="action-btn red" on:click={handleDeleteAccount}>
				{$t('security.btn_delete')}
			</button>
		</section>
	</div>
</div>

<style>
	.security-container {
		max-width: 800px;
		margin: 3rem auto;
		padding: 2rem;
		background: rgba(10, 12, 15, 0.9);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 16px;
	}

	.page-title {
		text-align: center;
		font-size: 2rem;
		color: #fff;
		margin-bottom: 2rem;
		text-shadow: 0 0 15px rgba(255, 255, 255, 0.2);
	}

	.sections-grid {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.sec-card {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.05);
		border-radius: 12px;
		padding: 1.5rem;
	}

	.sec-title {
		font-weight: 900;
		font-size: 1.1rem;
		margin-bottom: 1rem;
		letter-spacing: 0.1em;
	}

	.info-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
		border-bottom: 1px dashed rgba(255, 255, 255, 0.1);
		padding-bottom: 0.5rem;
	}

	.label {
		color: #888;
		font-size: 0.8rem;
		font-weight: bold;
	}
	.value {
		color: #fff;
	}

	.desc {
		color: #666;
		font-size: 0.85rem;
		margin-top: 0.5rem;
		line-height: 1.4;
	}

	/* BADGES */
	.status-badge {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 10px;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: bold;
		font-family: 'Chakra Petch', monospace;
	}
	.status-badge.success {
		background: rgba(57, 255, 20, 0.1);
		color: #39ff14;
		border: 1px solid #39ff14;
	}
	.status-badge.warning {
		background: rgba(255, 165, 0, 0.1);
		color: orange;
		border: 1px solid orange;
	}

	/* TOGGLE SWITCH */
	.toggle-container {
		position: relative;
		display: inline-block;
		width: 44px;
		height: 24px;
	}
	.toggle-container.disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.toggle-container input {
		opacity: 0;
		width: 0;
		height: 0;
	}
	.slider {
		position: absolute;
		cursor: pointer;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		transition: 0.4s;
		border-radius: 24px;
	}
	.toggle-container.disabled .slider {
		cursor: not-allowed;
	}
	.slider:before {
		position: absolute;
		content: '';
		height: 16px;
		width: 16px;
		left: 3px;
		bottom: 3px;
		background-color: #fff;
		transition: 0.4s;
		border-radius: 50%;
	}
	input:checked + .slider {
		background-color: rgba(188, 19, 254, 0.5);
		border-color: #bc13fe;
	}
	input:checked + .slider:before {
		transform: translateX(20px);
		background-color: #bc13fe;
		box-shadow: 0 0 10px #bc13fe;
	}

	/* BUTTONS */
	.action-btn {
		margin-top: 1rem;
		width: 100%;
		padding: 0.8rem;
		background: rgba(255, 255, 255, 0.1);
		color: #fff;
		border: 1px solid rgba(255, 255, 255, 0.2);
		font-family: 'Chakra Petch', monospace;
		font-weight: bold;
		cursor: pointer;
		transition: all 0.2s;
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}
	.action-btn:hover {
		background: #fff;
		color: #000;
	}
	.action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.action-btn.purple {
		border-color: var(--cyber-purple);
		color: var(--cyber-purple);
		background: transparent;
	}
	.action-btn.purple:hover {
		background: var(--cyber-purple);
		color: #fff;
		box-shadow: 0 0 15px var(--cyber-purple);
	}

	.action-btn.red {
		border-color: #ff003c;
		color: #ff003c;
		background: transparent;
	}
	.action-btn.red:hover {
		background: #ff003c;
		color: #fff;
		box-shadow: 0 0 15px #ff003c;
	}

	.sec-card.danger {
		border-color: rgba(255, 0, 60, 0.3);
		background: rgba(255, 0, 60, 0.05);
	}

	/* CODE BOX */
	.code-box {
		margin-top: 1rem;
		text-align: center;
		background: #000;
		padding: 1rem;
		border-radius: 8px;
		border: 1px dashed #444;
	}
	.code-val {
		font-size: 1.5rem;
		color: var(--cyber-purple);
		font-weight: bold;
		font-family: monospace;
		letter-spacing: 2px;
		margin: 0.5rem 0;
		user-select: all;
	}
	.bot-link {
		color: var(--cyber-cyan);
		font-size: 0.8rem;
		text-decoration: underline;
	}

	@media (max-width: 640px) {
		.security-container {
			margin: 1rem;
			padding: 1rem;
		}
		.page-title {
			font-size: 1.5rem;
		}
	}
</style>
