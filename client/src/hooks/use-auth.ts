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

export type DataAppStatus = "in-renovation" | "on-market" | "wholesale" | "sold";
export type DealTypeFilter = "wholesale" | "agent" | "sold";

export interface NotificationPreferences {
  userId: string;
  dataAppEnabled: boolean;
  dealNotificationsEnabled: boolean;
  vendorNotificationsEnabled: boolean;
  analyticsEnabled: boolean;
  dataAppStatusFilter: DataAppStatus[];
  dealTypeFilter: DealTypeFilter[];
  createdAt: string;
  updatedAt: string | null;
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
  county?: string | null;
  state?: string | null;
  msaSubscriptions?: string[];
  relationshipManager?: RelationshipManager | null;
  notificationPreferences?: NotificationPreferences | null;
}

/** Admin status from GET /api/admin/status (role-based: admin, owner, or relationship-manager can access panel). */
const ADMIN_STATUS_QUERY_KEY = ["/api/admin/status"] as const;

const ROLE_PRIORITY: Roles[] = ["owner", "admin", "relationship-manager", "member"];

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
    staleTime: 5 * 60 * 1000, // 5 minutes
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

  // ── Specific role flags ───────────────────────────────────────────────────────
  const isOwner = isAuthenticated && !isAdminStatusLoading && roles.includes("owner");
  const isAdmin = isAuthenticated && !isAdminStatusLoading && roles.includes("admin");
  const isRelationshipManager = isAuthenticated && !isAdminStatusLoading && roles.includes("relationship-manager");
  const isMember = isAuthenticated && !isAdminStatusLoading && roles.includes("member");

  // ── Combined role flags ───────────────────────────────────────────────────────
  /** True when user has any ARV team role (admin, owner, relationship-manager, member). */
  const canAccessAdminPanel = isAuthenticated && !isAdminStatusLoading && (isOwner || isAdmin || isRelationshipManager || isMember);

  // ── Subscription tier flags ───────────────────────────────────────────────────
  const isBasic = isAuthenticated && subscriptionTier === "basic";
  const isPro = isAuthenticated && subscriptionTier === "pro";
  const isPremium = isAuthenticated && subscriptionTier === "premium";

  /**
   * True when the authenticated user may access app pages.
   * Granted when the user has any subscription tier OR any ARV team role.
   * Stays true while admin status is loading to avoid blocking during hydration.
   */
  const hasTeamRole = roles.some((r) => (["admin", "owner", "relationship-manager", "member"] as string[]).includes(r));
  const canAccessApp = isAuthenticated && (isAdminStatusLoading || subscriptionTier !== null || hasTeamRole);

  // ── Raw string values ─────────────────────────────────────────────────────────
  /** The user's primary ARV team role (highest privilege), or null if none. */
  const role: Roles | null = ROLE_PRIORITY.find((r) => roles.includes(r)) ?? null;
  /** The user's subscription tier, or null if none. */
  const subscription: SubscriptionTier | null = subscriptionTier as SubscriptionTier | null;

  return {
    user: data?.user ?? null,
    isLoading,
    isAuthenticated,
    // ── Role flags ──────────────────────────────────────────────────────────────
    isOwner,
    isAdmin,
    isRelationshipManager,
    isMember,
    canAccessAdminPanel,
    // ── Subscription flags ──────────────────────────────────────────────────────
    isBasic,
    isPro,
    isPremium,
    
    canAccessApp,
    // ── Raw values ──────────────────────────────────────────────────────────────
    roles,
    role,
    subscriptionTier,
    subscription,

    isAdminStatusLoading: isAuthenticated && isAdminStatusLoading,
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
