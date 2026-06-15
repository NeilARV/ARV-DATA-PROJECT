import { useState } from 'react';
import { useLocation } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, MailCheck } from 'lucide-react';

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

import { apiRequest } from '@/lib/queryClient';
import { forgotPasswordSchema, type ForgotPasswordData } from '@database/validation/users.validation';

export default function ForgotPassword() {
    const [, setLocation] = useLocation();
    const [submitted, setSubmitted] = useState(false);

    const form = useForm<ForgotPasswordData>({
        resolver: zodResolver(forgotPasswordSchema),
        defaultValues: { email: '' },
    });

    const forgotMutation = useMutation({
        mutationFn: async (data: ForgotPasswordData) => {
            const response = await apiRequest('POST', '/api/auth/forgot-password', data);
            return response.json();
        },
        onSuccess: () => setSubmitted(true),
    });

    if (submitted) {
        return (
            <AuthPageShell
                title="Check your email"
                description="If an account exists for that email, we've sent a temporary password to sign in."
            >
                <div className="flex flex-col items-center gap-4 py-2 text-center">
                    <MailCheck className="w-10 h-10 text-primary" />
                    <Button className="w-full" onClick={() => setLocation('/login')}>
                        Back to Sign In
                    </Button>
                </div>
            </AuthPageShell>
        );
    }

    return (
        <AuthPageShell
            title="Reset your password"
            description="Enter your email and we'll send you a temporary password."
        >
            <Form {...form}>
                <form
                    onSubmit={form.handleSubmit((d) => forgotMutation.mutate(d))}
                    className="space-y-4"
                >
                    <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Email</FormLabel>
                                <FormControl>
                                    <Input
                                        type="email"
                                        placeholder="john@example.com"
                                        {...field}
                                        data-testid="input-forgot-email"
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <Button
                        type="submit"
                        className="w-full"
                        disabled={forgotMutation.isPending}
                        data-testid="button-forgot-submit"
                    >
                        {forgotMutation.isPending ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Sending...
                            </>
                        ) : (
                            'Send temporary password'
                        )}
                    </Button>
                </form>
            </Form>

            <div className="text-center text-sm text-muted-foreground">
                Remembered it?{' '}
                <button
                    type="button"
                    className="text-primary hover:underline font-medium"
                    onClick={() => setLocation('/login')}
                    data-testid="button-back-to-login"
                >
                    Sign in
                </button>
            </div>
        </AuthPageShell>
    );
}
