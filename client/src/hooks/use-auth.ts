import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";

export interface AuthUser {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
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

const SIGNUP_SHOWN_KEY = "arvdata_signup_shown";
const SIGNUP_DELAY_MS = 60000;

export function useSignupPrompt() {
  const { isAuthenticated, isLoading } = useAuth();
  const [shouldShowSignup, setShouldShowSignup] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      setShouldShowSignup(false);
      return;
    }

    const hasSeenPrompt = sessionStorage.getItem(SIGNUP_SHOWN_KEY);
    if (hasSeenPrompt) {
      return;
    }

    const timer = setTimeout(() => {
      if (!isAuthenticated) {
        setShouldShowSignup(true);
        sessionStorage.setItem(SIGNUP_SHOWN_KEY, "true");
      }
    }, SIGNUP_DELAY_MS);

    return () => clearTimeout(timer);
  }, [isAuthenticated, isLoading]);

  const dismissPrompt = () => {
    setShouldShowSignup(false);
    sessionStorage.setItem(SIGNUP_SHOWN_KEY, "true");
  };

  return {
    shouldShowSignup,
    dismissPrompt,
  };
}
