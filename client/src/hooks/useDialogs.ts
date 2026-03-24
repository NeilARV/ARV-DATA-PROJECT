import { useState, useEffect } from "react";
import { useAuth, useSignupPrompt } from "@/hooks/use-auth";

/**
 * Discriminated union of every dialog the app can show.
 * Add new variants here as the app grows.
 */
export type DialogState =
  | null
  | { type: "login"; forced: boolean }
  | { type: "signup"; forced: boolean }
  | { type: "leaderboard" }
  | { type: "info" }
  | { type: "property" }
  | { type: "deals" };

export interface UseDialogsResult {
  /** Current dialog state — null means no dialog is open */
  dialog: DialogState;
  /** Open a dialog by passing a DialogState value */
  openDialog: (d: NonNullable<DialogState>) => void;
  /** Close the active dialog */
  closeDialog: () => void;
  /** Whether the active dialog is forced (cannot be dismissed by the user) */
  isForced: boolean;
  /** Handlers wired to Header buttons */
  headerDialogHandlers: {
    onLoginClick: () => void;
    onSignupClick: () => void;
    onLeaderboardClick: () => void;
    onDealsClick: () => void;
  };
}

/**
 * Tracks a single active dialog using a discriminated-union state.
 * Only one dialog can be open at a time; switching types swaps the content.
 */
export function useDialogs(): UseDialogsResult {
  const [dialog, setDialog] = useState<DialogState>(null);

  const { isAuthenticated } = useAuth();
  const { shouldShowSignup, isForced: promptIsForced, dismissPrompt } = useSignupPrompt();

  // Auto-show signup prompt when triggered
  useEffect(() => {
    if (shouldShowSignup && !isAuthenticated) {
      setDialog({ type: "signup", forced: promptIsForced });
    }
  }, [shouldShowSignup, isAuthenticated, promptIsForced]);

  const closeDialog = () => {
    // Dismiss the signup prompt whenever a signup dialog closes (manual or after success)
    if (dialog?.type === "signup") {
      dismissPrompt();
    }
    setDialog(null);
  };

  const openDialog = (d: NonNullable<DialogState>) => setDialog(d);

  const isForced =
    (dialog?.type === "login" || dialog?.type === "signup") && dialog.forced;

  return {
    dialog,
    openDialog,
    closeDialog,
    isForced,
    headerDialogHandlers: {
      onLoginClick: () => setDialog({ type: "login", forced: false }),
      onSignupClick: () => setDialog({ type: "signup", forced: false }),
      onLeaderboardClick: () => setDialog({ type: "leaderboard" }),
      onDealsClick: () => setDialog({ type: "deals" }),
    },
  };
}
