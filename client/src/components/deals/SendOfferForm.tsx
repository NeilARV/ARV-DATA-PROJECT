import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';

import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

import type { AuthUser } from '@/hooks/use-auth';

import { submitOfferSchema, type SubmitOfferFormValues } from '@database/validation/deals.validation';

type SendOfferFormProps = {
    address: string;
    user: AuthUser | null;
    isLoading: boolean;
    onClose: () => void;
    onSubmit: (data: SubmitOfferFormValues) => void;
};

export default function SendOfferForm({
    address,
    user,
    isLoading,
    onClose,
    onSubmit,
}: SendOfferFormProps) {
    const form = useForm<SubmitOfferFormValues>({
        resolver: zodResolver(submitOfferSchema),
        defaultValues: {
            amount: undefined,
            firstName: user?.firstName ?? '',
            lastName: user?.lastName ?? '',
            email: user?.email ?? '',
            phone: user?.phone ?? '',
        },
    });

    useEffect(() => {
        if (user) {
            form.reset({
                amount: undefined,
                firstName: user.firstName ?? '',
                lastName: user.lastName ?? '',
                email: user.email ?? '',
                phone: user.phone ?? '',
            });
        }
    }, [user]);

    return (
        <>
            <DialogHeader>
                <DialogTitle>Send an Offer</DialogTitle>
                <DialogDescription>
                    Submit a non-binding offer on {address}. The amount you enter is shared only with
                    the person who posted this deal.
                </DialogDescription>
            </DialogHeader>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4 pt-2">
                    <FormField
                        control={form.control}
                        name="amount"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Offer Amount</FormLabel>
                                <FormControl>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                                            $
                                        </span>
                                        <Input
                                            {...field}
                                            type="text"
                                            inputMode="numeric"
                                            placeholder="350000"
                                            className="pl-7"
                                            value={field.value ?? ''}
                                            onChange={(e) =>
                                                field.onChange(e.target.value.replace(/[^0-9]/g, ''))
                                            }
                                        />
                                    </div>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <div className="grid grid-cols-2 gap-3">
                        <FormField
                            control={form.control}
                            name="firstName"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>First Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="First name" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="lastName"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Last Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Last name" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <FormField
                            control={form.control}
                            name="email"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Email</FormLabel>
                                    <FormControl>
                                        <Input type="email" placeholder="Email address" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="phone"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>
                                        Phone{' '}
                                        <span className="text-muted-foreground font-normal">
                                            (optional)
                                        </span>
                                    </FormLabel>
                                    <FormControl>
                                        <Input type="tel" placeholder="Phone number" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>

                    <div className="flex gap-2 pt-1">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                            className="flex-1"
                            disabled={isLoading}
                            size="lg"
                        >
                            Cancel
                        </Button>
                        <Button type="submit" className="flex-1" disabled={isLoading} size="lg">
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Sending...
                                </>
                            ) : (
                                'Submit Offer'
                            )}
                        </Button>
                    </div>
                </form>
            </Form>
        </>
    );
}
