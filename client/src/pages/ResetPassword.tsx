import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';

import { AuthPageShell } from '@/components/auth/AuthPageShell';
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

import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';

import { apiRequest, queryClient } from '@/lib/queryClient';

const resetPasswordSchema = z
    .object({
        currentPassword: z.string().min(1, 'Temporary password is required'),
        newPassword: z.string().min(6, 'Password must be at least 6 characters'),
        confirmPassword: z.string().min(1, 'Please confirm your password'),
    })
    .refine((d) => d.newPassword === d.confirmPassword, {
        message: 'Passwords do not match',
        path: ['confirmPassword'],
    });

type ResetPasswordData = z.infer<typeof resetPasswordSchema>;

export default function ResetPassword() {
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const { isLoading, isAuthenticated, user } = useAuth();

    const form = useForm<ResetPasswordData>({
        resolver: zodResolver(resetPasswordSchema),
        defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
    });

    useEffect(() => {
        if (isLoading) return;
        if (!isAuthenticated) {
            setLocation('/login');
        } else if (user && !user.mustResetPassword) {
            setLocation('/');
        }
    }, [isLoading, isAuthenticated, user, setLocation]);

    const resetMutation = useMutation({
        mutationFn: async (data: ResetPasswordData) => {
            const response = await apiRequest('PATCH', '/api/auth/me/password', {
                currentPassword: data.currentPassword,
                newPassword: data.newPassword,
            });
            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
            toast({
                title: 'Password updated',
                description: 'Your new password is set. Welcome back!',
            });
            form.reset();
            setLocation('/');
        },
        onError: (error: any) => {
            toast({
                title: 'Could not update password',
                description: error.message?.replace(/^\d+:\s*/, '') || 'Please try again.',
                variant: 'destructive',
            });
        },
    });

    return (
        <AuthPageShell
            title="Set a new password"
            description="Enter the temporary password from your email, then choose a new one."
        >
            <Form {...form}>
                <form
                    onSubmit={form.handleSubmit((d) => resetMutation.mutate(d))}
                    className="space-y-4"
                >
                    <FormField
                        control={form.control}
                        name="currentPassword"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Temporary Password</FormLabel>
                                <FormControl>
                                    <Input
                                        type="password"
                                        placeholder="From your email"
                                        {...field}
                                        data-testid="input-reset-current"
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
                                        data-testid="input-reset-new"
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
                                        placeholder="Re-enter your new password"
                                        {...field}
                                        data-testid="input-reset-confirm"
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <Button
                        type="submit"
                        className="w-full"
                        disabled={resetMutation.isPending}
                        data-testid="button-reset-submit"
                    >
                        {resetMutation.isPending ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Updating...
                            </>
                        ) : (
                            'Update Password'
                        )}
                    </Button>
                </form>
            </Form>
        </AuthPageShell>
    );
}
