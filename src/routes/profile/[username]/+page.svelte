<script lang="ts">
    import { userStore } from '$lib/stores';
    import type { ActionData, PageData } from './$types';
    import NeonButton from '$lib/components/NeonButton.svelte';
    import { onMount } from 'svelte';
    import { quintOut } from 'svelte/easing';
    import { tweened } from 'svelte/motion';
    import { modal } from '$lib/stores/modalStore';
    import { fade } from 'svelte/transition';
    import { getFunctions, httpsCallable } from "firebase/functions";
    import { settingsStore } from '$lib/stores/settingsStore';
    import CinematicLoader from '$lib/components/CinematicLoader.svelte';
    import { browser } from '$app/environment';
    import { sendEmailVerification } from "firebase/auth";
    import { auth } from "$lib/firebase";
    import { invalidateAll } from '$app/navigation';
    import { t } from 'svelte-i18n';
    import { get } from 'svelte/store';

    export let data: PageData;
    export let form: ActionData;

    let showCinematicIntro = true;
    let isProfileVisible = false;
    let isSubmitting = false;
    let verificationSent = false;

    const containerOpacity = tweened(0, { duration: 500, easing: quintOut });

    const translate = (key: string, vars = {}) => get(t)(key, vars);

    function getReportReasons() {
        return [
            { id: 'spam', label: translate('profile.reasons.spam'), text: 'Spam' },
            { id: 'inappropriate', label: translate('profile.reasons.inappropriate'), text: 'Inappropriate' },
            { id: 'impersonation', label: translate('profile.reasons.impersonation'), text: 'Impersonation' },
            { id: 'harassment', label: translate('profile.reasons.harassment'), text: 'Harassment' },
            { id: 'other', label: translate('profile.reasons.other'), text: 'Other' }
        ];
    }

    onMount(() => {
        if (browser) {
            const cinematicEnabled = $settingsStore.cinematicLoadsEnabled;
            const sessionKey = `viewed_profile_${data.profile.username}`;
            const alreadyViewed = sessionStorage.getItem(sessionKey);

            if (cinematicEnabled && !alreadyViewed) {
                showCinematicIntro = true;
                sessionStorage.setItem(sessionKey, 'true');
            } else {
                showCinematicIntro = false;
                isProfileVisible = true;
                containerOpacity.set(1);
            }
        }
    });

    function handleIntroFinished() {
        showCinematicIntro = false;
        setTimeout(() => {
            isProfileVisible = true;
            containerOpacity.set(1);
        }, 500);
    }

    $: isOwner = $userStore.user && $userStore.user.uid === data.profile.uid;
    $: socials = data.profile.socials || {};
    $: hasSocials = Object.values(socials).some(link => !!link);

    async function sendVerification() {
        if (!auth.currentUser) return;

        try {
            await sendEmailVerification(auth.currentUser);
            verificationSent = true;
            modal.success(translate('ui.success'), translate('auth.check_email', { email: auth.currentUser.email })); // (надо добавить этот ключ в auth, или просто захардкодить временно "Email sent")
        } catch (e: any) {
            if (e.code === 'auth/too-many-requests') {
                modal.warning(translate('ui.error'), "Too many requests.");
            } else {
                modal.error(translate('ui.error'), e.message);
            }
        }
    }

    async function checkVerificationStatus() {
        if (!auth.currentUser) return;
        await auth.currentUser.reload();
        await auth.currentUser.getIdToken(true);
        window.location.reload();
    }

    async function handleAddComment() {
        if (!commentText.trim() || isSubmitting) return;

        isSubmitting = true;
        try {
            const functions = getFunctions();
            const addCommentFunc = httpsCallable(functions, 'addComment');

            await addCommentFunc({
                profileUid: data.profile.uid,
                text: commentText
            });

            commentText = '';
            await invalidateAll();

        } catch (error: any) {
            modal.error(translate('ui.error'), error.message || "Failed to add comment.");
        } finally {
            isSubmitting = false;
        }
    }

    async function handleDeleteComment(commentId: string) {
        modal.confirm(
            translate('ui.delete'),
            translate('ui.confirm_delete'),
            async () => {
                try {
                    const functions = getFunctions();
                    const deleteCommentFunc = httpsCallable(functions, 'deleteComment');

                    await deleteCommentFunc({
                        profileUid: data.profile.uid,
                        commentId: commentId
                    });

                    modal.success(translate('ui.success'), "Deleted.");

                } catch (error: any) {
                    modal.error(translate('ui.error'), error.message);
                }
            }
        );
    }

    async function handleReportProfile() {
        if (!$userStore.user) {
            modal.warning(translate('ui.error'), translate('profile.login_req'));
            return;
        }
        const reasons = getReportReasons();

        const messageText = `${translate('profile.report_profile_text')} <strong>${data.profile.username}</strong>.`;

        modal.report(
            translate('profile.report_profile_title'),
            messageText,
            reasons,
            async (selectedReasonId) => {
                const reasonObject = reasons.find(r => r.id === selectedReasonId);
                if (!reasonObject) return;
                try {
                    const functions = getFunctions();
                    const reportContentFunc = httpsCallable(functions, 'reportContent');
                    modal.info(translate('ui.loading'), translate('profile.sending'));
                    await reportContentFunc({ type: 'profile', reportedContentId: data.profile.uid, profileOwnerUid: data.profile.uid, reason: reasonObject.text, reportedUsername: data.profile.username, reporterUsername: $userStore.user?.username || 'unknown'});
                    modal.success(translate('profile.report_success'), translate('profile.report_success_text'));
                } catch (error: any) { modal.error(translate('ui.error'), error.message); }
            }
        );
    }

    async function handleReportComment(commentId: string, commentAuthorUsername: string) {
        if (!$userStore.user) {
            modal.warning(translate('ui.error'), translate('profile.login_req'));
            return;
        }
        const reasons = getReportReasons();
        const messageText = `${translate('profile.report_comment_text')} <strong>${commentAuthorUsername}</strong>.`;

        modal.report(
            translate('profile.report_comment_title'),
            messageText,
            reasons,
            async (selectedReasonId) => {
                const reasonObject = reasons.find(r => r.id === selectedReasonId);
                if (!reasonObject) return;
                try {
                    const functions = getFunctions();
                    const reportContentFunc = httpsCallable(functions, 'reportContent');
                    modal.info(translate('ui.loading'), translate('profile.sending'));
                    await reportContentFunc({ type: 'comment', reportedContentId: commentId, profileOwnerUid: data.profile.uid, reason: reasonObject.text, profileOwnerUsername: data.profile.username, reportedUsername: commentAuthorUsername, reporterUsername: $userStore.user?.username || 'unknown' });
                    modal.success(translate('profile.report_success'), translate('profile.report_success_text'));
                } catch (error: any) { modal.error(translate('ui.error'), error.message); }
            }
        );
    }

    function copyDiscordTag() {
        const tag = socials.discord;
        if (tag) {
            navigator.clipboard.writeText(tag).then(() => {
                modal.success(translate('profile.copy_success'), translate('profile.copy_text', { tag }));
            }, () => {
                modal.error(translate('ui.error'), "Copy failed.");
            });
        }
    }

    let commentText = '';
    $: if (form?.addCommentSuccess) {
        commentText = '';
    }

    function formatTimeAgo(date: Date): string {
        if (!date || !(date instanceof Date)) return '';
        const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

        if (seconds < 60) return translate('profile.time.just_now');

        const intervals: {[key: string]: number} = {
            'y': 31536000,
            'm': 2592000,
            'd': 86400,
            'h': 3600,
            'min': 60
        };

        for (const [unit, secondsInUnit] of Object.entries(intervals)) {
            const interval = seconds / secondsInUnit;
            if (interval > 1) {
                const unitText = translate(`profile.time.${unit}`);
                return `${Math.floor(interval)} ${unitText} ${translate('profile.time.ago')}`;
            }
        }
        return translate('profile.time.just_now');
    }
</script>

<svelte:head>
    <title>{$t('profile.page_title')} {data.profile.username} | ProtoMap</title>
</svelte:head>

{#if showCinematicIntro}
    <CinematicLoader
        username={data.profile.username}
        on:finished={handleIntroFinished}
    />
{/if}

{#if isProfileVisible}
    <div class="hidden neon-blue-frame glitch-frame high-roller-frame frame_biohazard frame_plasma frame_stealth frame_dev frame_beta"></div>

    <div class="container mx-auto px-4" transition:fade={{ duration: 300 }}>
        {#if data.profile.equipped_bg}
        <div class="profile-backdrop {data.profile.equipped_bg}"></div>
    {/if}

    <div class="profile-container cyber-panel pb-12 {data.profile.equipped_bg ? 'themed ' + data.profile.equipped_bg + '-theme' : ''}" style="opacity: {$containerOpacity}">

            {#if $userStore.user && !isOwner}
                <button on:click={handleReportProfile} class="report-icon-btn" title={$t('profile.report_btn')}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                </button>
            {/if}

            <div class="corner-bg top-left"></div>
            <div class="corner-bg top-right"></div>
            <div class="corner-bg bottom-left"></div>
            <div class="corner-bg bottom-right"></div>

            <div class="top-bar">
                <span class="pl-6">{$t('profile.user_id')}: {data.profile.uid.substring(0, 18).toUpperCase()}...</span>
            </div>

            <div class="profile-header">
                <div class="avatar-wrapper {data.profile.equipped_frame || ''}">
                    <img
                        src={data.profile.avatar_url || `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${data.profile.username}`}
                        alt="Avatar"
                        class="profile-avatar"
                    />
                </div>
                <h2 class="profile-username font-display">{data.profile.username}</h2>
            </div>

            <div class="profile-content">
                {#if isOwner && $userStore.user}
                    <div class="profile-section private-section">
                        <h4 class="font-display flex items-center gap-2 text-gray-400">
                            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                        </h4>

                        <div class="email-control">
                            <div class="email-text">
                                <span class="text-gray-500 text-xs font-bold tracking-wider">{$t('profile.email')}:</span>
                                <span class="text-white font-mono ml-2">{$userStore.user.email}</span>
                            </div>

                            {#if $userStore.user.emailVerified}
                                <div class="verified-badge">
                                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
                                    {$t('profile.verified')}

                                    <div class="verified-tooltip">
                                        <p class="font-bold text-green-400 mb-1">// {$t('profile.verified_tooltip_title')}</p>
                                        {$t('profile.verified_tooltip_text')}
                                    </div>
                                </div>
                            {:else}
                                <button class="unverified-btn" on:click={sendVerification} disabled={verificationSent}>
                                    {verificationSent ? $t('profile.sent_btn') : $t('profile.unverified_btn')}
                                </button>
                                <button class="text-xs text-gray-500 underline ml-2" on:click={checkVerificationStatus}>
                                    {$t('profile.check_btn')}
                                </button>
                            {/if}
                        </div>
                    </div>
                {/if}

                {#if hasSocials}
                    <div class="profile-section">
                        <h4 class="font-display">// {$t('profile.channels')}</h4>
                        <div class="text-center">
                            <div class="social-links-grid">
                                {#if socials.telegram}
                            <a href={`https://t.me/${socials.telegram}`} target="_blank" rel="noopener noreferrer" class="social-link-btn" title="Telegram">
                                <svg viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" preserveAspectRatio="xMidYMid"> <g fill-rule="evenodd"> <path d="M128,0 C57.307,0 0,57.307 0,128 C0,198.693 57.307,256 128,256 C198.693,256 256,198.693 256,128 C256,57.307 198.693,0 128,0 Z" fill="#40B3E0"></path> <path d="M190.2826,73.6308 L167.4206,188.8978 C167.4206,188.8978 164.2236,196.8918 155.4306,193.0548 L102.6726,152.6068 L83.4886,143.3348 L51.1946,132.4628 C51.1946,132.4628 46.2386,130.7048 45.7586,126.8678 C45.2796,123.0308 51.3546,120.9528 51.3546,120.9528 L179.7306,70.5928 C179.7306,70.5928 190.2826,65.9568 190.2826,73.6308" fill="#FFFFFF"></path> <path d="M98.6178,187.6035 C98.6178,187.6035 97.0778,187.4595 95.1588,181.3835 C93.2408,175.3085 83.4888,143.3345 83.4888,143.3345 L161.0258,94.0945 C161.0258,94.0945 165.5028,91.3765 165.3428,94.0945 C165.3428,94.0945 166.1418,94.5735 163.7438,96.8115 C161.3458,99.0505 102.8328,151.6475 102.8328,151.6475" fill="#D2E5F1"></path> <path d="M122.9015,168.1154 L102.0335,187.1414 C102.0335,187.1414 100.4025,188.3794 98.6175,187.6034 L102.6135,152.2624" fill="#B5CFE4"></path> </g> </svg>
                            </a>
                        {/if}
                        {#if socials.discord}
                            <button type="button" on:click={copyDiscordTag} class="social-link-btn" title={$t('profile.copy_text', {tag: ''})}>
                                <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"> <circle cx="512" cy="512" r="512" style="fill:#5865f2"/> <path d="M689.43 349a422.21 422.21 0 0 0-104.22-32.32 1.58 1.58 0 0 0-1.68.79 294.11 294.11 0 0 0-13 26.66 389.78 389.78 0 0 0-117.05 0 269.75 269.75 0 0 0-13.18-26.66 1.64 1.64 0 0 0-1.68-.79A421 421 0 0 0 334.44 349a1.49 1.49 0 0 0-.69.59c-66.37 99.17-84.55 195.9-75.63 291.41a1.76 1.76 0 0 0 .67 1.2 424.58 424.58 0 0 0 127.85 64.63 1.66 1.66 0 0 0 1.8-.59 303.45 303.45 0 0 0 26.15-42.54 1.62 1.62 0 0 0-.89-2.25 279.6 279.6 0 0 1-39.94-19 1.64 1.64 0 0 1-.16-2.72c2.68-2 5.37-4.1 7.93-6.22a1.58 1.58 0 0 1 1.65-.22c83.79 38.26 174.51 38.26 257.31 0a1.58 1.58 0 0 1 1.68.2c2.56 2.11 5.25 4.23 8 6.24a1.64 1.64 0 0 1-.14 2.72 262.37 262.37 0 0 1-40 19 1.63 1.63 0 0 0-.87 2.28 340.72 340.72 0 0 0 26.13 42.52 1.62 1.62 0 0 0 1.8.61 423.17 423.17 0 0 0 128-64.63 1.64 1.64 0 0 0 .67-1.18c10.68-110.44-17.88-206.38-75.7-291.42a1.3 1.3 0 0 0-.63-.63zM427.09 582.85c-25.23 0-46-23.16-46-51.6s20.38-51.6 46-51.6c25.83 0 46.42 23.36 46 51.6.02 28.44-20.37 51.6-46 51.6zm170.13 0c-25.23 0-46-23.16-46-51.6s20.38-51.6 46-51.6c25.83 0 46.42 23.36 46 51.6.01 28.44-20.17 51.6-46 51.6z" style="fill:#fff"/></svg>
                            </button>
                        {/if}
                        {#if socials.vk}
                            <a href={`https://vk.com/${socials.vk}`} target="_blank" rel="noopener noreferrer" class="social-link-btn" title="VK">
                                <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"> <circle cx="512" cy="512" r="512" style="fill:#2787f5"/> <path d="M585.83 271.5H438.17c-134.76 0-166.67 31.91-166.67 166.67v147.66c0 134.76 31.91 166.67 166.67 166.67h147.66c134.76 0 166.67-31.91 166.67-166.67V438.17c0-134.76-32.25-166.67-166.67-166.67zm74 343.18h-35c-13.24 0-17.31-10.52-41.07-34.62-20.71-20-29.87-22.74-35-22.74-7.13 0-9.17 2-9.17 11.88v31.57c0 8.49-2.72 13.58-25.12 13.58-37 0-78.07-22.4-106.93-64.16-43.45-61.1-55.33-106.93-55.33-116.43 0-5.09 2-9.84 11.88-9.84h35c8.83 0 12.22 4.07 15.61 13.58 17.31 49.9 46.17 93.69 58 93.69 4.41 0 6.45-2 6.45-13.24v-51.6c-1.36-23.76-13.92-25.8-13.92-34.28 0-4.07 3.39-8.15 8.83-8.15h55c7.47 0 10.18 4.07 10.18 12.9v69.58c0 7.47 3.39 10.18 5.43 10.18 4.41 0 8.15-2.72 16.29-10.86 25.12-28.17 43.11-71.62 43.11-71.62 2.38-5.09 6.45-9.84 15.28-9.84h35c10.52 0 12.9 5.43 10.52 12.9-4.41 20.37-47.18 80.79-47.18 80.79-3.73 6.11-5.09 8.83 0 15.61 3.73 5.09 16 15.61 24.1 25.12 14.94 17 26.48 31.23 29.53 41.07 3.45 9.84-1.65 14.93-11.49 14.93z" style="fill:#fff"/> </svg>
                            </a>
                        {/if}
                        {#if socials.twitter}
                            <a href={`https://x.com/${socials.twitter}`} target="_blank" rel="noopener noreferrer" class="social-link-btn" title="X (Twitter)">
                                <svg viewBox="0 0 201 201" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M200.448 100.651C200.448 151.17 163.011 192.936 114.377 199.713C109.83 200.344 105.177 200.674 100.455 200.674C95.0035 200.674 89.6504 200.239 84.4373 199.398C36.8266 191.73 0.461731 150.435 0.461731 100.651C0.461731 45.4078 45.2347 0.621582 100.462 0.621582C155.689 0.621582 200.462 45.4078 200.462 100.651H200.448Z" fill="#1C1C1B"/><path d="M41.0167 44.7349L87.1349 106.412L40.7294 156.56H51.1765L91.8085 112.657L124.635 156.56H160.18L111.469 91.4134L154.666 44.7349H144.219L106.803 85.1686L76.5688 44.7349H41.0236H41.0167ZM56.3754 52.4305H72.7011L144.807 148.864H128.482L56.3754 52.4305Z" fill="white"/></svg>
                            </a>
                        {/if}
                        {#if socials.website}
                            <a href={socials.website} target="_blank" rel="noopener noreferrer" class="social-link-btn" title="Site">
                                <svg version="1.0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920.000000 1920.000000" preserveAspectRatio="xMidYMid meet"> <g transform="translate(0.000000,1920.000000) scale(0.100000,-0.100000)" fill="#ffffff" stroke="none"> <path d="M9200 19194 c-14 -2 -117 -8 -230 -13 -559 -26 -1261 -143 -1900 -315 -204 -55 -249 -69 -495 -151 -263 -87 -280 -93 -550 -200 -386 -153 -978 -441 -1215 -590 -22 -14 -42 -25 -45 -25 -10 0 -314 -189 -475 -295 -262 -173 -556 -389 -760 -559 -47 -38 -110 -90 -140 -115 -30 -24 -62 -51 -70 -60 -8 -9 -67 -62 -131 -118 -450 -394 -911 -899 -1300 -1424 -34 -46 -81 -109 -103 -139 -69 -94 -277 -409 -360 -545 -43 -72 -88 -146 -101 -165 -56 -89 -180 -317 -298 -550 -163 -324 -270 -567 -433 -985 -32 -83 -190 -559 -209 -630 -7 -27 -27 -102 -45 -165 -169 -613 -287 -1309 -323 -1910 -15 -250 -15 -1029 0 -1275 25 -402 110 -1015 184 -1329 11 -44 19 -88 19 -99 0 -10 8 -49 19 -85 10 -37 28 -110 41 -162 12 -52 30 -124 40 -160 10 -36 28 -101 40 -145 62 -226 163 -529 265 -800 15 -38 32 -83 37 -100 6 -16 14 -34 18 -40 3 -5 15 -32 25 -60 24 -65 192 -449 240 -545 86 -175 102 -208 130 -260 25 -49 193 -352 215 -390 217 -372 385 -624 663 -997 93 -125 375 -472 426 -524 9 -9 57 -61 106 -115 248 -272 308 -333 552 -559 271 -252 374 -341 568 -493 55 -43 109 -85 120 -95 53 -44 245 -185 360 -263 39 -27 72 -51 75 -54 19 -23 639 -411 685 -429 5 -2 64 -34 130 -71 241 -134 318 -173 690 -344 28 -13 70 -33 95 -44 25 -11 92 -39 150 -62 58 -23 119 -48 135 -55 321 -139 976 -342 1430 -444 363 -82 822 -158 1095 -181 63 -6 151 -15 195 -21 155 -20 815 -37 1100 -28 435 13 537 21 935 69 365 45 788 124 1130 212 63 17 138 36 167 43 28 7 73 19 100 28 26 8 84 25 128 37 145 41 649 211 710 240 11 5 56 23 100 40 44 17 89 35 100 40 11 5 61 26 110 46 50 20 122 51 160 69 39 18 143 67 232 109 90 41 232 112 315 157 84 45 180 96 213 114 84 44 343 199 510 305 430 274 954 674 1275 976 291 274 349 330 456 444 64 69 147 157 184 195 134 139 361 412 552 664 107 140 121 160 177 238 51 71 254 373 278 413 11 19 38 62 58 95 75 120 188 312 225 380 20 39 74 139 119 223 45 83 116 225 157 315 42 89 91 194 109 232 18 39 49 111 69 160 20 50 41 99 46 110 5 11 23 56 40 100 17 44 35 89 40 100 6 11 19 45 29 75 11 30 44 125 74 211 54 151 125 381 181 579 15 52 31 109 36 125 36 125 125 529 160 725 59 340 79 484 115 838 35 342 46 798 29 1262 -7 206 -18 411 -23 455 -6 44 -15 132 -21 195 -32 375 -158 1060 -257 1400 -9 30 -19 71 -23 90 -20 99 -159 538 -243 770 -56 153 -185 476 -228 568 -17 37 -56 123 -87 192 -70 156 -210 431 -295 581 -35 63 -66 119 -68 124 -22 59 -352 578 -488 770 -27 39 -66 93 -85 120 -66 92 -302 399 -333 432 -12 12 -58 67 -101 120 -44 54 -88 107 -98 118 -11 11 -89 96 -174 189 -237 259 -368 388 -710 698 -285 256 -645 534 -1035 795 -146 98 -382 245 -487 303 -15 8 -82 46 -150 84 -156 88 -300 165 -408 217 -47 23 -107 52 -135 66 -71 36 -396 179 -485 214 -41 17 -89 37 -107 45 -80 37 -521 191 -713 250 -212 65 -377 110 -520 144 -52 13 -125 31 -162 41 -36 11 -75 19 -85 19 -11 0 -55 8 -99 19 -306 72 -938 161 -1304 182 -160 10 -1016 20 -1060 13z m4960 -3476 c226 -41 413 -104 602 -206 170 -91 280 -173 433 -327 158 -158 246 -275 334 -445 132 -254 191 -469 212 -765 6 -100 9 -1587 6 -4495 l-3 -4345 -21 -110 c-41 -218 -80 -337 -168 -520 -268 -555 -772 -923 -1415 -1032 -99 -17 -337 -18 -4440 -21 -2929 -2 -4383 0 -4482 7 -182 13 -326 41 -482 92 -555 182 -1003 630 -1186 1187 -52 159 -78 295 -91 471 -7 98 -9 1576 -7 4496 l3 4350 24 125 c72 389 231 709 485 977 243 257 549 438 883 521 101 26 172 38 328 56 17 2 2024 3 4460 2 4110 -1 4437 -3 4525 -18z"/> <path d="M5055 15644 c-272 -41 -512 -134 -735 -282 -392 -262 -652 -653 -758 -1142 l-27 -125 0 -4490 0 -4490 23 -118 c150 -780 781 -1367 1567 -1457 60 -6 1535 -10 4480 -10 4781 0 4479 -3 4714 56 635 159 1140 667 1300 1309 54 217 51 -62 51 4703 0 4766 3 4485 -54 4709 -35 138 -69 230 -136 366 -256 513 -747 872 -1325 967 -118 20 -186 20 -4565 19 -3722 -1 -4460 -3 -4535 -15z m4885 -184 c0 -6 -372 -505 -826 -1110 l-826 -1100 -2277 2 -2276 3 -3 280 c-3 315 8 527 37 666 143 689 730 1205 1431 1258 163 13 4740 13 4740 1z m4037 0 c722 -56 1295 -555 1456 -1270 19 -87 21 -130 25 -517 l3 -423 -3451 0 c-2758 0 -3450 3 -3443 13 4 6 158 215 343 462 1052 1409 1294 1731 1304 1737 17 11 3620 9 3763 -2z m1483 -6349 c0 -3899 0 -3940 -20 -4056 -57 -333 -219 -636 -471 -880 -218 -212 -476 -348 -792 -417 l-102 -23 -4475 0 -4475 0 -109 23 c-148 32 -240 64 -383 132 -135 65 -212 114 -323 206 -293 243 -477 558 -552 948 l-22 111 -3 3935 c-2 2164 -1 3940 1 3947 4 11 1132 13 5866 13 l5860 0 0 -3939z"/> <path d="M5160 15383 c-19 -2 -79 -12 -134 -23 -536 -107 -985 -509 -1146 -1027 -58 -188 -63 -232 -68 -630 l-4 -373 2225 0 2225 0 762 1018 c420 559 767 1023 773 1030 7 9 -453 12 -2294 10 -1267 0 -2320 -3 -2339 -5z m512 -853 c58 -17 96 -54 113 -115 24 -82 -6 -165 -75 -204 -38 -21 -41 -21 -657 -19 l-618 3 -34 24 c-65 46 -87 140 -52 216 23 50 56 81 101 93 49 14 1173 15 1222 2z m1995 -12 c57 -32 78 -73 78 -155 0 -77 -13 -106 -69 -147 -27 -21 -39 -21 -642 -24 -603 -2 -615 -2 -654 18 -95 49 -120 187 -47 266 60 65 49 64 707 61 543 -2 598 -4 627 -19z"/> <path d="M4435 14434 c-36 -39 -35 -111 1 -145 l26 -24 605 0 605 0 24 28 c40 47 28 133 -23 156 -17 8 -204 11 -619 11 l-595 0 -24 -26z"/> <path d="M6395 14435 c-36 -35 -35 -112 1 -146 l26 -24 605 0 605 0 24 30 c35 44 33 98 -5 136 l-29 29 -602 0 -601 0 -24 -25z"/> <path d="M9505 14393 c-412 -549 -759 -1013 -773 -1030 l-24 -33 3342 0 3342 0 -5 368 c-4 323 -7 379 -26 466 -67 320 -215 584 -452 811 -198 188 -439 316 -724 383 l-110 26 -1911 3 -1911 3 -748 -997z m2505 790 c384 -76 660 -421 660 -826 0 -509 -473 -908 -980 -826 -315 50 -578 280 -668 584 -117 394 64 821 423 999 107 53 165 69 320 90 45 6 161 -4 245 -21z m2065 16 c611 -75 947 -739 639 -1264 -59 -100 -182 -224 -287 -289 -320 -199 -748 -156 -1020 103 -319 303 -350 802 -72 1148 93 116 232 214 371 261 63 22 162 40 264 50 8 1 56 -3 105 -9z"/> <path d="M11665 15114 c-374 -83 -622 -411 -602 -795 35 -665 843 -969 1309 -493 153 157 221 325 220 544 0 182 -54 334 -170 483 -84 107 -250 213 -397 253 -87 23 -273 27 -360 8z m270 -209 c108 -23 189 -68 275 -155 118 -117 170 -237 170 -390 0 -148 -55 -275 -165 -385 -258 -259 -660 -209 -863 109 -39 61 -67 148 -77 236 -22 211 114 443 316 540 123 58 220 71 344 45z"/> <path d="M11688 14821 c-77 -25 -143 -69 -210 -139 -98 -102 -133 -202 -126 -349 5 -83 10 -102 43 -171 88 -178 282 -295 461 -279 211 20 385 169 438 373 28 107 15 211 -40 320 -102 204 -354 312 -566 245z"/> <path d="M13825 15113 c-561 -119 -795 -798 -430 -1243 58 -70 72 -84 144 -135 210 -151 521 -182 757 -75 402 181 574 654 379 1041 -159 316 -509 485 -850 412z m270 -208 c107 -23 189 -68 276 -155 117 -115 161 -223 161 -390 0 -112 -23 -194 -77 -285 -45 -75 -74 -106 -150 -160 -226 -161 -514 -137 -711 60 -246 246 -207 651 83 845 132 88 269 116 418 85z"/> <path d="M13847 14820 c-122 -39 -237 -140 -295 -260 -37 -74 -37 -76 -37 -200 0 -123 1 -126 37 -203 103 -218 360 -326 585 -247 277 97 403 415 269 678 -100 195 -350 299 -559 232z"/> <path d="M3813 9043 l3 -3928 21 -95 c93 -413 309 -735 643 -958 219 -145 459 -230 716 -252 92 -8 1375 -10 4489 -8 4018 4 4366 5 4440 21 341 70 594 205 825 437 207 208 340 456 412 766 l23 99 2 3923 3 3922 -5790 0 -5790 0 3 -3927z m10287 3629 c134 -55 229 -157 270 -288 20 -65 20 -86 20 -1369 0 -1251 -1 -1306 -19 -1364 -46 -149 -168 -267 -316 -305 -53 -14 -515 -16 -4456 -16 -4279 0 -4399 1 -4458 19 -33 10 -80 30 -103 44 -61 36 -140 123 -180 198 l-33 64 -3 1339 c-2 1223 -1 1344 14 1390 25 76 58 127 122 188 64 61 100 83 182 109 52 17 264 18 4480 16 l4425 -2 55 -23z m-4240 -3802 c559 -70 1084 -352 1432 -772 220 -265 369 -556 453 -884 220 -858 -111 -1792 -820 -2314 -316 -232 -666 -374 -1049 -425 -173 -23 -489 -17 -656 13 -977 177 -1702 948 -1821 1937 -17 142 -14 387 6 540 40 312 151 621 317 885 218 345 527 623 893 805 215 106 415 169 648 205 141 21 461 26 597 10z"/> <path d="M5185 12616 c-116 -29 -207 -101 -258 -205 l-32 -66 0 -1330 0 -1330 27 -55 c36 -74 87 -132 149 -169 105 -66 -256 -61 4534 -61 3909 0 4367 2 4420 16 116 30 207 105 259 214 l31 65 0 1320 0 1320 -33 67 c-54 111 -141 182 -257 212 -53 14 -510 16 -4425 15 -3435 -1 -4376 -3 -4415 -13z m8848 -226 c21 -14 46 -43 57 -66 20 -40 20 -64 20 -1309 0 -1245 0 -1269 -20 -1309 -11 -23 -36 -52 -57 -66 l-37 -25 -4380 -3 -4380 -2 -43 21 c-23 11 -53 35 -65 52 l-23 32 -2 1290 -3 1290 23 40 c14 26 37 48 67 63 l44 22 4381 -2 4381 -3 37 -25z"/> <path d="M5248 12342 c-15 -2 -38 -17 -53 -33 l-25 -31 0 -1268 0 -1268 35 -31 36 -31 4369 2 4370 3 27 28 28 27 3 1259 c1 793 -1 1269 -7 1285 -6 14 -21 32 -34 40 -21 14 -459 16 -4373 19 -2392 1 -4361 1 -4376 -1z m1791 -700 c19 -9 47 -33 61 -52 15 -19 91 -190 170 -380 78 -190 145 -348 149 -352 3 -4 87 142 186 324 193 356 232 411 298 423 122 23 227 -58 227 -175 0 -49 -14 -78 -243 -505 -82 -154 -166 -311 -187 -350 -20 -38 -60 -114 -89 -167 -76 -142 -129 -179 -233 -165 -32 4 -51 16 -83 49 -36 37 -61 88 -175 358 -73 173 -136 319 -140 323 -7 8 -22 -26 -170 -393 -50 -124 -94 -235 -99 -246 -24 -56 -128 -101 -192 -84 -84 23 -95 37 -234 315 -355 708 -409 823 -408 874 0 26 8 61 16 77 35 68 144 110 220 85 20 -7 51 -29 69 -49 19 -22 98 -170 188 -354 85 -175 158 -314 161 -310 4 4 69 160 144 346 75 187 144 350 152 362 20 32 91 64 138 64 22 0 55 -8 74 -18z m2544 4 c18 -7 42 -25 55 -38 13 -14 86 -176 163 -359 78 -184 147 -350 155 -369 l15 -34 118 219 c65 121 148 276 185 345 95 178 139 212 250 196 60 -9 107 -42 134 -96 38 -75 31 -103 -62 -283 -342 -661 -469 -894 -505 -929 -69 -66 -151 -71 -227 -13 -43 33 -51 50 -181 358 -146 349 -145 347 -152 347 -3 0 -66 -150 -139 -334 -80 -200 -142 -342 -155 -354 -34 -32 -91 -52 -145 -52 -59 0 -120 39 -152 97 -12 21 -133 266 -270 545 -274 556 -275 558 -227 629 65 96 215 118 279 40 13 -15 97 -175 188 -354 91 -179 168 -322 171 -319 3 4 64 155 135 337 71 181 138 343 149 360 44 65 143 93 218 61z m2611 -38 c34 -38 66 -106 185 -394 79 -192 147 -352 150 -356 4 -4 71 110 151 255 234 427 239 436 276 463 89 68 234 23 276 -85 14 -38 12 -106 -5 -138 -8 -16 -30 -57 -50 -93 -19 -36 -139 -261 -267 -500 -127 -239 -245 -450 -263 -467 -38 -41 -85 -57 -149 -51 -83 8 -113 47 -204 267 -43 102 -105 252 -139 333 -34 81 -63 150 -66 152 -3 3 -65 -145 -138 -329 -118 -296 -138 -339 -171 -369 -50 -45 -98 -60 -146 -47 -48 13 -96 47 -122 85 -11 17 -134 261 -271 542 -220 447 -251 517 -251 558 0 54 16 90 57 127 56 52 142 63 208 26 38 -21 50 -41 208 -357 93 -184 172 -336 176 -338 4 -1 15 14 23 35 279 695 276 688 343 719 19 9 53 13 89 11 56 -3 62 -6 100 -49z"/> <path d="M6901 11563 c-24 -22 -64 -113 -191 -433 -88 -223 -164 -413 -168 -423 -5 -13 -60 90 -201 380 -197 404 -226 453 -276 453 -63 0 -115 -48 -115 -107 0 -14 116 -261 258 -548 274 -552 282 -565 349 -565 17 0 42 11 61 28 28 23 54 80 175 387 l143 360 35 3 35 3 158 -368 c87 -202 167 -378 178 -390 30 -32 71 -38 114 -16 27 13 46 36 74 88 20 39 146 272 279 519 133 247 245 461 248 476 10 52 -40 117 -98 126 -68 11 -91 -18 -232 -281 -294 -549 -310 -577 -317 -564 -4 8 -85 201 -180 429 -185 449 -197 470 -265 470 -24 0 -44 -9 -64 -27z"/> <path d="M9463 11580 c-12 -5 -26 -17 -32 -28 -5 -10 -83 -200 -171 -423 -89 -222 -166 -411 -170 -418 -5 -10 -71 111 -205 380 -108 216 -206 404 -217 416 -29 31 -70 38 -110 19 -34 -17 -68 -61 -68 -90 0 -8 119 -254 265 -546 292 -585 287 -577 370 -565 22 3 47 12 55 20 8 8 82 185 165 393 l150 377 33 0 33 0 103 -240 c56 -132 128 -302 160 -377 49 -115 64 -141 91 -158 39 -24 66 -25 104 -5 33 16 24 1 355 632 248 474 249 477 197 535 -25 28 -36 33 -75 33 -37 0 -51 -5 -75 -30 -16 -16 -120 -201 -232 -410 -111 -209 -208 -388 -214 -398 -11 -16 -25 11 -105 200 -243 571 -282 659 -294 671 -17 17 -84 25 -113 12z"/> <path d="M12028 11574 c-36 -19 -40 -28 -156 -325 -193 -495 -215 -550 -225 -546 -5 1 -96 180 -202 397 -124 254 -202 402 -219 417 -33 28 -71 29 -113 3 -40 -24 -57 -55 -50 -94 3 -17 120 -264 261 -548 222 -451 260 -520 288 -538 18 -11 45 -20 60 -20 59 0 78 34 221 400 75 190 141 357 146 373 8 21 17 27 40 27 15 0 33 -6 38 -12 6 -7 42 -89 81 -183 140 -335 219 -521 236 -552 24 -47 69 -68 116 -54 21 6 42 17 48 24 5 6 136 247 291 533 169 315 281 532 281 548 0 79 -81 133 -153 103 -32 -14 -52 -48 -256 -423 -123 -225 -226 -412 -230 -417 -4 -4 -39 70 -79 165 -39 95 -92 223 -117 283 -26 61 -73 175 -106 255 -78 192 -119 229 -201 184z"/> <path d="M9331 8794 c-364 -44 -709 -183 -1011 -408 -112 -83 -298 -261 -382 -365 -365 -453 -530 -1021 -463 -1593 112 -955 818 -1698 1778 -1870 166 -30 485 -32 662 -4 474 73 915 305 1243 651 507 535 700 1310 507 2029 -74 272 -207 541 -373 751 -74 93 -229 252 -322 329 -454 379 -1044 552 -1639 480z m376 -230 c130 -63 274 -284 371 -569 49 -146 127 -454 117 -464 -2 -2 -73 3 -157 10 -86 8 -278 14 -438 14 -160 0 -352 -6 -438 -14 -84 -7 -156 -11 -159 -7 -11 10 46 249 92 391 123 379 281 610 455 666 37 12 98 2 157 -27z m-621 -70 c17 -25 16 -28 -49 -157 -37 -73 -82 -172 -101 -222 -44 -115 -110 -358 -136 -500 -11 -60 -23 -112 -28 -116 -4 -5 -75 -21 -158 -38 -264 -52 -546 -147 -732 -247 -79 -43 -83 -44 -107 -28 -14 9 -25 23 -25 31 0 26 72 208 127 317 223 449 590 773 1083 957 93 35 105 35 126 3z m1172 -10 c478 -179 848 -511 1065 -954 57 -117 117 -277 117 -310 0 -10 -9 -26 -21 -34 -20 -13 -30 -10 -129 40 -223 111 -441 184 -704 235 -83 17 -155 34 -159 38 -5 5 -17 52 -27 104 -52 269 -144 549 -244 743 l-63 122 20 26 c10 14 25 26 33 26 8 0 59 -16 112 -36z m-428 -1144 c251 -12 397 -29 404 -46 3 -7 12 -104 22 -216 25 -305 9 -941 -25 -1024 -10 -24 -28 -27 -299 -45 -252 -17 -825 -2 -948 26 -19 4 -22 16 -34 127 -21 209 -25 715 -6 926 9 101 16 192 16 201 0 15 17 20 113 30 244 27 492 34 757 21z m-1084 -87 c-12 -41 -27 -241 -32 -448 -6 -210 6 -534 25 -670 5 -33 7 -61 6 -63 -2 -2 -20 1 -42 7 -21 6 -83 20 -138 32 -315 68 -645 220 -787 362 -139 138 -136 269 9 408 175 169 446 285 898 382 48 11 66 7 61 -10z m1847 -7 c371 -81 661 -210 820 -364 144 -140 147 -273 8 -410 -145 -143 -442 -281 -771 -357 -63 -14 -132 -31 -153 -36 -22 -6 -40 -9 -42 -7 -2 2 0 37 5 78 18 166 32 512 26 655 -8 181 -24 412 -31 443 -7 28 -2 28 138 -2z m-2672 -1131 c192 -98 421 -174 710 -235 79 -17 145 -32 146 -34 2 -2 10 -43 19 -92 52 -301 176 -658 294 -848 l20 -33 -28 -26 -27 -26 -105 39 c-230 86 -423 199 -611 358 -243 205 -452 512 -560 824 -34 96 -34 97 -14 112 11 9 26 16 34 16 8 0 63 -25 122 -55z m3506 40 l22 -16 -35 -102 c-190 -549 -604 -968 -1164 -1177 l-105 -39 -26 25 -25 24 65 133 c105 209 179 438 241 741 11 55 22 101 23 102 2 2 67 17 145 33 283 60 556 152 727 245 91 49 102 52 132 31z m-2265 -351 c191 -23 681 -23 881 1 82 9 150 15 153 12 3 -3 1 -22 -5 -44 -6 -21 -25 -99 -42 -173 -99 -422 -273 -740 -454 -829 -202 -100 -427 134 -588 609 -35 105 -90 317 -103 398 -8 50 -22 48 158 26z"/> <path d="M9525 8503 c-119 -62 -258 -287 -350 -566 -43 -130 -90 -315 -83 -322 2 -2 60 0 128 5 163 12 602 12 755 0 65 -5 121 -7 124 -4 8 8 -39 191 -85 333 -136 417 -331 637 -489 554z"/> <path d="M8882 8380 c-337 -140 -629 -383 -829 -687 -80 -122 -216 -403 -195 -403 4 0 53 21 110 46 181 81 464 168 693 214 l55 11 23 121 c43 226 122 470 207 640 24 48 44 90 44 93 0 9 -12 5 -108 -35z"/> <path d="M10210 8416 c0 -3 16 -36 34 -74 49 -97 99 -223 129 -327 27 -93 91 -352 103 -417 3 -21 9 -38 11 -38 19 0 259 -58 363 -87 125 -35 360 -122 438 -162 23 -12 46 -21 51 -21 23 0 -100 256 -186 390 -71 109 -115 163 -227 278 -189 195 -379 326 -610 421 -102 43 -106 44 -106 37z"/> <path d="M9183 7256 c-78 -7 -145 -15 -149 -18 -18 -19 -28 -210 -28 -563 0 -366 10 -546 31 -565 17 -16 306 -34 558 -35 256 0 539 18 561 36 20 16 39 295 39 564 0 255 -19 541 -36 559 -29 31 -685 45 -976 22z"/> <path d="M8515 7150 c-368 -96 -642 -241 -737 -389 -54 -85 -32 -159 75 -257 85 -77 197 -143 349 -204 116 -47 338 -113 421 -127 l37 -6 -7 59 c-10 76 -10 821 0 897 9 69 16 67 -138 27z"/> <path d="M10543 7113 c13 -89 13 -789 0 -876 l-10 -69 44 7 c126 19 415 116 556 186 188 95 317 219 317 306 0 135 -214 301 -535 413 -95 33 -339 100 -366 100 -13 0 -14 -9 -6 -67z"/> <path d="M7871 6008 c147 -378 421 -705 769 -921 122 -75 358 -181 347 -155 -3 7 -30 67 -60 133 -88 196 -163 442 -198 648 l-12 74 -131 28 c-269 58 -501 132 -656 210 -38 19 -72 35 -75 35 -2 0 5 -24 16 -52z"/> <path d="M11260 6021 c-150 -77 -368 -146 -646 -206 l-131 -28 -27 -126 c-62 -281 -136 -511 -218 -675 -16 -32 -28 -60 -26 -62 9 -8 239 100 334 157 243 146 495 395 629 620 83 141 185 360 167 359 -4 -1 -41 -18 -82 -39z"/> <path d="M9090 5730 c0 -22 59 -245 85 -323 87 -257 214 -475 321 -550 56 -39 117 -46 170 -19 102 52 213 209 297 422 62 156 150 462 136 473 -2 2 -35 0 -74 -4 -220 -24 -830 -19 -917 7 -10 3 -18 0 -18 -6z"/> </g> </svg>
                            </a>
                        {/if}
                            </div>
                        </div>
                    </div>
                {/if}

                {#if data.profile.about_me && data.profile.about_me.trim()}
                    <div class="profile-section">
                        <h4 class="font-display">// {$t('profile.info')}</h4>
                        <p class="about-me-text">{data.profile.about_me}</p>
                    </div>
                {/if}
            </div>

            {#if isOwner}
                <div class="profile-actions">
                    <NeonButton href="/profile/edit">{$t('profile.edit')}</NeonButton>
                </div>
            {/if}

            <div class="ticker-wrap">
            <div class="ticker">
                <span>STATUS: ONLINE // SECURITY LEVEL: 5 // BIOMETRICS: SYNCED // LAST UPDATE: {new Date().toLocaleDateString()} // WELCOME USER. </span>
                <span>STATUS: ONLINE // SECURITY LEVEL: 5 // BIOMETRICS: SYNCED // LAST UPDATE: {new Date().toLocaleDateString()} // WELCOME USER. </span>
            </div>
        </div>
            </div>
        </div>

        <div class="comments-container max-w-4xl mx-auto mt-12">
            <h4 class="font-display text-2xl text-cyber-yellow mb-6 text-center">// {$t('profile.comments_title')} ({data.comments.length})</h4>

            {#if $userStore.user}
                <form on:submit|preventDefault={handleAddComment} class="add-comment-form">
                    <img src={$userStore.user.avatar_url || `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${$userStore.user.username}`} alt="Ваш аватар" class="comment-avatar" />
                    <div class="flex-grow">
                        <textarea name="commentText" bind:value={commentText} placeholder={$t('profile.comment_placeholder')} class="input-field" rows="3"></textarea>
                        {#if form?.addCommentError}<p class="error-message-small">{form.addCommentError}</p>{/if}
                    </div>
                    <NeonButton type="submit" extraClass="self-start" disabled={isSubmitting}>
                    {isSubmitting ? $t('profile.sending') : $t('profile.send_btn')}
                    </NeonButton>
                </form>
            {:else}
                <p class="text-center text-gray-400 py-4"><a href="/login" class="text-cyber-yellow hover:underline">{$t('nav.login')}</a> {$t('profile.login_req_suffix')}</p>
            {/if}

            <div class="comments-list">
                {#if data.comments.length > 0}
                    {#each data.comments as comment (comment.id)}
                        <div class="comment-card" transition:fade>
                <a href={`/profile/${comment.author_username}`} class="comment-avatar-wrapper {comment.author_equipped_frame || ''}">
                    <img src={comment.author_avatar_url || `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${comment.author_username}`} alt="Аватар {comment.author_username}" class="comment-avatar" />
                </a>
                            <div class="flex-grow">
                                <div class="comment-header">
                                    <a href={`/profile/${comment.author_username}`} class="comment-author">{comment.author_username}</a>
                                    <span class="comment-time">{formatTimeAgo(comment.createdAt)}</span>
                                </div>
                                <p class="comment-text">{comment.text}</p>
                                <div class="comment-actions">
                                    {#if $userStore.user}
                                        {#if comment.author_uid === $userStore.user.uid}
                                            <button on:click={() => handleDeleteComment(comment.id)} type="button" class="action-btn">
                                {$t('profile.delete_btn')}
                            </button>
                        {:else}
                            <button on:click={() => handleReportComment(comment.id, comment.author_username)} class="action-btn">
                                {$t('profile.report_btn')}
                            </button>
                                        {/if}
                                    {/if}
                                </div>
                            </div>
                        </div>
                    {/each}
                {:else}
                    <p class="text-center text-gray-500 py-8">{$t('profile.empty_comments')}</p>
                {/if}
            </div>
        </div>
{/if}


<style>
    @keyframes ticker-scroll {
        0% { transform: translateX(0); }
        100% { transform: translateX(-50%); }
    }
    @keyframes content-fade-in {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }

    @keyframes report-pulse {
      0%, 100% {
        transform: scale(1);
        opacity: 0.7;
      }
      50% {
        transform: scale(1.1);
        opacity: 1;
      }
    }

    .profile-container {
        @apply max-w-2xl mx-auto my-10 p-1 sm:p-2 rounded-none shadow-2xl relative;
        background: #0a0a0a;
        border: 1px solid rgba(252, 238, 10, 0.3);
        clip-path: polygon(0 20px, 20px 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%);
        overflow: hidden;
        background-image:
            linear-gradient(rgba(10, 10, 10, 0.96), rgba(10, 10, 10, 0.96)),
            linear-gradient(rgba(252, 238, 10, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(252, 238, 10, 0.1) 1px, transparent 1px);
        background-size: 100% 100%, 30px 30px, 30px 30px;
    }

    .corner-bg { @apply absolute w-16 h-16 opacity-15 blur-sm; background: radial-gradient(circle, var(--cyber-yellow, #fcee0a) 0%, rgba(252, 238, 10, 0) 60%); }
    .top-left { top: -30px; left: -30px; }
    .top-right { top: -30px; right: -30px; }
    .bottom-left { bottom: -30px; left: -30px; }
    .bottom-right { bottom: -30px; right: -30px; }

    .top-bar {
        @apply relative flex items-center justify-between p-2 text-xs uppercase tracking-widest text-cyber-yellow/70;
        border-bottom: 1px solid var(--border-color);
        padding-right: 3.5rem;
    }

    .profile-header, .profile-content, .profile-actions { animation: content-fade-in 0.5s ease-out both; }
    .profile-content { animation-delay: 0.2s; }
    .profile-actions { animation-delay: 0.4s; }

    .profile-header { @apply flex flex-col items-center text-center p-6; }
    .profile-avatar { @apply w-32 h-32 rounded-full object-cover mb-4; border: 4px solid var(--cyber-yellow); box-shadow: 0 0 20px var(--cyber-yellow); }
    .profile-username { @apply text-4xl font-bold text-white break-words; }

    .profile-content { @apply p-6 text-left; }
    .profile-section { @apply pb-6 mb-6; border-bottom: 1px solid rgba(255, 255, 255, 0.1); }
    .profile-content > .profile-section:last-of-type { border-bottom: none; padding-bottom: 0; margin-bottom: 0; }
    .profile-section h4 { @apply mb-2 text-sm font-bold uppercase tracking-widest text-cyber-yellow; }
    .about-me-text { @apply whitespace-pre-wrap leading-relaxed text-gray-200; }

    .social-links-grid { @apply flex flex-wrap justify-center gap-4 mt-4 content-center; }
    .social-link-btn { @apply w-14 h-14 flex items-center justify-center rounded-full text-gray-400 bg-gray-900/50 border border-gray-700; transition: all 0.2s ease-in-out; }
    .social-link-btn:hover { @apply text-white border-cyber-yellow scale-110; box-shadow: 0 0 15px var(--cyber-yellow, #fcee0a); }

    .profile-actions { @apply p-6 text-center border-t border-gray-800; }

    .ticker-wrap { @apply absolute bottom-0 left-0 w-full p-2 overflow-hidden text-xs uppercase tracking-wider; background: var(--bg-color); border-top: 1px solid var(--border-color); }
    .ticker { @apply inline-block whitespace-nowrap; animation: ticker-scroll 30s linear infinite; }

    .comments-container {
        @apply mt-12 max-w-4xl mx-auto;
    }
    .comments-container h4 {
        @apply text-2xl text-center mb-6;
    }

    .add-comment-form { @apply flex items-start gap-4 mb-8; }
    .comment-avatar { @apply w-12 h-12 rounded-full object-cover border-2 border-gray-600 shrink-0; }
    .add-comment-form .comment-avatar { @apply border-cyber-yellow; }

    .input-field { @apply block w-full p-2 bg-transparent text-gray-200 resize-none rounded-none; border: none; border-bottom: 1px solid var(--border-color, #30363d); font-family: 'Inter', sans-serif; font-size: 1em; transition: border-color 0.3s, box-shadow 0.3s; }
    .input-field:focus { @apply outline-none border-cyber-yellow; box-shadow: 0 1px 0 var(--cyber-yellow, #fcee0a); }

    .error-message-small { @apply text-red-400 text-sm mt-1; }
    .comments-list { @apply mt-6 space-y-6; }
    .comment-card { @apply flex items-start gap-4; }
    .comment-header { @apply flex items-baseline gap-3 mb-1; }
    .comment-author { @apply font-bold text-white hover:text-cyber-yellow transition-colors; }
    .comment-time { @apply text-xs text-gray-500; }
    .comment-text { @apply whitespace-pre-wrap text-gray-300; }
    .comment-actions { @apply mt-2; }
    .action-btn { @apply text-xs text-gray-500 hover:text-red-400 transition-colors; }

    .report-icon-btn {
        @apply absolute top-2 right-2 z-20 p-2 rounded-full;
        color: var(--cyber-red, #ff003c);
        animation: report-pulse 2.5s infinite cubic-bezier(0.4, 0, 0.6, 1);
        transition: all 0.2s ease-in-out;
    }
    .report-icon-btn:hover {
        background-color: rgba(255, 0, 60, 0.25);
        color: #ff4d6d;
        transform: scale(1.2);
        animation-play-state: paused;
        box-shadow: 0 0 15px var(--cyber-red, #ff003c);
    }
    .report-icon-btn:focus-visible {
        @apply outline-none ring-2 ring-offset-2 ring-offset-black ring-red-500;
    }

    .top-bar::before {
        content: '';
        @apply absolute top-1/2 left-2 w-2 h-2 rounded-full bg-cyber-yellow;
        transform: translateY(-50%);
        box-shadow: 0 0 5px var(--cyber-yellow);
    }
 .avatar-wrapper {
    position: relative;
    display: inline-block;
    border-radius: 50%;
    line-height: 0;
}

.profile-avatar {
    @apply w-32 h-32 rounded-full object-cover;
    box-shadow: none;
    border: none;
}
.add-comment-form .comment-avatar { @apply border-cyber-yellow; }

.comment-avatar-wrapper {
        position: relative;
        flex-shrink: 0;
        width: 48px;
        height: 48px;
        border-radius: 50%;
    }
    .comment-avatar {
        @apply w-12 h-12 rounded-full object-cover;
        border: none;
    }
    .private-section {
        background: rgba(255, 255, 255, 0.02);
        border: 1px dashed rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: 1rem !important; /* Перебиваем паддинг родителя если надо */
        margin-bottom: 1.5rem;
    }

    .email-control {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 1rem;
        margin-top: 0.5rem;
    }

    .verified-badge {
        display: inline-flex; align-items: center; gap: 4px;
        background: rgba(57, 255, 20, 0.1);
        border: 1px solid #39ff14;
        color: #39ff14;
        font-size: 0.7rem; font-weight: bold;
        padding: 4px 8px; border-radius: 4px;
        font-family: 'Chakra Petch', monospace;
        cursor: help;
        box-shadow: 0 0 10px rgba(57, 255, 20, 0.2);
    }

    .unverified-btn {
        background: rgba(255, 215, 0, 0.1);
        border: 1px solid var(--cyber-yellow);
        color: var(--cyber-yellow);
        font-size: 0.7rem; font-weight: bold;
        padding: 4px 10px; border-radius: 4px;
        font-family: 'Chakra Petch', monospace;
        cursor: pointer; transition: all 0.2s;
        animation: blink-border 2s infinite;
    }
    .unverified-btn:hover {
        background: var(--cyber-yellow);
        color: #000;
        box-shadow: 0 0 15px var(--cyber-yellow);
    }
    .unverified-btn:disabled {
        opacity: 0.5; cursor: not-allowed; animation: none; filter: grayscale(1);
    }

    @keyframes blink-border {
        0%, 100% { box-shadow: 0 0 2px var(--cyber-yellow); }
        50% { box-shadow: 0 0 8px var(--cyber-yellow); }
    }
    .verified-badge {
    position: relative;
    display: inline-flex; align-items: center; gap: 4px;
    background: rgba(57, 255, 20, 0.1);
    border: 1px solid #39ff14;
    color: #39ff14;
    font-size: 0.7rem; font-weight: bold;
    padding: 4px 8px; border-radius: 4px;
    font-family: 'Chakra Petch', monospace;
    cursor: help;
    box-shadow: 0 0 10px rgba(57, 255, 20, 0.2);
}

.verified-tooltip {
    position: absolute;
    bottom: 130%;
    left: 50%;
    transform: translateX(-50%) translateY(5px);
    width: 180px;
    background: rgba(5, 10, 5, 0.95);
    border: 1px solid #39ff14;
    color: #ccc;
    padding: 0.6rem;
    border-radius: 4px;
    font-size: 0.65rem;
    line-height: 1.3;
    font-family: 'Inter', sans-serif;
    font-weight: normal;
    text-align: center;
    text-transform: none;
    box-shadow: 0 5px 15px rgba(0,0,0,0.5);

    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 50;
}

.verified-tooltip::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    margin-left: -5px;
    border-width: 5px;
    border-style: solid;
    border-color: #39ff14 transparent transparent transparent;
}

.verified-badge:hover .verified-tooltip {
    opacity: 1;
    visibility: visible;
    transform: translateX(-50%) translateY(0);
}
.profile-backdrop {
    position: fixed;
    top: 0; left: 0; width: 100vw; height: 100vh;
    z-index: -1;
    pointer-events: none;
}
</style>