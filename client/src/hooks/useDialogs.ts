import { useState, useEffect, createContext, useContext } from "react";
import React from "react";
import { useAuth, useSignupPrompt } from "@/hooks/use-auth";

export type DialogState =
  | null
  | { type: "login"; forced: boolean }
  | { type: "signup"; forced: boolean };

export interface UseDialogsResult {
  dialog: DialogState;
  openDialog: (d: NonNullable<DialogState>) => void;
  closeDialog: () => void;
  isForced: boolean;
  forcedDialogActive: boolean;
  headerDialogHandlers: {
    onLoginClick: () => void;
    onSignupClick: () => void;
  };
}

const DialogsContext = createContext<UseDialogsResult | null>(null);

function useDialogsState(): UseDialogsResult {
  const [dialog, setDialog] = useState<DialogState>(null);
  const { isAuthenticated } = useAuth();
  const { shouldShowSignup, isForced: promptIsForced, dismissPrompt } = useSignupPrompt();

  useEffect(() => {
    if (shouldShowSignup && !isAuthenticated) {
      setDialog({ type: "signup", forced: promptIsForced });
    }
  }, [shouldShowSignup, isAuthenticated, promptIsForced]);

  const closeDialog = () => {
    if (dialog?.type === "signup") {
      dismissPrompt();
    }
    setDialog(null);
  };

  const openDialog = (d: NonNullable<DialogState>) => setDialog(d);

  const isForced =
    (dialog?.type === "login" || dialog?.type === "signup") && dialog.forced;

  const forcedDialogActive =
    dialog != null &&
    (dialog.type === "login" || dialog.type === "signup") &&
    dialog.forced;

  return {
    dialog,
    openDialog,
    closeDialog,
    isForced,
    forcedDialogActive,
    headerDialogHandlers: {
      onLoginClick: () => setDialog({ type: "login", forced: false }),
      onSignupClick: () => setDialog({ type: "signup", forced: false }),
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
