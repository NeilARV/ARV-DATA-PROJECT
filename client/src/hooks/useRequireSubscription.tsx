import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import AppDialog from "@/components/modals/Dialog";
import ContactContent from "@/components/modals/Contact";

export function useRequireSubscription() {
    const { isAuthenticated, canAccessApp, user } = useAuth();
    const { toast } = useToast();
    const [showContact, setShowContact] = useState(false);

    const requireSubscription = (action: () => void) => {
        if (isAuthenticated && !canAccessApp) {
            toast({
                title: "Upgrade Account",
                description: "Please request an upgrade to your account to access this area",
            });
            setShowContact(true);
            return;
        }
        action();
    };

    const ContactDialog = (
        <AppDialog open={showContact} onClose={() => setShowContact(false)} className="max-w-lg">
            {showContact && (
                <ContactContent
                    onClose={() => setShowContact(false)}
                    onSuccess={() => {
                        toast({ title: "Message Sent", description: "We will get back to you shortly." });
                    }}
                    defaultSubject="Request Access"
                    defaultMessage="I would like to request an account upgrade to access more of the ARV data application"
                    defaultFirstName={user?.firstName}
                    defaultLastName={user?.lastName}
                    defaultEmail={user?.email}
                    defaultPhone={user?.phone}
                />
            )}
        </AppDialog>
    );

    return { requireSubscription, ContactDialog, showContact, setShowContact };
}
