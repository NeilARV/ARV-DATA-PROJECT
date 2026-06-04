import { useAuth } from '@/hooks/use-auth';
import NotificationPreferencesPanel from '@/components/profile/NotificationPreferencesPanel';

export default function EmailPreferencesTab() {
    const { user } = useAuth();

    if (!user) return null;

    return <NotificationPreferencesPanel user={user} />;
}
