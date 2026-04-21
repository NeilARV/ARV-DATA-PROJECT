import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";

export interface RelationshipManager {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
}

export interface AuthUser {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  isAdmin: boolean;
  notifications: boolean;
  createdAt: string;
  msaSubscriptions?: string[];
  relationshipManager?: RelationshipManager | null;
}

/** Admin status from GET /api/admin/status (role-based: admin, owner, or relationship-manager can access panel). */
const ADMIN_STATUS_QUERY_KEY = ["/api/admin/status"] as const;

export function useAuth() {
  const { data, isLoading } = useQuery<{ user: AuthUser | null }>({
    queryKey: ["/api/auth/me"],
    staleTime: 5 * 60 * 1000,
  });

  const isAuthenticated = !!data?.user;

  const {
    data: adminStatus,
    isLoading: isAdminStatusLoading,
  } = useQuery<{ authenticated: boolean; isAdmin: boolean; roles: string[]; subscriptionTier: string | null }>({
    queryKey: ADMIN_STATUS_QUERY_KEY,
    staleTime: 5 * 60 * 1000,
    enabled: isAuthenticated,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], { user: null });
      queryClient.setQueryData(ADMIN_STATUS_QUERY_KEY, null);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ADMIN_STATUS_QUERY_KEY });
    },
  });

  const roles = adminStatus?.roles ?? [];
  const subscriptionTier = adminStatus?.subscriptionTier ?? null;
  const isOwner = roles.includes("owner");
  /** True when user has owner or admin only (delete property, edit company, etc.). Not relationship-manager. */
  const isAdminOrOwner =
    isAuthenticated &&
    !isAdminStatusLoading &&
    (isOwner || roles.includes("admin"));

  const isRelationshipManager = isAuthenticated && !isAdminStatusLoading && roles.includes("relationship-manager");

  return {
    user: data?.user ?? null,
    isLoading,
    isAuthenticated,
    /** Role-based: true when user has admin, owner, or relationship-manager (can see Admin link and access /admin). */
    isAdmin: isAuthenticated && (adminStatus?.isAdmin ?? false),
    /** True when user has owner or admin role (e.g. delete property, edit company). Use for property/company actions. */
    isAdminOrOwner,
    /** True when current user has owner role (for role-management permissions). */
    isOwner,
    /** True when current user has the relationship-manager role. */
    isRelationshipManager,
    /** The current user's subscription tier ('basic' | 'pro' | 'premium' | null). */
    subscriptionTier,
    /** All ARV team roles assigned to the current user (e.g. "owner", "admin", "relationship-manager", "member"). */
    roles,
    isAdminStatusLoading: isAuthenticated && isAdminStatusLoading,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}

const TRIAL_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export function useSubscriptionGate() {
  const { isAuthenticated, isLoading, subscriptionTier, isAdminStatusLoading, user } = useAuth();
  const [shouldBlock, setShouldBlock] = useState(false);

  useEffect(() => {
    if (isLoading || isAdminStatusLoading) return;

    // Only applies to logged-in users with no subscription
    if (!isAuthenticated || subscriptionTier !== null) {
      setShouldBlock(false);
      return;
    }

    const storageKey = `trial_start_${user!.id}`;
    const stored = localStorage.getItem(storageKey);
    const now = Date.now();

    if (stored === null) {
      // First visit — start the clock
      localStorage.setItem(storageKey, String(now));
      const remaining = TRIAL_DURATION_MS;
      const timer = setTimeout(() => setShouldBlock(true), remaining);
      return () => clearTimeout(timer);
    }

    const elapsed = now - Number(stored);

    if (elapsed >= TRIAL_DURATION_MS) {
      // Already expired — block immediately
      setShouldBlock(true);
    } else {
      // Partway through — schedule block for the remaining time
      const remaining = TRIAL_DURATION_MS - elapsed;
      const timer = setTimeout(() => setShouldBlock(true), remaining);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, isLoading, subscriptionTier, isAdminStatusLoading, user]);

  return { shouldBlock };
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
