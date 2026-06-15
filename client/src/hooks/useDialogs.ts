import { useState, createContext, useContext } from 'react';
import React from 'react';

export type DialogState = null | { type: 'authGate'; redirect?: string };

export interface UseDialogsResult {
    dialog: DialogState;
    openDialog: (d: NonNullable<DialogState>) => void;
    closeDialog: () => void;
}

const DialogsContext = createContext<UseDialogsResult | null>(null);

function useDialogsState(): UseDialogsResult {
    const [dialog, setDialog] = useState<DialogState>(null);

    const closeDialog = () => setDialog(null);
    const openDialog = (d: NonNullable<DialogState>) => setDialog(d);

    return {
        dialog,
        openDialog,
        closeDialog,
    };
}

export function DialogsProvider({ children }: { children: React.ReactNode }) {
    const value = useDialogsState();
    return React.createElement(DialogsContext.Provider, { value }, children);
}

export function useDialogs(): UseDialogsResult {
    const ctx = useContext(DialogsContext);
    if (!ctx) throw new Error('useDialogs must be used within DialogsProvider');
    return ctx;
}
