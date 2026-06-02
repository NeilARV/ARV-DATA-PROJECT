import { useState } from 'react';
import { DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
import { manualPropertyEntrySchema } from '@database/inserts/properties.insert';
import type { ManualPropertyEntry } from '@database/types';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { UploadDialogProps } from '@/types/general';

type UploadContentProps = Omit<UploadDialogProps, 'open' | 'onClose'> & {
    onClose: () => void;
};

export function UploadPropertyDialog({ onClose, onSuccess }: UploadContentProps) {
    const { toast } = useToast();
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<ManualPropertyEntry>({
        resolver: zodResolver(manualPropertyEntrySchema),
        defaultValues: { address: '', city: '', state: '', zipCode: '' },
    });

    const handleSubmit = async (data: ManualPropertyEntry) => {
        setIsSubmitting(true);
        setError(null);
        try {
            await apiRequest('POST', '/api/properties', {
                address: data.address,
                city: data.city,
                state: data.state,
                zipCode: data.zipCode,
            });
            toast({
                title: 'Property Added',
                description: 'Property has been successfully added to the database.',
            });
            queryClient.invalidateQueries({ queryKey: ['/api/properties'] });
            form.reset();
            onSuccess?.();
            onClose();
        } catch (err: any) {
            const msg = err.message || 'Failed to add property';
            setError(msg);
            toast({ title: 'Error', description: msg, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            <DialogHeader>
                <DialogTitle>Add Single Property</DialogTitle>
            </DialogHeader>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <FormField
                            control={form.control}
                            name="address"
                            render={({ field }) => (
                                <FormItem className="col-span-2">
                                    <FormLabel>Address *</FormLabel>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            placeholder="123 Main St"
                                            required
                                            data-testid="input-address"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="city"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>City *</FormLabel>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            placeholder="San Diego"
                                            required
                                            data-testid="input-city"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="state"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>State *</FormLabel>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            placeholder="CA"
                                            maxLength={2}
                                            required
                                            data-testid="input-state"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="zipCode"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Zip Code *</FormLabel>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            placeholder="92126"
                                            maxLength={5}
                                            required
                                            data-testid="input-manual-zipcode"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>

                    {error && (
                        <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    <div className="flex gap-2 pt-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                            className="flex-1"
                            disabled={isSubmitting}
                            data-testid="button-cancel-manual"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            className="flex-1"
                            disabled={isSubmitting}
                            data-testid="button-submit-manual"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Adding...
                                </>
                            ) : (
                                'Add Property'
                            )}
                        </Button>
                    </div>
                </form>
            </Form>
        </>
    );
}
