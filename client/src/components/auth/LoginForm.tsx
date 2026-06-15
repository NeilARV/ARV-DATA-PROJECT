import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import { Button } from '@/components/ui/button';

import { useToast } from '@/hooks/use-toast';

import { apiRequest, queryClient } from '@/lib/queryClient';
import type { LoginFormData } from '@database/types';
import { loginSchema } from '@database/validation/users.validation';

type LoginFormProps = {
    onSuccess: () => void;
    onSwitchToSignup: () => void;
    onForgotPassword?: () => void;
};

export function LoginForm({ onSuccess, onSwitchToSignup, onForgotPassword }: LoginFormProps) {
    const { toast } = useToast();

    const form = useForm<LoginFormData>({
        resolver: zodResolver(loginSchema),
        defaultValues: { email: '', password: '' },
    });

    const loginMutation = useMutation({
        mutationFn: async (data: LoginFormData) => {
            const response = await apiRequest('POST', '/api/auth/login', data);
            return response.json();
        },
        onSuccess: () => {
            queryClient.setQueryData(['/api/admin/status'], null);
            queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
            queryClient.invalidateQueries({ queryKey: ['/api/admin/status'] });
            toast({ title: 'Welcome back!', description: "You've successfully signed in." });
            form.reset();
            onSuccess();
        },
        onError: (error: any) => {
            toast({
                title: 'Login failed',
                description: error.message || 'Invalid email or password',
                variant: 'destructive',
            });
        },
    });

    return (
        <>
            <Form {...form}>
                <form
                    onSubmit={form.handleSubmit((d) => loginMutation.mutate(d))}
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
                                        data-testid="input-login-email"
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="password"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Password</FormLabel>
                                <FormControl>
                                    <Input
                                        type="password"
                                        placeholder="Your password"
                                        {...field}
                                        data-testid="input-login-password"
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    {onForgotPassword && (
                        <div className="text-right">
                            <button
                                type="button"
                                className="text-sm text-primary hover:underline font-medium"
                                onClick={onForgotPassword}
                                data-testid="button-forgot-password"
                            >
                                Forgot password?
                            </button>
                        </div>
                    )}

                    <Button
                        type="submit"
                        className="w-full"
                        disabled={loginMutation.isPending}
                        data-testid="button-login-submit"
                    >
                        {loginMutation.isPending ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Signing in...
                            </>
                        ) : (
                            'Sign In'
                        )}
                    </Button>
                </form>
            </Form>

            <div className="text-center text-sm text-muted-foreground">
                Don't have an account?{' '}
                <button
                    type="button"
                    className="text-primary hover:underline font-medium"
                    onClick={onSwitchToSignup}
                    data-testid="button-switch-to-signup"
                >
                    Create one
                </button>
            </div>
        </>
    );
}
