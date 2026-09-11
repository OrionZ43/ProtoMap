declare global {
    namespace App {
        interface Locals {
            user: {
                uid: string;
                email: string | undefined;
                username: string | null;
                emailVerified?: boolean;
                isBanned?: boolean;
                /** Редакции документов, на которые есть запись в журнале согласий. */
                consentsPrivacyVersion?: string | null;
                consentsTosVersion?: string | null;
            } | null;
        }
        // ...
    }
}
export {};