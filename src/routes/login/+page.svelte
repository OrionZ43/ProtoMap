<script lang="ts">
    import { auth, db } from "$lib/firebase";
    import {
        signInWithEmailAndPassword,
        signInWithRedirect,
        getRedirectResult,
        GoogleAuthProvider,
        sendPasswordResetEmail
    } from "firebase/auth";
    import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
    import { goto } from "$app/navigation";
    import NeonButton from '$lib/components/NeonButton.svelte';
    import CyberTurnstile from '$lib/components/CyberTurnstile.svelte';
    import { onMount } from 'svelte';
    import { quintOut } from 'svelte/easing';
    import { tweened } from 'svelte/motion';
    import { modal } from '$lib/stores/modalStore';
    import { slide, fade } from 'svelte/transition';
    import { getFunctions, httpsCallable } from "firebase/functions";
    import { userStore } from '$lib/stores';
    import { t } from 'svelte-i18n';

    let email = "";
    let password = "";
    let loading = false;
    let googleLoading = false;
    let isResetMode = false;

    let turnstileToken = '';
    let turnstileVerified = false;

    const TURNSTILE_SITE_KEY = "0x4AAAAAACYHm8usBkEdoF37";

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
            return false;
        }
    }

    const opacity = tweened(0, { duration: 400, easing: quintOut });
    onMount(async () => {
        opacity.set(1);

        try {
            const result = await getRedirectResult(auth);
            if (result && result.user) {
                googleLoading = true;
                const user = result.user;
                console.log("✅ Google Auth Redirect Success:", user.uid);
                await user.getIdToken(true);

                const userDocRef = doc(db, "users", user.uid);
                let userDocSnap = await getDoc(userDocRef);

                if (!userDocSnap.exists()) {
                    console.log("📝 Новый Google юзер (redirect), создаём профиль...");
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
                    console.log("✅ Профиль Google создан!");

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
                    userStore.set({ user: profileData, loading: false });
                    await new Promise(resolve => setTimeout(resolve, 300));
                } else {
                    console.log("♻️ Профиль Google уже существует");
                    const data = userDocSnap.data();
                    const profileData = {
                        uid: user.uid,
                        username: data.username,
                        email: user.email || "",
                        emailVerified: user.emailVerified,
                        avatar_url: data.avatar_url || "",
                        social_link: data.social_link || "",
                        about_me: data.about_me || "",
                        status: data.status || "",
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
                    body: JSON.stringify({ idToken: token }),
                });
                await new Promise(resolve => setTimeout(resolve, 300));
                goto('/');
            }
        } catch (e: any) {
            console.error("❌ Ошибка при getRedirectResult:", e);
            modal.error("Ошибка входа Google", e.message || "Не удалось завершить вход через Google.");
        } finally {
            googleLoading = false;
        }
    });

    // ===== 🎭 1 АПРЕЛЯ =====
    function isAprilFools(): boolean {
        const now = new Date();
        return now.getMonth() === 3 && now.getDate() === 1;
    }

    // Флаг: кнопка Госуслуг видима
    let gosuslugiVisible = isAprilFools();
    // Флаг: показываем модалку "согласия"
    let showGosModal = false;
    // Флаг: модалка "обработки"
    let gosProcessing = false;
    // Счётчик прогресса фейковой загрузки
    let gosProgress = 0;
    let gosProgressInterval: ReturnType<typeof setInterval>;

    function handleGosuslugiClick() {
        showGosModal = true;
    }

    function declineGos() {
        // Отказались — кнопка обиженно исчезает
        showGosModal = false;
        gosuslugiVisible = false;
    }

    async function acceptGos() {
        // Принять — запускаем фейковый прогресс "передачи ОЗУ"
        showGosModal = false;
        gosProcessing = true;
        gosProgress = 0;

        gosProgressInterval = setInterval(() => {
            gosProgress += Math.floor(Math.random() * 7) + 3;
            if (gosProgress >= 100) {
                gosProgress = 100;
                clearInterval(gosProgressInterval);
                // Через 600мс скрываем кнопку и даём нормально войти
                setTimeout(() => {
                    gosProcessing = false;
                    gosuslugiVisible = false;
                }, 600);
            }
        }, 120);
    }
    // ===== /1 АПРЕЛЯ =====

    function handleTurnstileVerified(event: CustomEvent) {
        turnstileToken = event.detail.token;
        turnstileVerified = true;
        console.log('✅ Капча пройдена');
    }

    function handleTurnstileError() {
        turnstileVerified = false;
        modal.error("Ошибка капчи", "Не удалось загрузить проверку. Попробуйте обновить страницу.");
    }

    async function handleLogin() {
        if (!turnstileVerified) {
            modal.error("Требуется проверка", "Пожалуйста, подтвердите, что вы не робот.");
            return;
        }
        if (!email || !password) {
            modal.error("Ошибка ввода", "Пожалуйста, заполните все поля.");
            return;
        }
        loading = true;
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            console.log("✅ Вход выполнен:", user.uid);
            const userDocRef = doc(db, "users", user.uid);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
                const data = userDocSnap.data();
                const profileData = {
                    uid: user.uid,
                    username: data.username,
                    email: user.email,
                    emailVerified: user.emailVerified,
                    avatar_url: data.avatar_url || "",
                    social_link: data.social_link || "",
                    about_me: data.about_me || "",
                    status: data.status || "",
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
                body: JSON.stringify({ idToken: token }),
            });
            await new Promise(resolve => setTimeout(resolve, 300));
            goto('/');
        } catch (e: any) {
            console.error("❌ Ошибка входа:", e.code);
            if (e.code === 'auth/invalid-credential' || e.code === 'auth/invalid-email' || e.code === 'auth/wrong-password') {
                modal.error("Ошибка входа", "Неверный email или пароль.");
            } else if (e.code === 'auth/user-not-found') {
                modal.error("Ошибка входа", "Пользователь с таким email не найден.");
            } else {
                modal.error("Системная ошибка", "Произошла неизвестная ошибка при входе.");
            }
        } finally {
            loading = false;
        }
    }

    async function handleResetPassword() {
        if (!turnstileVerified) {
            modal.error("Требуется проверка", "Пожалуйста, подтвердите, что вы не робот.");
            return;
        }
        if (!email) {
            modal.error("Ошибка ввода", "Введите Email, на который зарегистрирован аккаунт.");
            return;
        }
        loading = true;
        try {
            await sendPasswordResetEmail(auth, email);
            modal.success("Письмо отправлено", `Ссылка для сброса пароля отправлена на <strong>${email}</strong>. Проверьте почту (и папку Спам).`);
            isResetMode = false;
        } catch (e: any) {
            console.error("Ошибка сброса:", e.code);
            if (e.code === 'auth/user-not-found') {
                modal.error("Ошибка", "Пользователь с таким email не найден.");
            } else if (e.code === 'auth/invalid-email') {
                modal.error("Ошибка", "Некорректный формат email.");
            } else {
                modal.error("Ошибка", "Не удалось отправить письмо. Попробуйте позже.");
            }
        } finally {
            loading = false;
        }
    }

    async function handleGoogleLogin() {
        if (!turnstileVerified) {
            modal.error("Требуется проверка", "Пожалуйста, подтвердите, что вы не робот.");
            return;
        }
        googleLoading = true;
        const provider = new GoogleAuthProvider();
        try {
            await signInWithRedirect(auth, provider);
        } catch (e: any) {
            console.error("❌ Ошибка перенаправления Google:", e);
            modal.error("Ошибка", e.message || "Не удалось запустить вход через Google.");
            googleLoading = false;
        }
    }

    function toggleResetMode() {
        isResetMode = !isResetMode;
        password = '';
    }
</script>

<svelte:head>
    <title>{isResetMode ? $t('auth.recover_title') : $t('auth.login_title')} | ProtoMap</title>
</svelte:head>

<!-- ===== 🎭 МОДАЛКА "СОГЛАСИЕ НА ПЕРЕДАЧУ ОЗУ" ===== -->
{#if showGosModal}
    <div class="gos-overlay" transition:fade={{ duration: 150 }}>
        <div class="gos-modal" transition:fade={{ duration: 200 }}>
            <!-- Казённый синий заголовок -->
            <div class="gos-header">
                <span class="gos-logo">🏛️</span>
                <span>ПОРТАЛ ГОСУДАРСТВЕННЫХ УСЛУГ</span>
                <span class="gos-logo">🏛️</span>
            </div>

            <div class="gos-body">
                <p class="gos-title">СОГЛАСИЕ НА СБОР И АНАЛИЗ ДАННЫХ</p>
                <p class="gos-subtitle">Форма № ПМ-1337/А «Оборот синтетических личностей и тостеров»</p>

                <!-- Контейнер со скроллом для эффекта "Войны и Мира" -->
                <div class="gos-scroll-box">
                    <p class="text-sm font-bold mb-2">Для успешной интеграции с реестром МАКС и получения электронного гражданства ProtoMap, вы обязаны предоставить в Z43 Studios следующие данные:</p>

                    <ul class="gos-list">
                        <li>📋 <strong>СНИЛС</strong> (Серийный Номер Искусственной Личности Синта) и заверенную скан-копию заводского клейма.</li>
                        <li>📋 <strong>ИНН</strong> (Индивидуальный Номер Нейросети) с расшифровкой архитектуры слоев.</li>
                        <li>👁 <strong>Визор:</strong> Точная диагональ, тип матрицы, серийный номер дисплея и согласие на трансляцию таргетированной рекламы прямо вам в зрачок.</li>
                        <li>💾 <strong>Память:</strong> Общий объем, тайминги и производитель вашей оперативной памяти (DDR3 подлежат принудительной утилизации).</li>
                        <li>🌡 <strong>Телеметрия процессора:</strong> Средняя температура в состоянии покоя, под стресс-тестом и при просмотре подозрительных артов в интернете.</li>
                        <li>🛢 <strong>Гастрономический профиль:</strong> Ваш любимый вкус машинного масла (допускаются 5W-40, 10W-30 или синтетика со вкусом клубники).</li>
                        <li>🐾 <strong>Биометрия:</strong> Отпечатки всех четырех лапок, логи калибровки пушистого хвоста за последние 30 дней и частота мурчания в герцах.</li>
                        <li>⚙️ <strong>Квота Z43 Studios:</strong> Добровольно-принудительное согласие на передачу <strong>90% вычислительных мощностей</strong> на майнинг ProtoCoins в фоновом режиме.</li>
                        <li>🍞 <strong>Доступ к периферии:</strong> Предоставление Администрации удаленного доступа к вашему встроенному тостеру для жарки хлеба в периоды пиковых нагрузок на сервер.</li>
                        <li>📡 <strong>Аудио-контроль:</strong> Разрешение на круглосуточную трансляцию шума ваших кулеров в федеральный дата-центр для генерации белого шума.</li>
                    </ul>

                    <div class="gos-fine-print mt-4 text-[10px] leading-tight text-gray-500 text-justify">
                        <p>Нажимая кнопку «Принять», субъект (Вы) безоговорочно соглашается с положениями Федерального Закона №1337-ФЗ «О чипировании пушистых», Приказом ProtoMap №404 «О национализации ОЗУ», а также передает все права на свою прошивку, исходный код, гарантийный талон и душу в бессрочное, безвозмездное пользование <strong>Z43 Studios</strong>.</p>
                        <br>
                        <p>Все ваши данные будут тщательно собраны, надежно зашифрованы, переданы в Z43 Studios, затем случайно слиты в открытый доступ, выкуплены нами же на черном рынке и снова проданы рекламодателям.</p>
                        <br>
                        <p>В случае отказа от подписания документа, к субъекту будет применен протокол принудительного даунгрейда ОС до Windows Vista с последующей депортацией в пустоши Glitch Sector 7 для принудительных работ по очистке кэша. Нажатие кнопки «Отказаться» технически невозможно и расценивается как акт кибер-терроризма.</p>
                    </div>
                </div>

                <div class="gos-buttons">
                    <button class="gos-btn-decline" on:click={declineGos}>
                        Отказаться (Штраф 5000 PC)
                    </button>
                    <button class="gos-btn-accept" on:click={acceptGos}>
                        Принять и Отдать ОЗУ ✅
                    </button>
                </div>
            </div>
        </div>
    </div>
{/if}

<!-- ===== 🎭 ЭКРАН "ПЕРЕДАЧА ОЗУ В ПРОЦЕССЕ" ===== -->
{#if gosProcessing}
    <div class="gos-overlay" transition:fade={{ duration: 150 }}>
        <div class="gos-progress-box" transition:fade={{ duration: 200 }}>
            <p class="gos-progress-title">⚙️ ИНИЦИАЛИЗАЦИЯ ПЕРЕДАЧИ ДАННЫХ...</p>
            <div class="gos-bar-track">
                <div class="gos-bar-fill" style="width: {gosProgress}%"></div>
            </div>
            <p class="gos-progress-sub">
                {#if gosProgress < 30}
                    Проверка серийного номера визора...
                {:else if gosProgress < 60}
                    Резервирование оперативной памяти ({gosProgress}%)...
                {:else if gosProgress < 90}
                    Подключение к федеральному тостеру...
                {:else}
                    Авторизация подтверждена. Добро пожаловать, гражданин.
                {/if}
            </p>
        </div>
    </div>
{/if}
<!-- ===== /1 АПРЕЛЯ ===== -->

<div class="form-container cyber-panel pb-12" style="opacity: {$opacity}">
    <div class="corner top-left"></div>
    <div class="corner top-right"></div>
    <div class="corner bottom-left"></div>
    <div class="corner bottom-right"></div>

    <h2 class="form-title font-display">
        {isResetMode ? $t('auth.recover_title') : $t('auth.login_title')}
    </h2>

    <form on:submit|preventDefault={isResetMode ? handleResetPassword : handleLogin} class="space-y-6" novalidate>

        <div class="form-group">
            <label for="email" class="form-label font-display">{$t('auth.email_label')}</label>
            <input bind:value={email} type="email" id="email" name="email" class="input-field" placeholder="name@example.com">
        </div>

        {#if !isResetMode}
            <div class="form-group" transition:slide>
                <label for="password" class="form-label font-display">{$t('auth.password_label')}</label>
                <input bind:value={password} type="password" id="password" name="password" class="input-field">

                <div class="text-right mt-2">
                    <button type="button" on:click={toggleResetMode} class="text-xs text-cyber-yellow hover:text-white underline transition-colors">
                        {$t('auth.forgot_pass')}
                    </button>
                </div>
            </div>
        {/if}

        <div class="form-group flex justify-center">
            <CyberTurnstile
                siteKey={TURNSTILE_SITE_KEY}
                on:verified={handleTurnstileVerified}
                on:error={handleTurnstileError}
            />
        </div>

        <div class="pt-2">
            <NeonButton type="submit" disabled={loading || googleLoading || !turnstileVerified} extraClass="w-full">
                {#if loading}
                    {$t('ui.loading')}
                {:else}
                    {isResetMode ? $t('auth.recover_btn') : $t('auth.login_btn')}
                {/if}
            </NeonButton>

            {#if isResetMode}
                <button type="button" on:click={toggleResetMode} class="w-full mt-4 text-sm text-gray-500 hover:text-white transition-colors" transition:slide>
                    {$t('auth.back_to_login')}
                </button>
            {/if}
        </div>
    </form>

    {#if !isResetMode}
        <div class="relative my-6" transition:slide>
            <div class="absolute inset-0 flex items-center" aria-hidden="true"><div class="w-full border-t border-gray-700/50"></div></div>
            <div class="relative flex justify-center text-sm"><span class="px-3 bg-gray-900 text-gray-500 uppercase font-display tracking-wider">{$t('auth.or')}</span></div>
        </div>

        <div class="text-center" transition:slide>
            <button on:click={handleGoogleLogin} disabled={googleLoading || loading || !turnstileVerified} type="button" title="Войти с помощью Google" class="google-btn">
                <svg class="w-6 h-6" viewBox="0 0 48 48">
                    <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path>
                    <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path>
                    <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.223,0-9.65-3.657-11.303-8l-6.571,4.819C9.656,39.663,16.318,44,24,44z"></path>
                    <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.574l6.19,5.238C41.38,36.435,44,30.836,44,24C44,22.659,43.862,21.35,43.611,20.083z"></path>
                </svg>
            </button>
        </div>

        <!-- ===== 🎭 КНОПКА ГОСУСЛУГИ (ТОЛЬКО 1 АПРЕЛЯ) ===== -->
        {#if gosuslugiVisible}
            <div class="gos-btn-wrapper" transition:fade={{ duration: 300 }}>
                <button
                    type="button"
                    class="gosuslugi-btn"
                    on:click={handleGosuslugiClick}
                    title="Войти через Госуслуги"
                >
                    🏛️ Войти через ГОСУСЛУГИ
                </button>
                <p class="gos-badge">✅ Одобрено Минцифры</p>
            </div>
        {/if}
        <!-- ===== /1 АПРЕЛЯ ===== -->

        <p class="mt-8 text-center text-sm text-gray-500" transition:slide>
            {$t('auth.no_account')} <a href="/register" class="font-bold text-cyber-yellow hover:text-white">{$t('auth.register_btn')}</a>
        </p>
    {/if}
</div>

<style>
    /* ============================================
       ОРИГИНАЛЬНЫЕ СТИЛИ (без изменений)
    ============================================ */
    .form-container {
        transition: opacity 0.4s ease-in-out;
    }
    .form-container {
        @apply max-w-lg mx-auto my-10 p-8 rounded-none shadow-2xl relative;
        background: rgba(10, 10, 10, 0.5); backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        border: 1px solid rgba(252, 238, 10, 0.2);
        clip-path: polygon(0 15px, 15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%);
    }
    @media (max-width: 640px) { .form-container { @apply my-4 mx-4 p-6; } }

    .form-title { @apply text-2xl lg:text-3xl font-bold text-center text-white mb-10; text-shadow: none; }
    .form-group { }
    .form-label { @apply block text-sm font-bold uppercase tracking-widest text-cyber-yellow mb-2; }
    .input-field {
        @apply block w-full p-2 bg-transparent text-gray-200;
        border: none; border-bottom: 1px solid var(--border-color, #30363d);
        border-radius: 0; font-family: 'Inter', sans-serif;
        font-size: 1.1em; transition: border-color 0.3s, box-shadow 0.3s;
    }
    .input-field:focus { @apply outline-none; border-bottom-color: var(--cyber-yellow, #fcee0a); box-shadow: 0 1px 0 var(--cyber-yellow, #fcee0a); }

    .google-btn {
        @apply inline-flex justify-center items-center w-12 h-12 p-3 border border-gray-700 rounded-full shadow-sm;
        background-color: var(--input-bg-color);
        transition: background-color 0.2s, border-color 0.2s;
    }
    .google-btn:hover:not(:disabled) {
        background-color: var(--secondary-bg-color);
        border-color: var(--border-color);
    }
    .google-btn:disabled { @apply opacity-50 cursor-not-allowed; }

    /* ============================================
       🎭 СТИЛИ 1 АПРЕЛЯ — КНОПКА ГОСУСЛУГИ
    ============================================ */

    /* Обёртка: криво приклеена, чуть повёрнута */
    .gos-btn-wrapper {
        margin-top: 1.5rem;
        text-align: center;
        transform: rotate(-1.8deg) translateX(4px);
        position: relative;
    }

    /* Сама кнопка — вырвиглазная сине-красная, казённый шрифт */
    .gosuslugi-btn {
        display: inline-block;
        padding: 10px 20px;
        font-family: 'Arial', 'Times New Roman', serif; /* намеренно НЕ киберпанк */
        font-size: 0.95rem;
        font-weight: bold;
        letter-spacing: 0.03em;
        color: #ffffff;
        background: linear-gradient(135deg, #003087 45%, #cc0000 55%);
        border: 3px solid #cc0000;
        border-radius: 2px; /* почти квадратная, как в 2005 */
        cursor: pointer;
        /* Wobble — кнопка слегка трясётся, будто прибита степлером */
        animation: gosWobble 3.5s ease-in-out infinite;
        box-shadow: 3px 3px 0 #000, 0 0 12px rgba(204, 0, 0, 0.5);
        position: relative;
        /* Скотч-эффект — псевдоэлемент приклеен сверху */
    }
    .gosuslugi-btn::before {
        content: '';
        position: absolute;
        top: -8px;
        left: 50%;
        transform: translateX(-50%) rotate(2deg);
        width: 60px;
        height: 14px;
        background: rgba(255, 255, 180, 0.45);
        border: 1px solid rgba(200, 200, 100, 0.4);
    }
    .gosuslugi-btn:hover {
        animation: gosWobbleFast 0.4s ease-in-out infinite;
        box-shadow: 3px 3px 0 #000, 0 0 20px rgba(204, 0, 0, 0.8);
    }
    .gosuslugi-btn:active {
        transform: scale(0.97);
    }

    /* "Одобрено Минцифры" — маленькая казённая подпись */
    .gos-badge {
        margin-top: 4px;
        font-family: Arial, sans-serif;
        font-size: 0.65rem;
        color: #4a9a4a;
        letter-spacing: 0.02em;
    }

    @keyframes gosWobble {
        0%   { transform: rotate(-1.8deg) translateX(4px); }
        25%  { transform: rotate(-0.5deg) translateX(2px); }
        50%  { transform: rotate(-2.5deg) translateX(5px); }
        75%  { transform: rotate(-1deg) translateX(3px); }
        100% { transform: rotate(-1.8deg) translateX(4px); }
    }
    @keyframes gosWobbleFast {
        0%   { transform: rotate(-2deg) translateX(3px); }
        50%  { transform: rotate(-1deg) translateX(5px); }
        100% { transform: rotate(-2deg) translateX(3px); }
    }

    /* ============================================
       🎭 СТИЛИ 1 АПРЕЛЯ — ОВЕРЛЕЙ И МОДАЛКИ
    ============================================ */

    /* Полупрозрачный оверлей поверх всего */
    .gos-overlay {
        position: fixed;
        inset: 0;
        z-index: 9999;
        background: rgba(0, 0, 0, 0.75);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
    }

    /* Казённое окно согласия */
    .gos-modal {
        background: #f0f0f0; /* намеренно светлый, контраст с сайтом */
        border: 3px solid #003087;
        max-width: 480px;
        width: 100%;
        font-family: Arial, 'Times New Roman', sans-serif;
        color: #111;
        box-shadow: 8px 8px 0 #000;
    }

    .gos-header {
        background: #003087;
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 14px;
        font-size: 0.8rem;
        font-weight: bold;
        letter-spacing: 0.08em;
        text-transform: uppercase;
    }
    .gos-logo { font-size: 1rem; }

    .gos-body { padding: 20px; }

    .gos-title {
        font-size: 1rem;
        font-weight: bold;
        text-align: center;
        text-transform: uppercase;
        margin-bottom: 4px;
        color: #003087;
    }
    .gos-subtitle {
        font-size: 0.7rem;
        text-align: center;
        color: #666;
        margin-bottom: 14px;
        font-style: italic;
    }

    .gos-list p { font-size: 0.82rem; margin-bottom: 6px; }
    .gos-list ul {
        padding-left: 1.2rem;
        list-style: disc;
        font-size: 0.82rem;
        line-height: 1.7;
    }
    .gos-hint {
        font-size: 0.7rem;
        color: #888;
        font-style: italic;
    }

    .gos-fine-print {
        margin-top: 14px;
        font-size: 0.62rem;
        color: #888;
        line-height: 1.4;
        border-top: 1px solid #ccc;
        padding-top: 10px;
    }

    .gos-buttons {
        display: flex;
        gap: 10px;
        margin-top: 16px;
        justify-content: flex-end;
    }
    .gos-btn-decline {
        padding: 7px 16px;
        font-family: Arial, sans-serif;
        font-size: 0.82rem;
        background: #e0e0e0;
        border: 1px solid #aaa;
        cursor: pointer;
        color: #333;
    }
    .gos-btn-decline:hover { background: #d0d0d0; }

    .gos-btn-accept {
        padding: 7px 20px;
        font-family: Arial, sans-serif;
        font-size: 0.82rem;
        font-weight: bold;
        background: #003087;
        color: #fff;
        border: 1px solid #001a5c;
        cursor: pointer;
    }
    .gos-btn-accept:hover { background: #002070; }

    /* Экран прогресса передачи ОЗУ */
    .gos-progress-box {
        background: #111;
        border: 2px solid #003087;
        padding: 24px 28px;
        max-width: 360px;
        width: 100%;
        font-family: 'Courier New', monospace;
        color: #00cc44;
        box-shadow: 0 0 24px rgba(0, 48, 135, 0.6);
        text-align: center;
    }
    .gos-progress-title {
        font-size: 0.85rem;
        margin-bottom: 16px;
        color: #00cc44;
        letter-spacing: 0.05em;
    }
    .gos-bar-track {
        background: #222;
        border: 1px solid #444;
        height: 18px;
        margin-bottom: 10px;
        overflow: hidden;
    }
    .gos-bar-fill {
        height: 100%;
        background: linear-gradient(90deg, #003087, #00cc44);
        transition: width 0.15s linear;
    }
    .gos-progress-sub {
        font-size: 0.72rem;
        color: #888;
        min-height: 1.2em;
    }
    .gos-scroll-box {
    max-height: 35vh; /* Ограничиваем высоту, чтобы появился скролл */
    overflow-y: auto;
    padding-right: 10px;
    margin-bottom: 1rem;
    border: 1px solid #ccc; /* Канцелярская рамочка */
    background: #f9f9f9;
    padding: 10px;
    border-radius: 4px;
    color: #333;
    font-family: Arial, sans-serif; /* Убиваем кибер-шрифт для реализма */
}

/* Стилизация скроллбара под винду/госуслуги */
.gos-scroll-box::-webkit-scrollbar {
    width: 6px;
}
.gos-scroll-box::-webkit-scrollbar-track {
    background: #e1e1e1;
}
.gos-scroll-box::-webkit-scrollbar-thumb {
    background: #a8a8a8;
    border-radius: 3px;
}

.gos-list {
    list-style-type: none; /* Убираем стандартные точки, у нас эмодзи */
    padding-left: 0;
    margin: 0;
    font-size: 0.85rem;
    line-height: 1.4;
}

.gos-list li {
    margin-bottom: 8px;
    padding-bottom: 8px;
    border-bottom: 1px dashed #ddd; /* Отделяем пункты для "казенности" */
}

.gos-list li:last-child {
    border-bottom: none;
}
</style>