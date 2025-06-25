declare global {
    namespace App {
        // interface Error {}
        
        interface Locals {
            user: {
                uid: string;
                email: string | undefined;
                username: string | null;
            } | null;
        }

        // interface PageData {}
        // interface PageState {}
        // interface Platform {}
    }
}

export {};