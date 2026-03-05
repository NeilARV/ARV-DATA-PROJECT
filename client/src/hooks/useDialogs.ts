import { useState, useEffect } from "react";
import { useAuth, useSignupPrompt } from "@/hooks/use-auth";

export interface UseDialogsResult {
  /** Props to spread onto <SignupDialog /> */
  signupDialogProps: {
    open: boolean;
    forced: boolean;
    onClose: () => void;
    onSuccess: () => void;
    onSwitchToLogin: () => void;
  };
  /** Props to spread onto <LoginDialog /> */
  loginDialogProps: {
    open: boolean;
    forced: boolean;
    onClose: () => void;
    onSuccess: () => void;
    onSwitchToSignup: () => void;
  };
  /** Props for <LeaderboardDialog /> (open + onOpenChange only; pass county, onCompanyClick, onZipCodeClick from parent) */
  leaderboardDialogProps: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  };
  /** Handlers for Header: onLoginClick, onSignupClick, onLeaderboardClick */
  headerDialogHandlers: {
    onLoginClick: () => void;
    onSignupClick: () => void;
    onLeaderboardClick: () => void;
  };
}

/**
 * Encapsulates signup, login, and leaderboard dialog state and behavior.
 * Integrates with useAuth and useSignupPrompt to auto-show signup when unauthenticated and prompt triggers.
 */
export function useDialogs(): UseDialogsResult {
  const [showSignupDialog, setShowSignupDialog] = useState(false);
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [showLeaderboardDialog, setShowLeaderboardDialog] = useState(false);
  const [isDialogForced, setIsDialogForced] = useState(false);

  const { isAuthenticated } = useAuth();
  const { shouldShowSignup, isForced, dismissPrompt } = useSignupPrompt();

  useEffect(() => {
    if (shouldShowSignup && !isAuthenticated) {
      setShowSignupDialog(true);
      setIsDialogForced(isForced);
    }
  }, [shouldShowSignup, isAuthenticated, isForced]);

  return {
    signupDialogProps: {
      open: showSignupDialog,
      forced: isDialogForced,
      onClose: () => {
        if (!isDialogForced) {
          setShowSignupDialog(false);
          dismissPrompt();
        }
      },
      onSuccess: () => {
        setShowSignupDialog(false);
        setIsDialogForced(false);
        dismissPrompt();
      },
      onSwitchToLogin: () => {
        setShowSignupDialog(false);
        setShowLoginDialog(true);
      },
    },
    loginDialogProps: {
      open: showLoginDialog,
      forced: isDialogForced,
      onClose: () => {
        if (!isDialogForced) {
          setShowLoginDialog(false);
        }
      },
      onSuccess: () => {
        setShowLoginDialog(false);
        setIsDialogForced(false);
      },
      onSwitchToSignup: () => {
        setShowLoginDialog(false);
        setShowSignupDialog(true);
      },
    },
    leaderboardDialogProps: {
      open: showLeaderboardDialog,
      onOpenChange: setShowLeaderboardDialog,
    },
    headerDialogHandlers: {
      onLoginClick: () => {
        setShowLoginDialog(true);
        setShowSignupDialog(false);
      },
      onSignupClick: () => {
        setShowSignupDialog(true);
        setShowLoginDialog(false);
      },
      onLeaderboardClick: () => setShowLeaderboardDialog(true),
    },
  };
}
