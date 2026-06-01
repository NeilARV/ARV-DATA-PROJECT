import { useAuth } from "@/hooks/use-auth";
import { useDialogs } from "@/hooks/useDialogs";
import { useToast } from "@/hooks/use-toast";

export function useRequireAuth() {
    const { isAuthenticated, isLoading } = useAuth();
    const { openDialog } = useDialogs();
    const { toast } = useToast();

    const requireAuth = (action: () => void) => {
        // Allow through while auth is loading to avoid blocking during hydration
        if (isLoading) return;
        if (!isAuthenticated) {
            toast({
                title: "Sign up to continue",
                description: "Create a free account to access this feature.",
            });
            openDialog({ type: "signup" });
            return;
        }
        action();
    };

    return { requireAuth };
}
