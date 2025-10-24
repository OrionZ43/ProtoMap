import { writable } from 'svelte/store';
export type ModalType = 'info' | 'success' | 'warning' | 'error';

export type ModalAction = {
    text: string;
    action: () => void;
    class?: string;
};

export type ReportOption = {
    id: string;
    label: string;
};

export type ModalState = {
    isOpen: boolean;
    title: string;
    message: string;
    actions: ModalAction[];
    type: ModalType;
    reportOptions?: ReportOption[];
    onReportSubmit?: (selectedReason: string) => void;
};

function createModalStore() {
    const initialState: ModalState = {
        isOpen: false,
        title: '',
        message: '',
        actions: [],
        type: 'info',
        reportOptions: undefined,
        onReportSubmit: undefined
    };

    const { subscribe, set } = writable<ModalState>(initialState);

    const close = () => set(initialState);

    return {
        subscribe,
        info: (title: string, message: string) => set({
            isOpen: true,
            title,
            message,
            type: 'info',
            actions: [{ text: 'OK', action: close, class: 'primary' }]
        }),
        success: (title: string, message: string) => set({
            isOpen: true,
            title,
            message,
            type: 'success',
            actions: [{ text: 'Отлично!', action: close, class: 'primary' }]
        }),
        error: (title: string, message: string) => set({
            isOpen: true,
            title,
            message,
            type: 'error',
            actions: [{ text: 'Закрыть', action: close, class: 'primary' }]
        }),
        warning: (title: string, message: string) => set({
            isOpen: true,
            title,
            message,
            type: 'warning',
            actions: [{ text: 'Понятно', action: close, class: 'primary' }]
        }),
        confirm: (title: string, message: string, onConfirm: () => void) => set({
            isOpen: true,
            title,
            message,
            type: 'warning',
            actions: [
                { text: 'Да, подтвердить', action: () => { onConfirm(); close(); }, class: 'primary' },
                { text: 'Отмена', action: close, class: 'secondary' }
            ]
        }),
        report: (title: string, message: string, options: ReportOption[], onSubmit: (selectedReason: string) => void) => {
            let selectedReason = options[0]?.id || '';

            set({
                isOpen: true,
                title,
                message,
                type: 'warning',
                reportOptions: options.map(opt => ({...opt, selected: selectedReason === opt.id })),
                onReportSubmit: (reason) => {
                    selectedReason = reason;
                },
                actions: [
                    {
                        text: 'Отправить жалобу',
                        action: () => {
                            onSubmit(selectedReason);
                        },
                        class: 'primary'
                    },
                    { text: 'Отмена', action: close, class: 'secondary' }
                ]
            });
        },
        close
    };
}

export const modal = createModalStore();