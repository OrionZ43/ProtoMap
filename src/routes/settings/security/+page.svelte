<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, slide } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import { tweened } from 'svelte/motion';
	import { httpsCallable } from 'firebase/functions';
	import { auth, functions } from '$lib/firebase';
	import { sendEmailVerification } from 'firebase/auth';
	import { modal } from '$lib/stores/modalStore';
	import { t, locale } from 'svelte-i18n';
	import { get } from 'svelte/store'; // Нужно для перевода в JS
	import { myBlocked, unblockUser } from '$lib/stores/blocklist';
	import { usernameCache, getUsername } from '$lib/stores/usernameCache';

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
	// Выключить 2FA можно только с кодом из Telegram — его проверяет toggle2FA.
	// Иначе защиту снимал бы любой, кто узнал пароль.
	let disablePending = false;
	let disableCode = '';

	async function toggle2FA(event: Event) {
		const checkbox = event.target as HTMLInputElement;
		// Возвращаем UI в исходное состояние до получения ответа от сервера
		checkbox.checked = data.is2FAEnabled;
		if (data.is2FAEnabled) {
			await requestDisableCode();
		} else {
			await callToggle();
		}
	}

	async function requestDisableCode() {
		isToggling2FA = true;
		try {
			await httpsCallable(functions, 'send2FACode')({ purpose: 'disable_2fa' });
			disableCode = '';
			disablePending = true;
		} catch (e: any) {
			modal.error(translate('ui.error'), e.message);
		} finally {
			isToggling2FA = false;
		}
	}

	async function callToggle(code?: string) {
		isToggling2FA = true;
		try {
			const toggleFunc = httpsCallable(functions, 'toggle2FA');
			const res = await toggleFunc(code ? { code } : undefined);
			data.is2FAEnabled = (res.data as any).is2FAEnabled;
			disablePending = false;
			modal.success(
				translate('ui.success'),
				translate(data.is2FAEnabled ? 'security.2fa_enabled' : 'security.2fa_disabled')
			);
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

	// --- ЧЁРНЫЙ СПИСОК (src/lib/stores/blocklist.ts) ---
	$: blockedList = [...$myBlocked];
	let unblocking: string | null = null;

	async function unblock(uid: string) {
		unblocking = uid;
		try {
			await unblockUser(uid);
		} catch (e: any) {
			modal.error(translate('ui.error'), e.message);
		} finally {
			unblocking = null;
		}
	}

	// --- СОГЛАСИЯ (functions/src/consents.ts) ---
	// Экран согласий при регистрации обещает, что узнать, что дано, и отозвать
	// согласие можно здесь. Необязательные (шагомер) отзываются кнопкой,
	// обязательные — только удалением аккаунта: без них учётной записи нет.
	type ConsentRow = {
		consentId: string;
		revokedAt: number | null;
		grantedAt: number | null;
		method: string;
		doc: string;
		version: string | null;
	};
	const CONSENT_ORDER = ['age_minimum', 'core_processing', 'cross_border', 'tos', 'activity_data', 'activity_leaderboard'];
	const OPTIONAL_CONSENTS = ['activity_data', 'activity_leaderboard'];

	let consents: ConsentRow[] = [];
	let consentsState: 'loading' | 'ready' | 'error' = 'loading';
	let revoking: string | null = null;

	async function loadConsents() {
		try {
			const res = await httpsCallable(functions, 'getMyConsents')();
			const items = (res.data as { items: (Omit<ConsentRow, 'doc' | 'version'> & { documentVersion: string })[] }).items;
			// Записи приходят новыми сверху: первая запись каждого вида — текущее состояние
			const latest = new Map<string, ConsentRow>();
			for (const { documentVersion, ...item } of items) {
				if (latest.has(item.consentId)) continue;
				const [doc, ...rest] = String(documentVersion ?? '').split(' ');
				const version = rest.join(' ');
				latest.set(item.consentId, { ...item, doc, version: version && version !== 'unknown' ? version : null });
			}
			consents = CONSENT_ORDER.flatMap((id) => latest.get(id) ?? []);
			consentsState = 'ready';
		} catch (e) {
			console.error('[Security] Согласия не загрузились:', e);
			consentsState = 'error';
		}
	}
	onMount(loadConsents);

	$: dayFormat = new Intl.DateTimeFormat($locale ?? undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
	$: hasRequiredConsent = consents.some((c) => !OPTIONAL_CONSENTS.includes(c.consentId) && !c.revokedAt);

	function revokeConsent(consentId: string) {
		modal.confirm(translate('consents.confirm_title'), translate(`consents.confirm_${consentId}`), async () => {
			revoking = consentId;
			try {
				await httpsCallable(functions, 'revokeConsent')({ consentId });
				await loadConsents();
				modal.success(translate('ui.success'), translate('consents.revoked_ok'));
			} catch (e: any) {
				modal.error(translate('ui.error'), e.message);
			} finally {
				revoking = null;
			}
		});
	}

	// --- УДАЛЕНИЕ АККАУНТА ---
	async function handleDeleteAccount() {
		modal.confirm(
			translate('security.modal_del_title'),
			translate('security.modal_del_text'),
			async () => {
				try {
					modal.info(translate('ui.loading'), translate('security.modal_wiping'));
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

			{#if disablePending}
				<form class="code-box" transition:slide on:submit|preventDefault={() => callToggle(disableCode.trim())}>
					<p class="code-label">{$t('security.2fa_disable_desc')}</p>
					<input
						class="code-input font-mono"
						bind:value={disableCode}
						inputmode="numeric"
						autocomplete="one-time-code"
						maxlength="5"
						placeholder={$t('security.2fa_code_placeholder')}
						aria-label={$t('security.2fa_code_placeholder')}
						disabled={isToggling2FA}
					/>
					<div class="code-actions">
						<button type="submit" class="action-btn red" disabled={isToggling2FA || disableCode.trim().length < 5}>
							{$t('security.2fa_disable_btn')}
						</button>
						<button type="button" class="action-btn" on:click={() => (disablePending = false)} disabled={isToggling2FA}>
							{$t('security.2fa_cancel')}
						</button>
					</div>
				</form>
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

		<!-- ЧЁРНЫЙ СПИСОК -->
		<section class="sec-card">
			<h3 class="sec-title text-cyber-yellow">{$t('blocklist.title')}</h3>
			<p class="desc">{$t('blocklist.desc')}</p>
			{#if blockedList.length === 0}
				<p class="desc">{$t('blocklist.empty')}</p>
			{:else}
				<ul class="blocked-list">
					{#each blockedList as uid (uid)}
						<li class="blocked-row">
							<a href="/u/{uid}" class="blocked-name">{getUsername($usernameCache, uid, '…')}</a>
							<button class="unblock-btn" on:click={() => unblock(uid)} disabled={unblocking === uid}>
								{$t('blocklist.unblock')}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<!-- СОГЛАСИЯ -->
		<section class="sec-card">
			<h3 class="sec-title text-cyber-yellow">{$t('consents.title')}</h3>
			<p class="desc">{$t('consents.desc')}</p>
			{#if consentsState === 'loading'}
				<p class="desc">{$t('ui.loading')}</p>
			{:else if consentsState === 'error'}
				<p class="desc">{$t('consents.load_error')}</p>
			{:else if consents.length === 0}
				<p class="desc">{$t('consents.empty')}</p>
			{:else}
				<ul class="consent-list">
					{#each consents as c (c.consentId)}
						<li class="consent-row">
							<div class="consent-info">
								<span class="consent-name">{$t(`consents.names.${c.consentId}`)}</span>
								<span class="consent-meta">
									{#if c.revokedAt}
										{$t('consents.revoked_on', { values: { date: dayFormat.format(c.revokedAt) } })}
									{:else}
										{$t('consents.granted', {
											values: {
												date: c.grantedAt ? dayFormat.format(c.grantedAt) : '—',
												where: $t(c.method === 'android' ? 'consents.via_android' : 'consents.via_web')
											}
										})}{#if c.version}{' · '}{$t(c.doc === 'tos' ? 'consents.doc_tos' : 'consents.doc_privacy', {
												values: { version: c.version }
											})}{/if}
									{/if}
								</span>
							</div>
							{#if c.revokedAt}
								<!-- отозванное: дата отзыва уже в строке выше -->
							{:else if OPTIONAL_CONSENTS.includes(c.consentId)}
								<button class="consent-btn" on:click={() => revokeConsent(c.consentId)} disabled={revoking === c.consentId}>
									{$t('consents.revoke')}
								</button>
							{:else}
								<span class="consent-tag">{$t('consents.required')}</span>
							{/if}
						</li>
					{/each}
				</ul>
				{#if hasRequiredConsent}
					<p class="desc">
						{$t('consents.required_note')}
						<a href="#danger-zone" class="consent-link">{$t('consents.to_delete')}</a>
					</p>
				{/if}
			{/if}
		</section>

		<!-- 3. ОПАСНАЯ ЗОНА -->
		<section class="sec-card danger" id="danger-zone">
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
		font-family: 'Chakra Petch', 'Russo One', monospace;
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
		font-family: 'Chakra Petch', 'Russo One', monospace;
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
		/* ссылка из «Согласий» прокручивает сюда — не прятать заголовок под шапкой */
		scroll-margin-top: 6rem;
	}

	/* ЧЁРНЫЙ СПИСОК И СОГЛАСИЯ */
	.blocked-list,
	.consent-list {
		list-style: none;
		margin: 0.75rem 0 0;
		padding: 0;
	}
	.blocked-row,
	.consent-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		padding: 0.5rem 0;
		border-bottom: 1px dashed rgba(255, 255, 255, 0.1);
	}
	.blocked-name {
		color: #fff;
		text-decoration: none;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.blocked-name:hover {
		color: var(--cyber-yellow);
	}
	/* Подписи русские — Russo One: в Chakra Petch нет кириллицы (app.css) */
	.unblock-btn,
	.consent-btn {
		flex-shrink: 0;
		padding: 0.3rem 0.8rem;
		background: transparent;
		color: var(--cyber-yellow);
		border: 1px solid var(--cyber-yellow);
		font-family: var(--font-display);
		font-size: 0.75rem;
		cursor: pointer;
		transition: all 0.2s;
	}
	.unblock-btn:hover:not(:disabled),
	.consent-btn:hover:not(:disabled) {
		background: var(--cyber-yellow);
		color: #000;
	}
	.unblock-btn:disabled,
	.consent-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.consent-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.consent-name {
		color: #fff;
	}
	.consent-meta {
		color: var(--text-muted-color);
		font-size: 0.75rem;
	}
	.consent-tag {
		flex-shrink: 0;
		padding: 0.2rem 0.6rem;
		border: 1px solid rgba(255, 255, 255, 0.15);
		color: #888;
		font-family: var(--font-display);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.consent-link {
		color: var(--cyber-yellow);
		text-decoration: underline;
	}
	/* На узком экране метка или кнопка уходит под название — иначе оно ломается в три строки */
	@media (max-width: 480px) {
		.consent-row {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.5rem;
		}
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

	.code-input {
		width: 100%;
		margin-top: 0.75rem;
		padding: 0.7rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: #fff;
		text-align: center;
		font-size: 1.4rem;
		letter-spacing: 0.4em;
	}
	.code-input:focus {
		outline: none;
		border-color: #ff003c;
	}
	.code-actions {
		display: flex;
		gap: 0.75rem;
	}
	.code-actions .action-btn {
		flex: 1;
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
