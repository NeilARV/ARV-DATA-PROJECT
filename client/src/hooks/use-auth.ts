import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";

export interface AuthUser {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  isAdmin: boolean;
  createdAt: string;
}

export function useAuth() {
  const { data, isLoading } = useQuery<{ user: AuthUser | null }>({
    queryKey: ["/api/auth/me"],
    staleTime: 5 * 60 * 1000,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  return {
    user: data?.user ?? null,
    isLoading,
    isAuthenticated: !!data?.user,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}

const VIEW_LIMIT_REACHED_KEY = "view_limit_reached";
let SIGNUP_DELAY_MS = 30000; // 30 seconds

export function useSignupPrompt() {
  const { isAuthenticated, isLoading } = useAuth();
  const [shouldShowSignup, setShouldShowSignup] = useState(false);
  const [isForced, setIsForced] = useState(false);

  console.log("Is Authenticated: ", isAuthenticated)

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      setShouldShowSignup(false);
      setIsForced(false);
      return;
    }

    const viewLimitReached = sessionStorage.getItem(VIEW_LIMIT_REACHED_KEY);
    
    if (viewLimitReached) {
      SIGNUP_DELAY_MS = 0;
    }

    const timer = setTimeout(() => {
      if (!isAuthenticated) {
        setShouldShowSignup(true);
        setIsForced(true); // After 1 minute, the prompt is forced
        sessionStorage.setItem(VIEW_LIMIT_REACHED_KEY, "true");
      }
    }, SIGNUP_DELAY_MS);

    return () => clearTimeout(timer);
  }, [isAuthenticated, isLoading]);

  const dismissPrompt = () => {
    // Only allow dismissal if not forced
    if (!isForced) {
      setShouldShowSignup(false);
      sessionStorage.setItem(VIEW_LIMIT_REACHED_KEY, "true");
    }
  };

  return {
    shouldShowSignup,
    isForced,
    dismissPrompt,
  };
}
