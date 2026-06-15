import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, KeyRound } from 'lucide-react';

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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { useToast } from '@/hooks/use-toast';

import { apiRequest } from '@/lib/queryClient';

const changePasswordFormSchema = z
    .object({
        currentPassword: z.string().min(1, 'Current password is required'),
        newPassword: z.string().min(6, 'Password must be at least 6 characters'),
        confirmPassword: z.string().min(1, 'Please confirm your new password'),
    })
    .refine((d) => d.newPassword === d.confirmPassword, {
        message: 'Passwords do not match',
        path: ['confirmPassword'],
    });

type ChangePasswordFormData = z.infer<typeof changePasswordFormSchema>;

export function ChangePasswordCard() {
    const { toast } = useToast();

    const form = useForm<ChangePasswordFormData>({
        resolver: zodResolver(changePasswordFormSchema),
        defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
    });

    const changePasswordMutation = useMutation({
        mutationFn: async (data: ChangePasswordFormData) => {
            const response = await apiRequest('PATCH', '/api/auth/me/password', {
                currentPassword: data.currentPassword,
                newPassword: data.newPassword,
            });
            return response.json();
        },
        onSuccess: () => {
            toast({
                title: 'Password updated',
                description: 'Your password has been changed successfully.',
            });
            form.reset();
        },
        onError: (error: any) => {
            toast({
                title: 'Could not change password',
                description: error.message?.replace(/^\d+:\s*/, '') || 'Please try again.',
                variant: 'destructive',
            });
        },
    });

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                    <KeyRound className="w-5 h-5" />
                    Change Password
                </CardTitle>
                <CardDescription>Update the password you use to sign in.</CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form
                        onSubmit={form.handleSubmit((d) => changePasswordMutation.mutate(d))}
                        className="space-y-4 max-w-md"
                    >
                        <FormField
                            control={form.control}
                            name="currentPassword"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Current Password</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="password"
                                            {...field}
                                            data-testid="input-change-current"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="newPassword"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>New Password</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="password"
                                            placeholder="At least 6 characters"
                                            {...field}
                                            data-testid="input-change-new"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="confirmPassword"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Confirm New Password</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="password"
                                            {...field}
                                            data-testid="input-change-confirm"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="flex justify-end">
                            <Button
                                type="submit"
                                disabled={changePasswordMutation.isPending}
                                data-testid="button-change-password-submit"
                            >
                                {changePasswordMutation.isPending ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Updating...
                                    </>
                                ) : (
                                    'Update Password'
                                )}
                            </Button>
                        </div>
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}
