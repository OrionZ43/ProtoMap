<script lang="ts">
    import { auth, db } from "$lib/firebase";
    import { createUserWithEmailAndPassword, updateProfile, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
    import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
    import { getFunctions, httpsCallable } from "firebase/functions";
    import { goto } from "$app/navigation";
    import NeonButton from '$lib/components/NeonButton.svelte';
    import CyberTurnstile from '$lib/components/CyberTurnstile.svelte';
    import { onMount } from 'svelte';
    import { quintOut } from 'svelte/easing';
    import { tweened } from 'svelte/motion';
    import { modal } from '$lib/stores/modalStore';
    import { userStore } from '$lib/stores';
    import { t } from 'svelte-i18n';

    let email = "";
    let password = "";
    let username = "";
    let loading = false;
    let googleLoading = false;
    let termsAccepted = false;

    let turnstileToken = '';
    let turnstileVerified = false;

    const TURNSTILE_SITE_KEY = "0x4AAAAAACYHm8usBkEdoF37";

    const opacity = tweened(0, { duration: 400, easing: quintOut });
    onMount(() => {
        opacity.set(1);
    });

    function handleTurnstileVerified(event: CustomEvent) {
        turnstileToken = event.detail.token;
        turnstileVerified = true;
        console.log('✅ Капча пройдена');
    }

    function handleTurnstileError() {
        turnstileVerified = false;
        modal.error("Ошибка капчи", "Не удалось загрузить проверку. Попробуйте обновить страницу.");
    }

    async function isUsernameAvailable(name: string): Promise<boolean> {
        const trimmedName = name.trim();
        if (trimmedName.length < 4) return false;
        try {
            const functions = getFunctions();
            const checkUsernameFunc = httpsCallable(functions, 'checkUsername');
            const result = await checkUsernameFunc({ username: trimmedName });
            return (result.data as { isAvailable: boolean }).isAvailable;
        } catch (e) {
            console.error("Ошибка проверки username:", e);
            modal.error("Системная ошибка", "Не удалось проверить имя пользователя.");
            return false;
        }
    }

    // 🔥 NEW: Функция ожидания загрузки userStore
    async function waitForUserStoreUpdate(uid: string, maxAttempts = 10): Promise<void> {
        for (let i = 0; i < maxAttempts; i++) {
            const currentStore = await new Promise<any>(resolve => {
                let unsubscribeFn: (() => void) | null = null;
                unsubscribeFn = userStore.subscribe(value => {
                    if (unsubscribeFn) unsubscribeFn();
                    resolve(value);
                });
            });

            if (currentStore.user?.uid === uid) {
                console.log('✅ UserStore обновлён, профиль загружен');
                return;
            }

            console.log(`⏳ Ожидание userStore (${i + 1}/${maxAttempts})...`);
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        console.warn('⚠️ UserStore не обновился, но продолжаем');
    }

    async function handleRegister() {
        if (!turnstileVerified) {
            modal.error("Требуется проверка", "Подтвердите, что вы не робот.");
            return;
        }

        if (!termsAccepted) {
            modal.error("Требуется согласие", "Примите условия соглашения.");
            return;
        }

        const finalEmail = email.trim();
        const finalUsername = username.trim();

        if (!finalEmail || !password || !finalUsername) {
            modal.error("Ошибка ввода", "Заполните все поля.");
            return;
        }
        if (finalUsername.length < 4) {
             modal.error("Ошибка ввода", "Username минимум 4 символа.");
             return;
        }

        loading = true;

        const usernameIsAvailable = await isUsernameAvailable(finalUsername);
        if (!usernameIsAvailable) {
            modal.error("Ошибка регистрации", "Username занят.");
            loading = false;
            return;
        }

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, finalEmail, password);
            const user = userCredential.user;
            await updateProfile(user, { displayName: finalUsername });

            const userDocRef = doc(db, "users", user.uid);
            await setDoc(userDocRef, {
                username: finalUsername,
                email: user.email,
                about_me: "",
                avatar_url: "",
                social_link: "",
                createdAt: serverTimestamp(),
                casino_credits: 100,
                last_daily_bonus: null,
                owned_items: [],
                turnstileVerified: true
            });

            console.log("✅ Зарегистрирован:", user.uid);

            const token = await user.getIdToken();
            await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken: token }),
            });

            // 🔥 FIX: Принудительно обновляем userStore
            const profileData = {
                uid: user.uid,
                username: finalUsername,
                email: user.email,
                emailVerified: user.emailVerified,
                avatar_url: "",
                social_link: "",
                about_me: "",
                status: "",
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

            // Небольшая задержка для синхронизации
            await new Promise(resolve => setTimeout(resolve, 300));

            goto('/');
        } catch (e: any) {
            console.error("Ошибка регистрации:", e.code);
            if (e.code === 'auth/email-already-in-use') {
                modal.error("Ошибка", "Email занят.");
            } else if (e.code === 'auth/weak-password') {
                modal.error("Ошибка", "Пароль слабый (минимум 6 символов).");
            } else {
                modal.error("Ошибка", "Произошла ошибка.");
            }
        } finally {
            loading = false;
        }
    }

    async function handleGoogleLogin() {
        if (!turnstileVerified) {
            modal.error("Требуется проверка", "Подтвердите, что вы не робот.");
            return;
        }

        googleLoading = true;
        const provider = new GoogleAuthProvider();

        try {
            const result = await signInWithPopup(auth, provider);
            const user = result.user;

            console.log("✅ Google Auth:", user.uid);
            await user.getIdToken(true);

            const userDocRef = doc(db, "users", user.uid);
            let userDocSnap = await getDoc(userDocRef);

            if (!userDocSnap.exists()) {
                console.log("📝 Новый Google юзер, создаём профиль...");

                let generatedUsername = user.displayName || '';
                generatedUsername = generatedUsername.replace(/[^a-zA-Z0-9_]/g, '');

                if (generatedUsername.length < 3) {
                    generatedUsername = `user_${user.uid.substring(0, 8)}`;
                }

                if (generatedUsername.length > 20) {
                    generatedUsername = generatedUsername.substring(0, 20);
                }

                const isAvailable = await isUsernameAvailable(generatedUsername);
                if (!isAvailable) {
                    const randomSuffix = Math.floor(Math.random() * 9999);
                    generatedUsername = `${generatedUsername.substring(0, 15)}_${randomSuffix}`;
                }

                console.log('🔧 Username:', generatedUsername);

                await setDoc(userDocRef, {
                    username: generatedUsername,
                    email: user.email || "",
                    avatar_url: user.photoURL || "",
                    about_me: "",
                    social_link: "",
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

                console.log('✅ Профиль создан');

                // 🔥 FIX: Принудительно обновляем профиль в userStore
                // Иначе onAuthStateChanged не сработает повторно
                const profileData = {
                    uid: user.uid,
                    username: generatedUsername,
                    email: user.email || "",
                    emailVerified: user.emailVerified,
                    avatar_url: user.photoURL || "",
                    social_link: "",
                    about_me: "",
                    status: "",
                    casino_credits: 100,
                    last_daily_bonus: null,
                    daily_streak: 0,
                    owned_items: [],
                    equipped_frame: null,
                    equipped_badge: null,
                    equipped_bg: null,
                    blocked_uids: []
                };

                // Обновляем стор вручную
                userStore.set({ user: profileData, loading: false });

                // Ждём подтверждения записи в Firestore
                await new Promise(resolve => setTimeout(resolve, 300));
                userDocSnap = await getDoc(userDocRef);

            } else {
                console.log('✅ Профиль существует');
            }

            const token = await user.getIdToken();
            await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken: token }),
            });

            console.log('✅ Вход выполнен');

            goto('/');

        } catch (e: any) {
            console.error("❌ Google вход:", e);

            if (e.code === 'auth/popup-blocked') {
                modal.error("Окно заблокировано", "Разрешите всплывающие окна.");
            } else if (e.code === 'auth/cancelled-popup-request') {
                console.log("Отменено");
            } else {
                modal.error("Ошибка", `Не удалось войти: ${e.message}`);
            }
        } finally {
            googleLoading = false;
        }
    }
</script>

<svelte:head>
    <title>{$t('auth.register_title')} | ProtoMap</title>
</svelte:head>

<div class="form-container cyber-panel pb-12" style="opacity: {$opacity}">

    <h2 class="form-title font-display">{$t('auth.register_title')}</h2>

    <form on:submit|preventDefault={handleRegister} class="space-y-8" novalidate>
        <div class="form-group">
            <label for="username" class="form-label font-display">{$t('auth.username_label')}</label>
            <input bind:value={username} type="text" id="username" name="username" class="input-field">
        </div>
        <div class="form-group">
            <label for="email" class="form-label font-display">{$t('auth.email_label')}</label>
            <input bind:value={email} type="email" id="email" name="email" class="input-field">
        </div>
        <div class="form-group">
            <label for="password" class="form-label font-display">{$t('auth.password_label')}</label>
            <input bind:value={password} type="password" id="password" name="password" class="input-field">
        </div>

        <div class="form-group flex justify-center">
            <CyberTurnstile
                siteKey={TURNSTILE_SITE_KEY}
                on:verified={handleTurnstileVerified}
                on:error={handleTurnstileError}
            />
        </div>

        <div class="form-group pt-2">
            <label class="terms-label">
                <input type="checkbox" bind:checked={termsAccepted} class="terms-checkbox">
                <span class="custom-checkbox"></span>
                <span class="text-sm text-gray-400">
                    {$t('auth.terms_agree')}
                    <a href="/terms-of-service" target="_blank" class="link">{$t('auth.terms_link')}</a>
                    &
                    <a href="/privacy-policy" target="_blank" class="link">{$t('auth.privacy_link')}</a>
                </span>
            </label>
        </div>

        <div class="pt-2">
            <NeonButton
                type="submit"
                disabled={loading || googleLoading || !termsAccepted || !turnstileVerified}
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
        <div class="absolute inset-0 flex items-center" aria-hidden="true"><div class="w-full border-t border-gray-700/50"></div></div>
        <div class="relative flex justify-center text-sm"><span class="px-3 bg-gray-900 text-gray-500 uppercase font-display tracking-wider">{$t('auth.or')}</span></div>
    </div>

    <div class="text-center">
        <button
            on:click={handleGoogleLogin}
            disabled={googleLoading || loading || !turnstileVerified}
            type="button"
            title="Войти/Зарегистрироваться с Google"
            class="google-btn"
        >
            <svg class="w-6 h-6" viewBox="0 0 48 48">
                <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path>
                <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path>
                <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.223,0-9.65-3.657-11.303-8l-6.571,4.819C9.656,39.663,16.318,44,24,44z"></path>
                <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.574l6.19,5.238C41.38,36.435,44,30.836,44,24C44,22.659,43.862,21.35,43.611,20.083z"></path>
            </svg>
        </button>
    </div>

    <p class="mt-8 text-center text-sm text-gray-500">
        {$t('auth.has_account')} <a href="/login" class="font-bold text-cyber-yellow hover:text-white">{$t('auth.login_btn')}</a>
    </p>
</div>

<style>
    .form-container {
        @apply max-w-lg mx-auto my-10 p-8 rounded-none shadow-2xl relative;
        background: rgba(10, 10, 10, 0.5); backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        border: 1px solid rgba(252, 238, 10, 0.2);
        clip-path: polygon(0 15px, 15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%);
        transition: opacity 0.4s ease-in-out;
    }
    @media (max-width: 640px) { .form-container { @apply my-4 mx-4 p-6; } }

    .form-title { @apply text-2xl lg:text-3xl font-bold text-center text-white mb-10;text-shadow: none; }
    .form-group { }
    .form-label { @apply block text-sm font-bold uppercase tracking-widest text-cyber-yellow mb-2; }
    .input-field {
        @apply block w-full p-2 bg-transparent text-gray-200;
        border: none; border-bottom: 1px solid var(--border-color, #30363d);
        border-radius: 0; font-family: 'Inter', sans-serif;
        font-size: 1.1em; transition: border-color 0.3s, box-shadow 0.3s;
    }
    .input-field:focus { @apply outline-none; border-bottom-color: var(--cyber-yellow, #fcee0a); box-shadow: 0 1px 0 var(--cyber-yellow, #fcee0a); }

    .google-btn { @apply inline-flex justify-center items-center w-12 h-12 p-3 border border-gray-700 rounded-full shadow-sm; background-color: var(--input-bg-color); transition: background-color 0.2s, border-color 0.2s; }
    .google-btn:hover:not(:disabled) { background-color: var(--secondary-bg-color); border-color: var(--border-color); }
    .google-btn:disabled { @apply opacity-50 cursor-not-allowed; }

    .terms-label {
        display: flex;
        align-items: center;
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
        background-color: rgba(255,255,255,0.1);
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