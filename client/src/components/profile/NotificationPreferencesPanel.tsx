import { useState } from 'react';
import { Edit, Save, X } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { CountySubscriptionAccordion } from '@/components/CountySubscriptionAccordion';

import { useToast } from '@/hooks/use-toast';
import type { AuthUser, NotificationPreferences, DealTypeFilter } from '@/hooks/use-auth';

import { queryClient, apiRequest } from '@/lib/queryClient';
import type { CountySubscriptionSelection } from '@database/validation/countySubscriptions.validation';

const DEFAULT_PREFS: Omit<NotificationPreferences, 'userId' | 'createdAt' | 'updatedAt'> = {
    dataAppEnabled: true,
    dealNotificationsEnabled: true,
    vendorNotificationsEnabled: false,
    analyticsEnabled: false,
    dataAppStatusFilter: [],
    dealTypeFilter: [],
};

const DEAL_TYPE_OPTIONS: { value: DealTypeFilter; label: string; description: string }[] = [
    { value: 'wholesale', label: 'Wholesale', description: 'All wholesale deals' },
    { value: 'agent', label: 'Agent', description: 'Off-market agent deals' },
    { value: 'sold', label: 'Sold', description: 'Recently sold deals' },
    { value: 'reo', label: 'REO', description: 'Bank-owned REO deals' },
];

interface Props {
    user: AuthUser;
}

function toCountySelections(
    subscriptions: AuthUser['countySubscriptions'],
): CountySubscriptionSelection[] {
    return (subscriptions ?? []).map(({ county, state }) => ({ county, state }));
}

export default function NotificationPreferencesPanel({ user }: Props) {
    const { toast } = useToast();

    const resolvedPrefs = user.notificationPreferences ?? DEFAULT_PREFS;

    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Master toggle + county subscriptions (go via PATCH /api/auth/me)
    const [masterEnabled, setMasterEnabled] = useState(user.notifications ?? true);
    const [countySelections, setCountySelections] = useState<CountySubscriptionSelection[]>(() =>
        toCountySelections(user.countySubscriptions),
    );

    // Per-app toggles and filters (go via PATCH /api/auth/me/notifications)
    const [prefs, setPrefs] = useState({
        dataAppEnabled: resolvedPrefs.dataAppEnabled,
        dealNotificationsEnabled: resolvedPrefs.dealNotificationsEnabled,
        vendorNotificationsEnabled: resolvedPrefs.vendorNotificationsEnabled,
        analyticsEnabled: resolvedPrefs.analyticsEnabled,
        dealTypeFilter: [...resolvedPrefs.dealTypeFilter] as DealTypeFilter[],
    });

    function resetToSaved() {
        setMasterEnabled(user.notifications ?? true);
        setCountySelections(toCountySelections(user.countySubscriptions));
        setPrefs({
            dataAppEnabled: resolvedPrefs.dataAppEnabled,
            dealNotificationsEnabled: resolvedPrefs.dealNotificationsEnabled,
            vendorNotificationsEnabled: resolvedPrefs.vendorNotificationsEnabled,
            analyticsEnabled: resolvedPrefs.analyticsEnabled,
            dealTypeFilter: [...resolvedPrefs.dealTypeFilter] as DealTypeFilter[],
        });
        setIsEditing(false);
    }

    function toggleDealTypeFilter(value: DealTypeFilter) {
        setPrefs((prev) => ({
            ...prev,
            dealTypeFilter: prev.dealTypeFilter.includes(value)
                ? prev.dealTypeFilter.filter((v) => v !== value)
                : [...prev.dealTypeFilter, value],
        }));
    }

    async function handleSave() {
        setIsSaving(true);
        try {
            // Always update both: master/counties and app preferences
            const [profileRes, prefsRes] = await Promise.all([
                apiRequest('PATCH', '/api/auth/me', {
                    notifications: masterEnabled,
                    countySubscriptions: countySelections,
                }),
                apiRequest('PATCH', '/api/auth/me/notifications', prefs),
            ]);

            if (!profileRes.ok || !prefsRes.ok) {
                throw new Error('Save failed');
            }

            const [profileData, prefsData] = await Promise.all([
                profileRes.json(),
                prefsRes.json(),
            ]);

            if (profileData.success && prefsData.success) {
                // Re-seed from the persisted list — the server canonicalizes (dedupe/order), so
                // the next edit session starts from what was actually saved.
                setCountySelections(toCountySelections(profileData.user.countySubscriptions));
                queryClient.setQueryData(
                    ['/api/auth/me'],
                    (old: { user: AuthUser } | undefined) => ({
                        user: {
                            ...(old?.user ?? {}),
                            ...profileData.user,
                            notificationPreferences: prefsData.preferences,
                        },
                    }),
                );
                toast({
                    title: 'Notification Preferences Saved',
                    description: 'Your notification settings have been updated.',
                });
                setIsEditing(false);
            } else {
                throw new Error('Unexpected response');
            }
        } catch {
            toast({
                title: 'Error',
                description: 'Failed to save notification preferences. Please try again.',
                variant: 'destructive',
            });
        } finally {
            setIsSaving(false);
        }
    }

    const displayMaster = isEditing ? masterEnabled : (user.notifications ?? true);

    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                    <CardTitle>Email Notification Preferences</CardTitle>
                    <CardDescription>
                        Control which email feeds you receive and for which markets.
                    </CardDescription>
                </div>
                {!isEditing && (
                    <Button variant="outline" size="base" onClick={() => setIsEditing(true)}>
                        <Edit className="w-4 h-4 mr-2" />
                        Edit
                    </Button>
                )}
            </CardHeader>
            <CardContent className="space-y-6">
                {/* ── Master toggle ── */}
                <div className="flex items-center justify-between">
                    <div>
                        <p className="profile-notification-label">
                            Turn {displayMaster ? 'Off' : 'On'} All Email Notifications
                        </p>
                        <p className="profile-notification-value">
                            {displayMaster
                                ? 'Disabling this stops all email feeds regardless of app settings below.'
                                : 'Enabling this turns on all email feeds regardless of app settings below.'}
                        </p>
                    </div>
                    <Switch
                        checked={isEditing ? masterEnabled : displayMaster}
                        disabled={!isEditing}
                        onCheckedChange={(checked) => isEditing && setMasterEnabled(checked)}
                    />
                </div>

                {displayMaster && (
                    <>
                        <div className="border-t pt-6 space-y-6">
                            {/* ── Data App ── */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="profile-notification-label">
                                            Daily Transaction Emails
                                        </p>
                                        <p className="profile-notification-value">
                                            Track all sales in your market every day
                                        </p>
                                    </div>
                                    <Switch
                                        checked={
                                            isEditing
                                                ? prefs.dataAppEnabled
                                                : resolvedPrefs.dataAppEnabled
                                        }
                                        disabled={!isEditing}
                                        onCheckedChange={(checked) =>
                                            isEditing &&
                                            setPrefs((p) => ({ ...p, dataAppEnabled: checked }))
                                        }
                                    />
                                </div>
                            </div>

                            {/* ── Deal Notifications ── */}
                            <div className="space-y-3 border-t pt-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="profile-notification-label">
                                            Wholesale Deal Notifications
                                        </p>
                                        <p className="profile-notification-value">
                                            Exclusive deals direct to your inbox for ARV clients
                                            only
                                        </p>
                                    </div>
                                    <Switch
                                        checked={
                                            isEditing
                                                ? prefs.dealNotificationsEnabled
                                                : resolvedPrefs.dealNotificationsEnabled
                                        }
                                        disabled={!isEditing}
                                        onCheckedChange={(checked) =>
                                            isEditing &&
                                            setPrefs((p) => ({
                                                ...p,
                                                dealNotificationsEnabled: checked,
                                            }))
                                        }
                                    />
                                </div>
                                {(isEditing
                                    ? prefs.dealNotificationsEnabled
                                    : resolvedPrefs.dealNotificationsEnabled) && (
                                    <div className="ml-1 space-y-2">
                                        <div className="grid grid-cols-3 gap-3">
                                            {DEAL_TYPE_OPTIONS.map(
                                                ({ value, label, description }) => (
                                                    <div key={value}>
                                                        <div className="flex items-center gap-2">
                                                            <Checkbox
                                                                id={`deal-type-${value}`}
                                                                checked={
                                                                    isEditing
                                                                        ? prefs.dealTypeFilter.includes(
                                                                              value,
                                                                          )
                                                                        : resolvedPrefs.dealTypeFilter.includes(
                                                                              value,
                                                                          )
                                                                }
                                                                disabled={!isEditing}
                                                                onCheckedChange={() =>
                                                                    isEditing &&
                                                                    toggleDealTypeFilter(value)
                                                                }
                                                            />
                                                            <label
                                                                htmlFor={`deal-type-${value}`}
                                                                className={`profile-notification-value text-foreground ${!isEditing ? 'cursor-default' : 'cursor-pointer'}`}
                                                            >
                                                                {label}
                                                            </label>
                                                        </div>
                                                        <p className="text-xs text-muted-foreground mt-1 ml-6">
                                                            {description}
                                                        </p>
                                                    </div>
                                                ),
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* ── Vendor Notifications ── */}
                            <div className="border-t pt-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="profile-notification-label">
                                            Vendor Notifications{' '}
                                            <span className="text-xs lg:text-sm text-muted-foreground font-normal">
                                                (coming soon)
                                            </span>
                                        </p>
                                        <p className="profile-notification-value">
                                            Notifications for new vendors and community posts.
                                        </p>
                                    </div>
                                    <Switch
                                        checked={
                                            isEditing
                                                ? prefs.vendorNotificationsEnabled
                                                : resolvedPrefs.vendorNotificationsEnabled
                                        }
                                        disabled={!isEditing}
                                        onCheckedChange={(checked) =>
                                            isEditing &&
                                            setPrefs((p) => ({
                                                ...p,
                                                vendorNotificationsEnabled: checked,
                                            }))
                                        }
                                    />
                                </div>
                            </div>

                            {/* ── Analytics Reports ── */}
                            <div className="border-t pt-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="profile-notification-label">
                                            Analytics Reports{' '}
                                            <span className="text-xs lg:text-sm text-muted-foreground font-normal">
                                                (coming soon)
                                            </span>
                                        </p>
                                        <p className="profile-notification-value">
                                            Periodic market summary reports for your subscribed
                                            markets.
                                        </p>
                                    </div>
                                    <Switch
                                        checked={
                                            isEditing
                                                ? prefs.analyticsEnabled
                                                : resolvedPrefs.analyticsEnabled
                                        }
                                        disabled={!isEditing}
                                        onCheckedChange={(checked) =>
                                            isEditing &&
                                            setPrefs((p) => ({ ...p, analyticsEnabled: checked }))
                                        }
                                    />
                                </div>
                            </div>
                        </div>

                        {/* ── Location Subscriptions ── */}
                        <div className="space-y-4 border-t pt-6">
                            <div>
                                <CardTitle>Location Subscriptions</CardTitle>
                                <CardDescription>
                                    Select the counties you want to receive notifications for — an
                                    MSA&apos;s header checkbox selects its whole metro. Applies to
                                    all active email feeds above.
                                </CardDescription>
                            </div>
                            <CountySubscriptionAccordion
                                selections={
                                    isEditing
                                        ? countySelections
                                        : toCountySelections(user.countySubscriptions)
                                }
                                onSelectionsChange={(next) => {
                                    if (isEditing) setCountySelections(next);
                                }}
                                disabled={!isEditing}
                            />
                        </div>
                    </>
                )}

                {isEditing && (
                    <div className="flex justify-end gap-2 pt-4 border-t">
                        <Button variant="outline" onClick={resetToSaved} disabled={isSaving}>
                            <X className="w-4 h-4 mr-2" />
                            Cancel
                        </Button>
                        <Button onClick={handleSave} disabled={isSaving}>
                            <Save className="w-4 h-4 mr-2" />
                            {isSaving ? 'Saving...' : 'Save'}
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
