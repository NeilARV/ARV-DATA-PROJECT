import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateCategory } from '@/api/vendors.api';
import { useToast } from '@/hooks/use-toast';
import type { Category } from '@/types/vendors';

type EditCategoryDialogProps = {
    open: boolean;
    onClose: () => void;
    category: Category;
};

export function EditCategoryDialog({ open, onClose, category }: EditCategoryDialogProps) {
    const [name, setName] = useState(category.name);
    const [description, setDescription] = useState(category.description ?? '');

    const queryClient = useQueryClient();
    const { toast } = useToast();

    const mutation = useMutation({
        mutationFn: () =>
            updateCategory(category.id, {
                name,
                description: description.trim() || null,
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['categories'] });
            // Vendor and post payloads embed category chips — refresh them so the renamed category updates everywhere
            queryClient.invalidateQueries({ queryKey: ['vendors'] });
            queryClient.invalidateQueries({ queryKey: ['vendor'] });
            queryClient.invalidateQueries({ queryKey: ['vendors-for-post'] });
            queryClient.invalidateQueries({ queryKey: ['posts'] });
            toast({ title: 'Category updated', description: 'Changes have been saved.' });
            onClose();
        },
        onError: (err: Error) => {
            const message =
                err.message.includes('409') || err.message.includes('400')
                    ? err.message.replace(/^\d+:\s*/, '')
                    : 'Failed to update category.';
            toast({ title: 'Error', description: message, variant: 'destructive' });
        },
    });

    function handleClose() {
        if (mutation.isPending) return;
        setName(category.name);
        setDescription(category.description ?? '');
        onClose();
    }

    return (
        <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Edit Category</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="ec-name">
                            Name <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            id="ec-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Plumbing"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="ec-desc">Description</Label>
                        <Textarea
                            id="ec-desc"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Brief description of this category"
                            rows={3}
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button
                            variant="outline"
                            onClick={handleClose}
                            disabled={mutation.isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={() => mutation.mutate()}
                            disabled={!name.trim() || mutation.isPending}
                        >
                            {mutation.isPending ? 'Saving...' : 'Save'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
