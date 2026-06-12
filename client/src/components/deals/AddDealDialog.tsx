import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { dealFormSchema } from '@database/inserts/deals.insert';
import type { DealFormValues } from '@database/inserts/deals.insert';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { useAuth } from '@/hooks/use-auth';
import { Textarea } from '@/components/ui/textarea';
import AppDialog from '@/components/modals/Dialog';
import ContactContent from '@/components/modals/Contact';
import DealFormFields, { ADD_DEAL_TYPES } from '@/components/deals/DealFormFields';

type AddDealDialogProps = {
    open: boolean;
    onClose: () => void;
};

export default function AddDealDialog({ open, onClose }: AddDealDialogProps) {
    const { toast } = useToast();
    const { user, isAdmin, isOwner, isRelationshipManager } = useAuth();
    const canEditAdminNotes = isAdmin || isOwner;
    const canEditPrivilegedFields = isAdmin || isOwner || isRelationshipManager;
    const [showContact, setShowContact] = useState(false);
    const [links, setLinks] = useState<string[]>([]);
    const [photosUrl, setPhotosUrl] = useState('');

    const form = useForm<DealFormValues>({
        resolver: zodResolver(dealFormSchema),
        defaultValues: {
            address: '',
            city: '',
            state: '',
            zipCode: '',
            msaId: undefined,
            price: undefined,
            potentialARV: undefined,
            showingDate: undefined,
            showingTimeStr: undefined,
            showingAmPm: 'AM' as const,
            estimatedBudget: undefined,
            dealType: 'agent',
            beds: undefined,
            baths: undefined,
            sqft: undefined,
            propertyType: undefined,
            notes: '',
            adminNotes: '',
            sendNotifications: true,
            isArvExclusive: false,
            onBehalfOfEmail: undefined,
        },
    });

    const postDeal = useMutation({
        mutationFn: async (data: DealFormValues) => {
            const res = await apiRequest('POST', '/api/deals', {
                address: data.address?.trim() || undefined,
                city: data.city,
                state: data.state,
                zipCode: data.zipCode,
                msaId: data.msaId,
                userId: user?.id,
                dealType: data.dealType,
                price: data.price,
                potentialARV: data.potentialARV,
                showingTime: (() => {
                    if (!data.showingDate) return undefined;
                    const [m, d, y] = data.showingDate.split('/');
                    let hh = data.showingTimeStr
                        ? parseInt(data.showingTimeStr.split(':')[0], 10)
                        : 0;
                    const mm = data.showingTimeStr
                        ? (data.showingTimeStr.split(':')[1] ?? '00')
                        : '00';
                    if (data.showingAmPm === 'PM' && hh < 12) hh += 12;
                    if (data.showingAmPm === 'AM' && hh === 12) hh = 0;
                    return `${y}-${m}-${d}T${String(hh).padStart(2, '0')}:${mm}:00`;
                })(),
                estimatedBudget: data.estimatedBudget ?? undefined,
                beds: data.beds,
                baths: data.baths,
                sqft: data.sqft,
                propertyType: data.propertyType,
                notes: data.notes?.trim() || undefined,
                adminNotes: data.adminNotes?.trim() || undefined,
                photosUrl: photosUrl.trim() || undefined,
                sendNotifications: data.sendNotifications,
                links: links.filter((u) => {
                    try {
                        new URL(u);
                        return true;
                    } catch {
                        return false;
                    }
                }),
                isArvExclusive: data.isArvExclusive,
                onBehalfOfEmail: data.onBehalfOfEmail || undefined,
            });
            return res.json();
        },
        onSuccess: () => {
            toast({ title: 'Deal Posted', description: 'Your deal has been added to the feed.' });
            queryClient.invalidateQueries({ queryKey: ['/api/deals'] });
            form.reset();
            setLinks([]);
            setPhotosUrl('');
            onClose();
        },
        onError: (err: any) => {
            const is403 = typeof err?.message === 'string' && err.message.startsWith('403:');
            if (is403) {
                toast({
                    title: 'Upgrade Required',
                    description: 'Upgrade your account to access this feature.',
                    variant: 'destructive',
                    action: (
                        <ToastAction altText="Contact us" onClick={() => setShowContact(true)}>
                            Contact Us
                        </ToastAction>
                    ),
                });
            } else {
                toast({
                    title: 'Error',
                    description: err.message || 'Failed to post deal',
                    variant: 'destructive',
                });
            }
        },
    });

    const handleClose = () => {
        if (postDeal.isPending) return;
        form.reset();
        setLinks([]);
        setPhotosUrl('');
        onClose();
    };

    return (
        <>
            <AppDialog
                open={open}
                onClose={handleClose}
                className="max-w-[350px] sm:max-w-lg lg:max-w-2xl flex flex-col max-h-[90dvh] overflow-hidden"
            >
                <DialogHeader className="shrink-0">
                    <DialogTitle>Post a Deal</DialogTitle>
                    <DialogDescription>
                        Share a wholesale or agent deal, where other investors can browse listings
                        and request more information
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form
                        onSubmit={form.handleSubmit((d) => postDeal.mutate(d))}
                        className="flex flex-col flex-1 min-h-0 mt-4"
                    >
                        <div className="dialog-scrollable-body">
                            <DealFormFields
                                control={form.control}
                                dealTypes={ADD_DEAL_TYPES}
                                links={links}
                                onLinksChange={setLinks}
                                photosUrl={photosUrl}
                                onPhotosUrlChange={setPhotosUrl}
                            />

                            <FormField
                                control={form.control}
                                name="sendNotifications"
                                render={({ field }) => (
                                    <FormItem className="flex items-center gap-2 space-y-0">
                                        <FormControl>
                                            <Checkbox
                                                checked={field.value}
                                                onCheckedChange={field.onChange}
                                            />
                                        </FormControl>
                                        <FormLabel className="font-normal cursor-pointer">
                                            Send notification email
                                        </FormLabel>
                                    </FormItem>
                                )}
                            />

                            {(canEditAdminNotes || canEditPrivilegedFields) && (
                                <div className="space-y-4 pt-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                                            Admin Only
                                        </span>
                                        <div className="flex-1 h-px bg-border" />
                                    </div>

                                    {canEditAdminNotes && (
                                        <FormField
                                            control={form.control}
                                            name="adminNotes"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Internal Note</FormLabel>
                                                    <FormControl>
                                                        <Textarea
                                                            {...field}
                                                            placeholder="Internal notes visible only to admins and owners..."
                                                            className="resize-none text-sm"
                                                            rows={2}
                                                        />
                                                    </FormControl>
                                                </FormItem>
                                            )}
                                        />
                                    )}

                                    {canEditPrivilegedFields && (
                                        <>
                                            <FormField
                                                control={form.control}
                                                name="onBehalfOfEmail"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>On Behalf Of</FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                {...field}
                                                                type="email"
                                                                placeholder="client@example.com"
                                                                value={field.value ?? ''}
                                                            />
                                                        </FormControl>
                                                        <p className="text-xs text-muted-foreground">
                                                            Client email — receives contact requests
                                                            instead of the poster
                                                        </p>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />

                                            <FormField
                                                control={form.control}
                                                name="isArvExclusive"
                                                render={({ field }) => (
                                                    <FormItem className="flex items-center gap-2 space-y-0">
                                                        <FormControl>
                                                            <Checkbox
                                                                checked={field.value}
                                                                onCheckedChange={field.onChange}
                                                            />
                                                        </FormControl>
                                                        <FormLabel className="font-normal cursor-pointer">
                                                            ARV Exclusive deal
                                                        </FormLabel>
                                                    </FormItem>
                                                )}
                                            />
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="flex gap-2 pt-2 shrink-0">
                            <Button
                                type="button"
                                variant="outline"
                                className="flex-1"
                                onClick={handleClose}
                                disabled={postDeal.isPending}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                className="flex-1"
                                disabled={postDeal.isPending || !user?.id}
                            >
                                {postDeal.isPending ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Posting...
                                    </>
                                ) : (
                                    'Post Deal'
                                )}
                            </Button>
                        </div>
                    </form>
                </Form>
            </AppDialog>

            <AppDialog
                nested
                open={showContact}
                onClose={() => setShowContact(false)}
                className="max-w-lg"
            >
                {showContact && (
                    <ContactContent
                        onClose={() => setShowContact(false)}
                        onSuccess={() => {
                            toast({
                                title: 'Request Received',
                                description: 'We will get back to you shortly.',
                            });
                        }}
                        defaultSubject="Upgrade Account"
                        defaultFirstName={user?.firstName}
                        defaultLastName={user?.lastName}
                        defaultEmail={user?.email}
                        defaultPhone={user?.phone}
                        defaultMessage="I would like to upgrade my account to access the deal feature."
                    />
                )}
            </AppDialog>
        </>
    );
}
