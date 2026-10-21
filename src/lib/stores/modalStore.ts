import { writable, get } from 'svelte/store';
import { t } from 'svelte-i18n';
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

// Подписи кнопок — из локалей; окна открываются по действию пользователя, словарь к этому времени загружен
const label = (key: string) => get(t)(key);

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
            actions: [{ text: label('modal.ok'), action: close, class: 'primary' }]
        }),
        success: (title: string, message: string) => set({
            isOpen: true,
            title,
            message,
            type: 'success',
            actions: [{ text: label('modal.great'), action: close, class: 'primary' }]
        }),
        error: (title: string, message: string) => set({
            isOpen: true,
            title,
            message,
            type: 'error',
            actions: [{ text: label('modal.close'), action: close, class: 'primary' }]
        }),
        warning: (title: string, message: string) => set({
            isOpen: true,
            title,
            message,
            type: 'warning',
            actions: [{ text: label('modal.got_it'), action: close, class: 'primary' }]
        }),
        confirm: (title: string, message: string, onConfirm: () => void) => set({
            isOpen: true,
            title,
            message,
            type: 'warning',
            actions: [
                { text: label('modal.confirm_yes'), action: () => { onConfirm(); close(); }, class: 'primary' },
                { text: label('ui.cancel'), action: close, class: 'secondary' }
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
                        text: label('ui.send_report'),
                        action: () => {
                            onSubmit(selectedReason);
                        },
                        class: 'primary'
                    },
                    { text: label('ui.cancel'), action: close, class: 'secondary' }
                ]
            });
        },
        close
    };
}

export const modal = createModalStore();
