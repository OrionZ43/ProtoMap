declare global {
    namespace App {
        interface Locals {
            user: {
                uid: string;
                email: string | undefined;
                username: string | null;
                emailVerified?: boolean;
                isBanned?: boolean;
            } | null;
        }
        // ...
    }
}
export {};