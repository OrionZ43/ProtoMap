if (typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', function (event) {
        console.error('CLIENT HOOK: Unhandled Promise Rejection:', event.reason);

        if (event.reason instanceof Error && event.reason.stack) {
            console.error('CLIENT HOOK: Stack trace for Unhandled Rejection:', event.reason.stack);
        } else {
             console.error('CLIENT HOOK: Rejection reason (raw):', event.reason);
        }
    });

    window.addEventListener('error', function (event) {
        console.error('CLIENT HOOK: Global window error:', event.error || event.message, event);
        if (event.error && event.error.stack) {
            console.error('CLIENT HOOK: Stack trace for global error:', event.error.stack);
        }
    });
}