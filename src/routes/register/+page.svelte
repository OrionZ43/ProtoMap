<script lang="ts">
	import { auth, db, appCheck, functions } from '$lib/firebase';
	import {
		createUserWithEmailAndPassword,
		updateProfile,
		signInWithPopup,
		signInWithRedirect,
		getRedirectResult,
		GoogleAuthProvider,
		type User
	} from 'firebase/auth';
	import { getToken } from 'firebase/app-check';
	import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
	import { httpsCallable } from 'firebase/functions';
	import { goto } from '$app/navigation';
	import NeonButton from '$lib/components/NeonButton.svelte';
	import CyberTurnstile from '$lib/components/CyberTurnstile.svelte';
	import { onMount } from 'svelte';
	import { quintOut } from 'svelte/easing';
	import { tweened } from 'svelte/motion';
	// Используются в разметке модалки 2FA (transition:fade / transition:slide).
	// Без этого импорта страница падала с ReferenceError при открытии модалки.
	import { fade, slide } from 'svelte/transition';
	import { modal } from '$lib/stores/modalStore';
	import { userStore } from '$lib/stores';
	import { t } from 'svelte-i18n';

	let email = '';
	let password = '';
	let username = '';
	let loading = false;
	let googleLoading = false;

	// ─── Согласия ────────────────────────────────────────────────────────────
	//
	// Раздельные, а не одна галочка «принимаю всё». По пункту 1 статьи 5 Закона
	// № 99-З согласие должно быть свободным и однозначным — одно связанное
	// согласие сразу на аккаунт, карту, чаты и трансграничную передачу этому
	// требованию не отвечает.
	//
	// Ни один флаг не предзаполнен: предзаполненная галочка не является
	// выражением воли.
	//
	// Согласия `activity_data` (шагомер) здесь нет намеренно: на вебе шагомера
	// не существует, его спрашивает Android в своём разделе «Шагомер».
	let consentAgeMinimum = false;
	let consentCoreProcessing = false;
	let consentCrossBorder = false;
	let consentTos = false;

	$: allConsentsGiven =
		consentAgeMinimum && consentCoreProcessing && consentCrossBorder && consentTos;

	/** Виды согласий в том порядке, в котором их ждёт Cloud Function. */
	const GRANTED_CONSENTS = ['age_minimum', 'core_processing', 'cross_border', 'tos'];

	// Вход через Google в Firefox и Яндексе уходит на signInWithRedirect —
	// страница перезагружается, и отмеченные галочки теряются. Без переноса
	// через sessionStorage регистрация по редиректу упиралась бы в проверку
	// согласий, которую физически невозможно пройти.
	const PENDING_CONSENTS_KEY = 'protomap_pending_consents';

	function stashConsents() {
		try {
			sessionStorage.setItem(
				PENDING_CONSENTS_KEY,
				JSON.stringify({
					ageMinimum: consentAgeMinimum,
					core: consentCoreProcessing,
					cross: consentCrossBorder,
					tos: consentTos
				})
			);
		} catch {
			// Приватный режим или заблокированное хранилище — не критично,
			// пользователь просто отметит галочки заново.
		}
	}

	function restoreConsents() {
		try {
			const raw = sessionStorage.getItem(PENDING_CONSENTS_KEY);
			if (!raw) return;
			sessionStorage.removeItem(PENDING_CONSENTS_KEY);
			const saved = JSON.parse(raw);
			consentAgeMinimum = saved.ageMinimum === true;
			consentCoreProcessing = saved.core === true;
			consentCrossBorder = saved.cross === true;
			consentTos = saved.tos === true;
		} catch {
			// Битое значение — оставляем галочки снятыми.
		}
	}

	/**
	 * Пишет согласия в серверный журнал.
	 *
	 * Журнал ведётся только на сервере (коллекция `consents`, запись клиенту
	 * запрещена правилами): пункт 7 статьи 5 возлагает доказывание согласия на
	 * оператора, а клиентская запись доказательством не является.
	 *
	 * Ошибку здесь не показываем пользователю и не откатываем регистрацию:
	 * аккаунт уже создан, и ронять флоу из-за журнала неправильно. Но в консоль
	 * пишем — расхождение между аккаунтом и журналом надо уметь заметить.
	 */
	async function recordConsents(method: 'web' = 'web') {
		try {
			const fn = httpsCallable(functions, 'recordConsents');
			await fn({ granted: GRANTED_CONSENTS, method });
		} catch (e) {
			console.error('Не удалось записать согласия:', e);
		}
	}

	// Флаг готовности App Check токена — кнопка Google заблокирована до прогрева
	let appCheckReady = false;

	// 2FA Состояние
	let show2FAModal = false;
	let twoFactorCode = '';
	let isVerifying2FA = false;

	async function verify2FACode() {
		if (!twoFactorCode || twoFactorCode.length !== 5) {
			modal.error('Ошибка', 'Код должен состоять из 5 цифр');
			return;
		}

		isVerifying2FA = true;
		try {
			const verifyFunc = httpsCallable(functions, 'verify2FACode');
			await verifyFunc({ code: twoFactorCode });

			// Успех
			localStorage.setItem(`2fa_passed_${auth.currentUser!.uid}`, 'true');
			show2FAModal = false;

			const token = await auth.currentUser!.getIdToken();
			await fetch('/api/auth', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ idToken: token })
			});

			// Жесткая перезагрузка страницы (редирект на главную)
			window.location.href = '/';
		} catch (e: any) {
			modal.error('Ошибка 2FA', e.message || 'Неверный код');
		} finally {
			isVerifying2FA = false;
		}
	}

	let turnstileToken = '';
	let turnstileVerified = false;

	const TURNSTILE_SITE_KEY = '0x4AAAAAACYHm8usBkEdoF37';

	const opacity = tweened(0, { duration: 400, easing: quintOut });

	onMount(async () => {
		opacity.set(1);

		// Возврат с редирект-входа — и одновременно прогрев резолвера.
		//
		// Firebase грузит gapi и iframe с authDomain только при первом обращении.
		// Если это случается уже внутри обработчика клика, попап не успевает
		// открыться в окне «пользовательского жеста» и браузер его блокирует.
		// Этот вызов поднимает резолвер заранее.
		//
		// Он же забирает результат входа, если пользователь вернулся с редиректа
		// (запасной путь, когда попап заблокирован). Раньше результат здесь
		// осознанно выбрасывался — теперь его нельзя терять.
		//
		// Не await'им намеренно: пусть App Check прогревается параллельно,
		// иначе кнопка дольше остаётся заблокированной.
		getRedirectResult(auth)
			.then(async (redirectResult) => {
				if (!redirectResult?.user) return;
				// Галочки согласия были отмечены ДО ухода на редирект —
				// поднимаем их обратно, иначе проверка ниже не пройдёт.
				restoreConsents();
				await handleGoogleLogin(redirectResult.user);
			})
			.catch((e) => {
				console.error('[Auth] Не удалось завершить вход после редиректа:', e);
				modal.error('Ошибка', 'Не удалось завершить вход через Google. Попробуйте ещё раз.');
			});

		// Прогреваем App Check токен ДО того как юзер нажмёт кнопку.
		// Без этого signInWithPopup уходит за токеном асинхронно,
		// браузер теряет контекст пользовательского жеста и блокирует попап.
		if (appCheck) {
			try {
				await getToken(appCheck, false);
			} catch (e) {
				console.warn('[AppCheck] Pre-warm failed, will retry on click:', e);
			}
		}
		appCheckReady = true;
	});

	function handleTurnstileVerified(event: CustomEvent) {
		turnstileToken = event.detail.token;
		turnstileVerified = true;
	}

	function handleTurnstileError() {
		turnstileVerified = false;
		modal.error('Ошибка капчи', 'Не удалось загрузить проверку. Попробуйте обновить страницу.');
	}

	async function isUsernameAvailable(name: string): Promise<boolean> {
		const trimmedName = name.trim();
		if (trimmedName.length < 4) return false;
		try {
			const checkUsernameFunc = httpsCallable(functions, 'checkUsername');
			const result = await checkUsernameFunc({ username: trimmedName });
			return (result.data as { isAvailable: boolean }).isAvailable;
		} catch (e) {
			console.error('Ошибка проверки username:', e);
			return false;
		}
	}

	async function handleRegister() {
		if (!turnstileVerified) {
			modal.error('Требуется проверка', 'Подтвердите, что вы не робот.');
			return;
		}

		if (!allConsentsGiven) {
			modal.error('Требуется согласие', 'Отметьте все обязательные пункты согласия.');
			return;
		}

		const finalEmail = email.trim();
		const finalUsername = username.trim();

		if (!finalEmail || !password || !finalUsername) {
			modal.error('Ошибка ввода', 'Заполните все поля.');
			return;
		}

		loading = true;

		const usernameIsAvailable = await isUsernameAvailable(finalUsername);
		if (!usernameIsAvailable) {
			modal.error('Ошибка регистрации', 'Username занят.');
			loading = false;
			return;
		}

		try {
			const userCredential = await createUserWithEmailAndPassword(auth, finalEmail, password);
			const user = userCredential.user;
			await updateProfile(user, { displayName: finalUsername });

			const userDocRef = doc(db, 'users', user.uid);
			await setDoc(userDocRef, {
				username: finalUsername,
				about_me: '',
				avatar_url: '',
				social_link: '',
				createdAt: serverTimestamp(),
				casino_credits: 100,
				last_daily_bonus: null,
				owned_items: [],
				turnstileVerified: true
			});

			await recordConsents();

			const token = await user.getIdToken();
			await fetch('/api/auth', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ idToken: token })
			});

			await new Promise((resolve) => setTimeout(resolve, 500));
			// Жесткая перезагрузка страницы
			window.location.href = '/';
		} catch (e: any) {
			console.error('Ошибка регистрации:', e.code);
			modal.error('Ошибка', e.message || 'Произошла ошибка при регистрации.');
		} finally {
			loading = false;
		}
	}

	/**
	 * Вход/регистрация через Google. Вызывается из двух мест:
	 *   - клик по кнопке (preAuthedUser не задан) — открывается попап;
	 *   - возврат с редирект-входа (preAuthedUser задан) — попап не нужен.
	 * Капчу проверяем только в первом случае: на возврате с редиректа
	 * пользователь её уже прошёл до ухода со страницы.
	 */
	async function handleGoogleLogin(preAuthedUser?: User) {
		if (!preAuthedUser && !turnstileVerified) {
			modal.error('Требуется проверка', 'Подтвердите, что вы не робот.');
			return;
		}

		// Через Google тоже создаётся аккаунт, значит согласия нужны и здесь.
		// Проверяем и на возврате с редиректа — там они восстановлены из
		// sessionStorage в onMount.
		if (!allConsentsGiven) {
			modal.error('Требуется согласие', 'Отметьте все обязательные пункты согласия.');
			return;
		}

		googleLoading = true;

		// ⚠️ НИЧЕГО не await'им до signInWithPopup. Раньше здесь стоял
		// повторный getToken(appCheck) — он был недостижим (кнопка disabled,
		// пока !appCheckReady), но если условие disabled когда-нибудь изменят,
		// этот await снова начнёт рвать цепочку пользовательского жеста
		// и попап опять заблокируется.

		const provider = new GoogleAuthProvider();

		try {
			// preAuthedUser приходит при возврате с редирект-входа: пользователь
			// уже аутентифицирован, попап открывать не нужно.
			const user = preAuthedUser ?? (await signInWithPopup(auth, provider)).user;

			const userDocRef = doc(db, 'users', user.uid);
			let userDocSnap = await getDoc(userDocRef);

			if (!userDocSnap.exists()) {
				let generatedUsername = user.displayName || '';
				generatedUsername = generatedUsername.replace(/[^a-zA-Z0-9_]/g, '');

				if (generatedUsername.length < 3) generatedUsername = `user_${user.uid.substring(0, 8)}`;
				if (generatedUsername.length > 20) generatedUsername = generatedUsername.substring(0, 20);

				const isAvailable = await isUsernameAvailable(generatedUsername);
				if (!isAvailable) {
					const randomSuffix = Math.floor(Math.random() * 9999);
					generatedUsername = `${generatedUsername.substring(0, 15)}_${randomSuffix}`;
				}

				await setDoc(userDocRef, {
					username: generatedUsername,
					avatar_url: user.photoURL || '',
					about_me: '',
					social_link: '',
					createdAt: serverTimestamp(),
					casino_credits: 100,
					glitch_shards: 0,
					last_daily_bonus: null,
					owned_items: [],
					daily_streak: 0,
					isBanned: false,
					emailVerified: user.emailVerified,
					turnstileVerified: true
				});

				await recordConsents();

				const profileData = {
					uid: user.uid,
					username: generatedUsername,
					email: user.email || '',
					emailVerified: user.emailVerified,
					avatar_url: user.photoURL || '',
					social_link: '',
					about_me: '',
					status: '',
					casino_credits: 100,
					last_daily_bonus: null,
					daily_streak: 0,
					owned_items: [],
					equipped_frame: null,
					equipped_badge: null,
					equipped_bg: null,
					blocked_uids: []
				};
				userStore.set({ user: profileData, loading: false });
				await new Promise((resolve) => setTimeout(resolve, 300));
			} else {
				const data = userDocSnap.data();
				if (data.is2FAEnabled) {
					show2FAModal = true;
					const sendCodeFunc = httpsCallable(functions, 'send2FACode');
					await sendCodeFunc();
					return; // Stop normal flow and wait for 2FA verification
				}
				const profileData = {
					uid: user.uid,
					username: data.username,
					email: user.email || '',
					emailVerified: user.emailVerified,
					avatar_url: data.avatar_url || '',
					social_link: data.social_link || '',
					about_me: data.about_me || '',
					status: data.status || '',
					casino_credits: data.casino_credits ?? 100,
					last_daily_bonus: data.last_daily_bonus ? data.last_daily_bonus.toDate() : null,
					daily_streak: data.daily_streak || 0,
					owned_items: data.owned_items || [],
					equipped_frame: data.equipped_frame || null,
					equipped_badge: data.equipped_badge || null,
					equipped_bg: data.equipped_bg || null,
					blocked_uids: data.blocked_uids || []
				};
				userStore.set({ user: profileData, loading: false });
			}

			const token = await user.getIdToken();
			await fetch('/api/auth', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ idToken: token })
			});
			await new Promise((resolve) => setTimeout(resolve, 300));
			goto('/');
		} catch (e: any) {
			console.error('❌ Google вход:', e);
			if (e.code === 'auth/popup-blocked') {
				// Не ругаемся на пользователя за настройки браузера, а входим
				// тем же способом, но редиректом: это навигация верхнего уровня,
				// блокировщик попапов на неё не действует.
				//
				// Работает корректно только потому, что authDomain теперь наш
				// собственный домен (rewrite /__/auth/* в vercel.json). С чужим
				// authDomain результат редиректа терялся бы в разделённом
				// хранилище у Firefox и Safari.
				console.warn('[Auth] Попап заблокирован — уходим на редирект');
				try {
					// Страница сейчас перезагрузится — сохраняем отмеченные согласия.
					stashConsents();
					await signInWithRedirect(auth, provider);
					return;
				} catch (redirectError) {
					console.error('[Auth] Редирект тоже не удался:', redirectError);
					modal.error(
						'Не удалось войти',
						'Браузер заблокировал и всплывающее окно, и переход. Разрешите всплывающие окна для сайта и попробуйте снова.'
					);
				}
			} else if (e.code === 'auth/cancelled-popup-request') {
				// Пользователь закрыл окно или нажал второй раз — это не ошибка.
			} else {
				modal.error('Ошибка', e.message || 'Не удалось войти через Google.');
			}
		} finally {
			googleLoading = false;
		}
	}
</script>

{#if show2FAModal}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
		transition:fade={{ duration: 200 }}
	>
		<div class="cyber-panel relative w-full max-w-sm p-8" transition:slide>
			<h2 class="text-shadow-yellow mb-4 text-center font-display text-2xl text-cyber-yellow">
				{$t('auth.2fa_title', { default: 'ЗАЩИТА 2FA' })}
			</h2>
			<p class="mb-6 text-center text-sm text-gray-300">
				{$t('auth.2fa_desc', { default: 'Код отправлен в ваш Telegram. Введите его ниже.' })}
			</p>

			<input
				type="text"
				bind:value={twoFactorCode}
				placeholder="12345"
				class="mb-6 w-full border border-gray-700 bg-gray-900 p-3 text-center font-mono text-2xl tracking-widest text-white outline-none focus:border-cyber-yellow"
				maxlength="5"
			/>

			<NeonButton
				extraClass="w-full"
				on:click={verify2FACode}
				disabled={isVerifying2FA || twoFactorCode.length !== 5}
			>
				{isVerifying2FA
					? $t('auth.2fa_checking', { default: 'ПРОВЕРКА...' })
					: $t('auth.2fa_btn', { default: 'ПОДТВЕРДИТЬ' })}
			</NeonButton>

			<button
				class="mt-4 w-full text-center text-xs text-gray-500 transition-colors hover:text-white"
				on:click={async () => {
					show2FAModal = false;
					loading = false;
					googleLoading = false;
					await auth.signOut();
				}}
			>
				{$t('auth.2fa_cancel', { default: 'ОТМЕНА' })}
			</button>
		</div>
	</div>
{/if}

<svelte:head>
	<title>{$t('auth.register_title')} | ProtoMap</title>
</svelte:head>

<div class="form-container cyber-panel pb-12" style="opacity: {$opacity}">
	<h2 class="form-title font-display">{$t('auth.register_title')}</h2>

	<form on:submit|preventDefault={handleRegister} class="space-y-8" novalidate>
		<div class="form-group">
			<label for="username" class="form-label font-display">{$t('auth.username_label')}</label>
			<input bind:value={username} type="text" id="username" name="username" class="input-field" />
		</div>
		<div class="form-group">
			<label for="email" class="form-label font-display">{$t('auth.email_label')}</label>
			<input bind:value={email} type="email" id="email" name="email" class="input-field" />
		</div>
		<div class="form-group">
			<label for="password" class="form-label font-display">{$t('auth.password_label')}</label>
			<input
				bind:value={password}
				type="password"
				id="password"
				name="password"
				class="input-field"
			/>
		</div>

		<div class="form-group flex justify-center">
			<CyberTurnstile
				siteKey={TURNSTILE_SITE_KEY}
				on:verified={handleTurnstileVerified}
				on:error={handleTurnstileError}
			/>
		</div>

		<!--
			Разъяснение прав ДО получения согласия. По части второй пункта 5
			статьи 5 Закона № 99-З права субъекта разъясняются отдельным блоком,
			а не ссылкой на документ, — поэтому текст показан целиком и не
			сворачивается в аккордеон.
		-->
		<div class="form-group pt-2">
			<section class="consent-notice" aria-labelledby="consent-notice-title">
				<h2 id="consent-notice-title" class="consent-notice__title font-display">
					{$t('auth.consent.notice_title')}
				</h2>

				<p class="consent-notice__p">{$t('auth.consent.operator')}</p>
				<p class="consent-notice__p">{$t('auth.consent.purposes')}</p>

				<p class="consent-notice__p">
					<strong>{$t('auth.consent.rights_title')}</strong>
					{$t('auth.consent.rights')}
				</p>
				<p class="consent-notice__p">
					<strong>{$t('auth.consent.howto_title')}</strong>
					{$t('auth.consent.howto')}
				</p>
				<p class="consent-notice__p">
					<strong>{$t('auth.consent.consequences_title')}</strong>
					{$t('auth.consent.consequences')}
				</p>
			</section>

			<div class="consent-list">
				<label class="terms-label">
					<input type="checkbox" bind:checked={consentAgeMinimum} class="terms-checkbox" />
					<span class="custom-checkbox"></span>
					<span class="text-sm text-gray-400">{$t('auth.consent.cb_age_minimum')}</span>
				</label>

				<label class="terms-label">
					<input type="checkbox" bind:checked={consentCoreProcessing} class="terms-checkbox" />
					<span class="custom-checkbox"></span>
					<span class="text-sm text-gray-400">{$t('auth.consent.cb_core')}</span>
				</label>

				<label class="terms-label">
					<input type="checkbox" bind:checked={consentCrossBorder} class="terms-checkbox" />
					<span class="custom-checkbox"></span>
					<span class="text-sm text-gray-400">{$t('auth.consent.cb_cross_border')}</span>
				</label>

				<label class="terms-label">
					<input type="checkbox" bind:checked={consentTos} class="terms-checkbox" />
					<span class="custom-checkbox"></span>
					<span class="text-sm text-gray-400">
						{$t('auth.terms_agree')}
						<a href="/terms-of-service" target="_blank" class="link">{$t('auth.terms_link')}</a>
						&
						<a href="/privacy-policy" target="_blank" class="link">{$t('auth.privacy_link')}</a>
					</span>
				</label>
			</div>
		</div>

		<div class="pt-2">
			<NeonButton
				type="submit"
				disabled={loading || googleLoading || !allConsentsGiven || !turnstileVerified}
				extraClass="w-full"
			>
				{#if loading}
					{$t('ui.loading')}
				{:else}
					{$t('auth.register_btn')}
				{/if}
			</NeonButton>
		</div>
	</form>

	<div class="relative my-6">
		<div class="absolute inset-0 flex items-center" aria-hidden="true">
			<div class="w-full border-t border-gray-700/50"></div>
		</div>
		<div class="relative flex justify-center text-sm">
			<span class="bg-gray-900 px-3 font-display uppercase tracking-wider text-gray-500"
				>{$t('auth.or')}</span
			>
		</div>
	</div>

	<div class="text-center">
		<button
			on:click={() => handleGoogleLogin()}
			disabled={googleLoading || loading || !allConsentsGiven || !turnstileVerified || !appCheckReady}
			type="button"
			title={appCheckReady ? 'Войти/Зарегистрироваться с Google' : 'Подготовка...'}
			class="google-btn"
		>
			{#if !appCheckReady}
				<svg class="h-5 w-5 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
					></circle>
					<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
				</svg>
			{:else}
				<svg class="h-6 w-6" viewBox="0 0 48 48">
					<path
						fill="#FFC107"
						d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"
					></path>
					<path
						fill="#FF3D00"
						d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"
					></path>
					<path
						fill="#4CAF50"
						d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.223,0-9.65-3.657-11.303-8l-6.571,4.819C9.656,39.663,16.318,44,24,44z"
					></path>
					<path
						fill="#1976D2"
						d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.574l6.19,5.238C41.38,36.435,44,30.836,44,24C44,22.659,43.862,21.35,43.611,20.083z"
					></path>
				</svg>
			{/if}
		</button>
	</div>

	<p class="mt-8 text-center text-sm text-gray-500">
		{$t('auth.has_account')}
		<a href="/login" class="font-bold text-cyber-yellow hover:text-white">{$t('auth.login_btn')}</a>
	</p>
</div>

<style>
	.form-container {
		@apply relative mx-auto my-10 max-w-lg rounded-none p-8 shadow-2xl;
		background: rgba(10, 10, 10, 0.5);
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
		border: 1px solid rgba(252, 238, 10, 0.2);
		clip-path: polygon(
			0 15px,
			15px 0,
			100% 0,
			100% calc(100% - 15px),
			calc(100% - 15px) 100%,
			0 100%
		);
		transition: opacity 0.4s ease-in-out;
	}
	@media (max-width: 640px) {
		.form-container {
			@apply mx-4 my-4 p-6;
		}
	}

	.form-title {
		@apply mb-10 text-center text-2xl font-bold text-white lg:text-3xl;
		text-shadow: none;
	}
	.form-group {
	}
	.form-label {
		@apply mb-2 block text-sm font-bold uppercase tracking-widest text-cyber-yellow;
	}
	.input-field {
		@apply block w-full bg-transparent p-2 text-gray-200;
		border: none;
		border-bottom: 1px solid var(--border-color, #30363d);
		border-radius: 0;
		font-family: 'Inter', sans-serif;
		font-size: 1.1em;
		transition:
			border-color 0.3s,
			box-shadow 0.3s;
	}
	.input-field:focus {
		@apply outline-none;
		border-bottom-color: var(--cyber-yellow, #fcee0a);
		box-shadow: 0 1px 0 var(--cyber-yellow, #fcee0a);
	}

	.google-btn {
		@apply inline-flex h-12 w-12 items-center justify-center rounded-full border border-gray-700 p-3 shadow-sm;
		background-color: var(--input-bg-color);
		transition:
			background-color 0.2s,
			border-color 0.2s;
	}
	.google-btn:hover:not(:disabled) {
		background-color: var(--secondary-bg-color);
		border-color: var(--border-color);
	}
	.google-btn:disabled {
		@apply cursor-not-allowed opacity-50;
	}

	/* Разъяснение прав перед согласием. Показывается целиком — сворачивать
	   его в аккордеон нельзя, см. комментарий в разметке. */
	.consent-notice {
		border: 1px solid rgba(0, 243, 255, 0.25);
		border-left: 2px solid #00f3ff;
		background: rgba(0, 20, 30, 0.45);
		padding: 0.9rem 1rem;
		margin-bottom: 1rem;
		max-height: 13rem;
		overflow-y: auto;
	}
	.consent-notice__title {
		font-size: 0.8rem;
		letter-spacing: 0.08em;
		color: #00f3ff;
		margin: 0 0 0.6rem;
		text-transform: uppercase;
	}
	.consent-notice__p {
		font-size: 0.72rem;
		line-height: 1.55;
		color: #9fb3c8;
		margin: 0 0 0.55rem;
	}
	.consent-notice__p:last-child {
		margin-bottom: 0;
	}
	.consent-notice__p strong {
		color: #d5e4f0;
	}

	.consent-list {
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}

	.terms-label {
		display: flex;
		align-items: flex-start;
		cursor: pointer;
		user-select: none;
	}
	.terms-checkbox {
		position: absolute;
		opacity: 0;
		width: 0;
		height: 0;
	}
	.custom-checkbox {
		flex-shrink: 0;
		position: relative;
		width: 20px;
		height: 20px;
		background-color: rgba(255, 255, 255, 0.1);
		border: 1px solid var(--border-color, #30363d);
		margin-right: 10px;
		transition: all 0.2s;
	}
	.terms-checkbox:checked + .custom-checkbox {
		background-color: var(--cyber-yellow);
		border-color: var(--cyber-yellow);
	}
	.custom-checkbox::after {
		content: '';
		position: absolute;
		display: none;
		left: 6px;
		top: 2px;
		width: 6px;
		height: 12px;
		border: solid white;
		border-width: 0 3px 3px 0;
		transform: rotate(45deg);
	}
	.terms-checkbox:checked + .custom-checkbox::after {
		display: block;
	}
	.link {
		color: var(--cyber-yellow);
		text-decoration: underline;
	}
	.link:hover {
		color: #fff;
	}
</style>
