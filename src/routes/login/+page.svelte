<script lang="ts">
    import { auth } from "$lib/firebase";
    import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
    import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
    import { goto } from "$app/navigation";
    import NeonButton from '$lib/components/NeonButton.svelte';
    import { onMount } from 'svelte';
    import { quintOut } from 'svelte/easing';
    import { tweened } from 'svelte/motion';
    import { db } from '$lib/firebase';

    let email = "";
    let password = "";
    let error = "";
    let loading = false;
    let googleLoading = false;

    const opacity = tweened(0, { duration: 400, easing: quintOut });
    onMount(() => {
        opacity.set(1);
    });

    async function handleLogin() {
        if (!email || !password) { error = "Пожалуйста, заполните все поля."; return; }
        loading = true; error = "";
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            console.log("Пользователь вошел:", userCredential.user);
            goto('/');
        } catch (e: any) {
            console.error("Ошибка входа:", e.code);
            if (e.code === 'auth/invalid-credential' || e.code === 'auth/invalid-email' || e.code === 'auth/wrong-password') {
                error = "Неверный email или пароль.";
            } else { error = "Произошла ошибка при входе."; }
        } finally { loading = false; }
    }

    async function handleGoogleLogin() {
        googleLoading = true; error = "";
        const provider = new GoogleAuthProvider();
        try {
            const result = await signInWithPopup(auth, provider);
            const user = result.user;
            const userDocRef = doc(db, "users", user.uid);
            const userDocSnap = await getDoc(userDocRef);
            if (!userDocSnap.exists()) {
                console.log("Новый пользователь Google, создаем запись...");
                await setDoc(userDocRef, {
                    username: user.displayName || `user_${user.uid.substring(0, 6)}`,
                    email: user.email, avatar_url: user.photoURL || "", social_link: "",
                    about_me: "Вошел с помощью Google", createdAt: serverTimestamp()
                });
            }
            goto('/');
        } catch (e: any) { console.error("Ошибка входа через Google:", e); error = "Не удалось войти с помощью Google.";
        } finally { googleLoading = false; }
    }
</script>

<svelte:head>
    <title>Аутентификация | ProtoMap</title>
</svelte:head>

<div class="form-container cyber-panel pb-12" style="opacity: {$opacity}">
    <div class="corner top-left"></div>
    <div class="corner top-right"></div>
    <div class="corner bottom-left"></div>
    <div class="corner bottom-right"></div>

    <h2 class="form-title font-display">АУТЕНТИФИКАЦИЯ</h2>

    <form on:submit|preventDefault={handleLogin} class="space-y-8">
        <div class="form-group">
            <label for="email" class="form-label font-display">EMAIL_ПОЛЬЗОВАТЕЛЯ</label>
            <input bind:value={email} type="email" id="email" name="email" class="input-field" required>
        </div>
        <div class="form-group">
            <label for="password" class="form-label font-display">ПАРОЛЬ</label>
            <input bind:value={password} type="password" id="password" name="password" class="input-field" required>
        </div>

        {#if error}
            <p class="error-message">{error}</p>
        {/if}

        <div class="pt-2">
            <NeonButton type="submit" disabled={loading || googleLoading} extraClass="w-full">
                {loading ? 'Загрузка...' : 'ВОЙТИ'}
            </NeonButton>
        </div>
    </form>

    <div class="relative my-6">
        <div class="absolute inset-0 flex items-center" aria-hidden="true"><div class="w-full border-t border-gray-700/50"></div></div>
        <div class="relative flex justify-center text-sm"><span class="px-3 bg-gray-900 text-gray-500 uppercase font-display tracking-wider">ИЛИ</span></div>
    </div>

    <div class="text-center">
        <button on:click={handleGoogleLogin} disabled={googleLoading || loading} type="button" title="Войти с помощью Google" class="google-btn">
            <svg class="w-6 h-6" viewBox="0 0 48 48">
                <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path>
                <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path>
                <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.223,0-9.65-3.657-11.303-8l-6.571,4.819C9.656,39.663,16.318,44,24,44z"></path>
                <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.574l6.19,5.238C41.38,36.435,44,30.836,44,24C44,22.659,43.862,21.35,43.611,20.083z"></path>
            </svg>
        </button>
    </div>

    <p class="mt-8 text-center text-sm text-gray-500">
        Нет аккаунта? <a href="/register" class="font-bold text-cyber-yellow hover:text-white">Зарегистрируйтесь</a>
    </p>
</div>

<style>
    .form-container {
        transition: opacity 0.4s ease-in-out;
    }
    .form-container {
        @apply max-w-lg mx-auto my-10 p-8 rounded-none shadow-2xl relative;
        background: rgba(10, 10, 10, 0.5); backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        border: 1px solid rgba(252, 238, 10, 0.2); /* Желтая рамка */
        clip-path: polygon(0 15px, 15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%);
    }
    @media (max-width: 640px) { .form-container { @apply my-4 mx-4 p-6; } }

    .form-title { @apply text-2xl lg:text-3xl font-bold text-center text-white mb-10;text-shadow: none; }
    .form-group { /* ... */ }
    .form-label { @apply block text-sm font-bold uppercase tracking-widest text-cyber-yellow mb-2; }
    .input-field {
        @apply block w-full p-2 bg-transparent text-gray-200;
        border: none; border-bottom: 1px solid var(--border-color, #30363d);
        border-radius: 0; font-family: 'Inter', sans-serif;
        font-size: 1.1em; transition: border-color 0.3s, box-shadow 0.3s;
    }
    .input-field:focus { @apply outline-none; border-bottom-color: var(--cyber-yellow, #fcee0a); box-shadow: 0 1px 0 var(--cyber-yellow, #fcee0a); }
    .error-message { @apply mt-4 text-center text-red-400 bg-red-900/50 p-3 rounded-md; }

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
</style>