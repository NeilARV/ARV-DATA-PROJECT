import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { updateUserProfileSchema } from '@database/updates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Loader2, User, Edit, Save, X, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import { formatCompanyName } from '@shared/utils/formatCompanyName';
import { formatPhoneNumber } from '@shared/utils/formatPhoneNumber';
import { COUNTIES } from '@/constants/filters.constants';
import { STATE_DEFAULT_COUNTY } from '@shared/constants/stateDefaults';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import NotificationPreferencesPanel from '@/components/profile/NotificationPreferencesPanel';
import { RMCard } from '@/components/profile/RMCard';
import { AvatarUpload } from '@/components/profile/AvatarUpload';

const UNIQUE_STATES = Array.from(new Set(COUNTIES.map((c) => c.state))).sort();

interface UserMembership {
    companyId: string;
    companyName: string;
    role: 'owner' | 'member';
    isPrimary: boolean;
    joinedAt: string;
}

function MyCompaniesCard() {
    const { data, isLoading } = useQuery<{ data: UserMembership[]; count: number }>({
        queryKey: ['/api/users/me/company-memberships'],
        queryFn: async () => {
            const res = await fetch('/api/users/me/company-memberships', {
                credentials: 'include',
            });
            if (!res.ok) throw new Error('Failed to fetch memberships');
            return res.json();
        },
    });

    const memberships = data?.data ?? [];

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Building2 className="w-5 h-5" />
                    My Companies
                </CardTitle>
                <CardDescription>Companies you have claimed on the platform.</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading...
                    </div>
                ) : memberships.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">
                        You haven't claimed any companies yet. Find a company in the directory and
                        click "Claim This Company."
                    </p>
                ) : (
                    <div className="space-y-3">
                        {memberships.map((m) => (
                            <div
                                key={m.companyId}
                                className="flex items-center justify-between p-3 rounded-md border border-border bg-muted/30"
                            >
                                <div>
                                    <div className="font-medium text-sm text-foreground">
                                        {formatCompanyName(m.companyName)}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-0.5 capitalize">
                                        {m.role}
                                        {m.isPrimary ? ' · Primary' : ''}
                                        {' · Joined '}
                                        {format(new Date(m.joinedAt), 'MMM d, yyyy')}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export default function Profile() {
    const [, setLocation] = useLocation();
    const { user, isLoading, subscription, role } = useAuth();
    const { toast } = useToast();
    const [isEditing, setIsEditing] = useState(false);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        county: 'San Diego',
        state: 'CA',
    });

    useEffect(() => {
        if (user) {
            const phone = user.phone
                ? user.phone.includes('(')
                    ? user.phone
                    : formatPhoneNumber(user.phone)
                : '';

            setFormData({
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phone,
                county: user.county ?? 'San Diego',
                state: user.state ?? 'CA',
            });
        }
    }, [user]);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!user) {
        return (
            <div className="container mx-auto py-8 px-4 max-w-4xl">
                <Card>
                    <CardHeader>
                        <CardTitle>Profile</CardTitle>
                        <CardDescription>
                            You must be logged in to view your profile
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-col items-center justify-center py-12 gap-4">
                            <User className="w-16 h-16 text-muted-foreground" />
                            <p className="text-muted-foreground">
                                Please log in to view your profile
                            </p>
                            <Button onClick={() => setLocation('/')}>Go to Home</Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="container mx-auto py-8 px-4 max-w-4xl">
            <div className="mb-8">
                <Button variant="ghost" onClick={() => setLocation('/')} className="mb-4">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Properties
                </Button>
                <h1 className="text-3xl font-bold mb-2">Profile Settings</h1>
                <p className="text-muted-foreground">View and manage your account information</p>
            </div>

            <div className="space-y-6">
                {/* ── Account Information ── */}
                <Card>
                    <CardHeader className="flex flex-row items-start justify-between gap-4">
                        <div>
                            <CardTitle>Account Information</CardTitle>
                            <CardDescription>Your personal account details</CardDescription>
                        </div>
                        {!isEditing && (
                            <Button
                                variant="outline"
                                size="base"
                                onClick={() => setIsEditing(true)}
                            >
                                <Edit className="w-4 h-4 mr-2" />
                                Edit
                            </Button>
                        )}
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-6">
                            {/* ── Profile Photo ── */}
                            <div className="pb-6 border-b">
                                <p className="profile-field-label mb-3">Profile Photo</p>
                                <AvatarUpload profileImageUrl={user.profileImageUrl} />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="profile-field-label">First Name</label>
                                    <Input
                                        type="text"
                                        value={isEditing ? formData.firstName : user.firstName}
                                        onChange={(e) => {
                                            setFormData({ ...formData, firstName: e.target.value });
                                            if (fieldErrors.firstName) {
                                                setFieldErrors((prev) => {
                                                    const next = { ...prev };
                                                    delete next.firstName;
                                                    return next;
                                                });
                                            }
                                        }}
                                        disabled={!isEditing}
                                        className={`mt-1 ${fieldErrors.firstName ? 'border-destructive' : ''}`}
                                        aria-invalid={!!fieldErrors.firstName}
                                    />
                                    {fieldErrors.firstName && (
                                        <p className="text-sm text-destructive mt-1" role="alert">
                                            {fieldErrors.firstName}
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label className="profile-field-label">Last Name</label>
                                    <Input
                                        type="text"
                                        value={isEditing ? formData.lastName : user.lastName}
                                        onChange={(e) => {
                                            setFormData({ ...formData, lastName: e.target.value });
                                            if (fieldErrors.lastName) {
                                                setFieldErrors((prev) => {
                                                    const next = { ...prev };
                                                    delete next.lastName;
                                                    return next;
                                                });
                                            }
                                        }}
                                        disabled={!isEditing}
                                        className={`mt-1 ${fieldErrors.lastName ? 'border-destructive' : ''}`}
                                        aria-invalid={!!fieldErrors.lastName}
                                    />
                                    {fieldErrors.lastName && (
                                        <p className="text-sm text-destructive mt-1" role="alert">
                                            {fieldErrors.lastName}
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label className="profile-field-label">Email</label>
                                    <Input
                                        type="email"
                                        value={isEditing ? formData.email : user.email}
                                        onChange={(e) => {
                                            setFormData({ ...formData, email: e.target.value });
                                            if (fieldErrors.email) {
                                                setFieldErrors((prev) => {
                                                    const next = { ...prev };
                                                    delete next.email;
                                                    return next;
                                                });
                                            }
                                        }}
                                        disabled={!isEditing}
                                        className={`mt-1 ${fieldErrors.email ? 'border-destructive' : ''}`}
                                        aria-invalid={!!fieldErrors.email}
                                    />
                                    {fieldErrors.email && (
                                        <p className="text-sm text-destructive mt-1" role="alert">
                                            {fieldErrors.email}
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label className="profile-field-label">Phone</label>
                                    <Input
                                        type="tel"
                                        placeholder="(555) 123-4567"
                                        value={
                                            isEditing
                                                ? formData.phone
                                                : user.phone?.includes('(')
                                                  ? user.phone
                                                  : formatPhoneNumber(user.phone || '')
                                        }
                                        onChange={(e) => {
                                            if (isEditing) {
                                                const formatted = formatPhoneNumber(e.target.value);
                                                setFormData({ ...formData, phone: formatted });
                                                if (fieldErrors.phone) {
                                                    setFieldErrors((prev) => {
                                                        const next = { ...prev };
                                                        delete next.phone;
                                                        return next;
                                                    });
                                                }
                                            }
                                        }}
                                        disabled={!isEditing}
                                        className={`mt-1 ${fieldErrors.phone ? 'border-destructive' : ''}`}
                                        aria-invalid={!!fieldErrors.phone}
                                        maxLength={14}
                                    />
                                    {fieldErrors.phone && (
                                        <p className="text-sm text-destructive mt-1" role="alert">
                                            {fieldErrors.phone}
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label className="profile-field-label">Account Level</label>
                                    <p className="profile-field-value mt-1">
                                        {subscription
                                            ? subscription.charAt(0).toUpperCase() +
                                              subscription.slice(1)
                                            : 'Free'}
                                    </p>
                                </div>
                                <div>
                                    <label className="profile-field-label">Member Since</label>
                                    <p className="profile-field-value mt-1">
                                        {format(
                                            new Date(user.createdAt),
                                            "MMMM d, yyyy 'at' h:mm a",
                                        )}
                                    </p>
                                </div>
                                {role && (
                                    <div>
                                        <label className="profile-field-label">ARV Role</label>
                                        <p className="profile-field-value mt-1">
                                            {role === 'relationship-manager'
                                                ? 'Relationship Manager'
                                                : role.charAt(0).toUpperCase() + role.slice(1)}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* ── Preferred Market ── */}
                            <div className="space-y-4 pt-6 border-t">
                                <div>
                                    <CardTitle className="text-lg">Preferred Market</CardTitle>
                                    <CardDescription>
                                        The county and state you'd like to see property data for —
                                        this is a data preference, not your physical location.
                                    </CardDescription>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="profile-field-label">County</label>
                                        {isEditing ? (
                                            <Select
                                                value={formData.county}
                                                onValueChange={(value) =>
                                                    setFormData({ ...formData, county: value })
                                                }
                                            >
                                                <SelectTrigger className="mt-1">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="z-[10000]">
                                                    {COUNTIES.filter(
                                                        (c) => c.state === formData.state,
                                                    ).map((c) => (
                                                        <SelectItem key={c.county} value={c.county}>
                                                            {c.county}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        ) : (
                                            <p className="profile-field-value mt-1">
                                                {user.county ?? '—'}
                                            </p>
                                        )}
                                    </div>
                                    <div>
                                        <label className="profile-field-label">State</label>
                                        {isEditing ? (
                                            <Select
                                                value={formData.state}
                                                onValueChange={(value) => {
                                                    const defaultCounty =
                                                        STATE_DEFAULT_COUNTY[value] ?? '';
                                                    setFormData({
                                                        ...formData,
                                                        state: value,
                                                        county: defaultCounty,
                                                    });
                                                }}
                                            >
                                                <SelectTrigger className="mt-1">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="z-[10000]">
                                                    {UNIQUE_STATES.map((s) => (
                                                        <SelectItem key={s} value={s}>
                                                            {s}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        ) : (
                                            <p className="profile-field-value mt-1">
                                                {user.state ?? '—'}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {isEditing && (
                                <div className="flex justify-end gap-2 pt-4 border-t">
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            setFieldErrors({});
                                            const phone = user.phone
                                                ? user.phone.includes('(')
                                                    ? user.phone
                                                    : formatPhoneNumber(user.phone)
                                                : '';
                                            setFormData({
                                                firstName: user.firstName,
                                                lastName: user.lastName,
                                                email: user.email,
                                                phone,
                                                county: user.county ?? 'San Diego',
                                                state: user.state ?? 'CA',
                                            });
                                            setIsEditing(false);
                                        }}
                                    >
                                        <X className="w-4 h-4 mr-2" />
                                        Cancel
                                    </Button>
                                    <Button
                                        onClick={async () => {
                                            setFieldErrors({});
                                            const updateData = {
                                                firstName: formData.firstName.trim(),
                                                lastName: formData.lastName.trim(),
                                                email: formData.email.trim(),
                                                phone: formData.phone,
                                                county: formData.county || null,
                                                state: formData.state || null,
                                            };

                                            const validation =
                                                updateUserProfileSchema.safeParse(updateData);
                                            if (!validation.success) {
                                                const flattened = validation.error.flatten();
                                                const errors: Record<string, string> = {};
                                                for (const [k, v] of Object.entries(
                                                    flattened.fieldErrors,
                                                )) {
                                                    if (Array.isArray(v) && v[0]) errors[k] = v[0];
                                                }
                                                setFieldErrors(errors);
                                                toast({
                                                    title: 'Invalid profile data',
                                                    description:
                                                        'Please fix the errors below and try again.',
                                                    variant: 'destructive',
                                                });
                                                return;
                                            }

                                            try {
                                                const response = await apiRequest(
                                                    'PATCH',
                                                    '/api/auth/me',
                                                    validation.data,
                                                );
                                                const result = await response.json();

                                                if (result.success && result.user) {
                                                    queryClient.setQueryData(
                                                        ['/api/auth/me'],
                                                        (
                                                            old: { user: typeof user } | undefined,
                                                        ) => ({
                                                            user: {
                                                                ...(old?.user ?? {}),
                                                                ...result.user,
                                                                county: formData.county || null,
                                                                state: formData.state || null,
                                                            },
                                                        }),
                                                    );
                                                    toast({
                                                        title: 'Profile Updated',
                                                        description:
                                                            'Your profile has been updated successfully.',
                                                    });
                                                    setIsEditing(false);
                                                } else {
                                                    throw new Error('Failed to update profile');
                                                }
                                            } catch (error: unknown) {
                                                console.error('Error updating profile:', error);
                                                toast({
                                                    title: 'Error',
                                                    description:
                                                        error instanceof Error
                                                            ? error.message
                                                            : 'Failed to update profile. Please try again.',
                                                    variant: 'destructive',
                                                });
                                            }
                                        }}
                                    >
                                        <Save className="w-4 h-4 mr-2" />
                                        Save
                                    </Button>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* ── My Companies ── */}
                <MyCompaniesCard />

                {/* ── Notification Preferences + MSA Subscriptions ── */}
                <NotificationPreferencesPanel user={user} />

                {/* ── Relationship Manager ── */}
                {user.relationshipManager && <RMCard {...user.relationshipManager} />}
            </div>
        </div>
    );
}
