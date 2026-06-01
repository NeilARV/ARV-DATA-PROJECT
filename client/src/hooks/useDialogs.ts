import { useState, createContext, useContext } from "react";
import React from "react";

export type DialogState =
  | null
  | { type: "login" }
  | { type: "signup" };

export interface UseDialogsResult {
  dialog: DialogState;
  openDialog: (d: NonNullable<DialogState>) => void;
  closeDialog: () => void;
  headerDialogHandlers: {
    onLoginClick: () => void;
    onSignupClick: () => void;
  };
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
    headerDialogHandlers: {
      onLoginClick: () => setDialog({ type: "login" }),
      onSignupClick: () => setDialog({ type: "signup" }),
    },
  };
}

export function DialogsProvider({ children }: { children: React.ReactNode }) {
  const value = useDialogsState();
  return React.createElement(DialogsContext.Provider, { value }, children);
}

export function useDialogs(): UseDialogsResult {
  const ctx = useContext(DialogsContext);
  if (!ctx) throw new Error("useDialogs must be used within DialogsProvider");
  return ctx;
}
