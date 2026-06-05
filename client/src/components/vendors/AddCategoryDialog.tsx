import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createCategory } from '@/api/vendors.api';
import { useToast } from '@/hooks/use-toast';

type AddCategoryDialogProps = {
    open: boolean;
    onClose: () => void;
};

export function AddCategoryDialog({ open, onClose }: AddCategoryDialogProps) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');

    const queryClient = useQueryClient();
    const { toast } = useToast();

    const mutation = useMutation({
        mutationFn: () =>
            createCategory({
                name,
                description: description.trim() || null,
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['categories'] });
            toast({ title: 'Category added', description: `${name} has been added.` });
            resetForm();
            onClose();
        },
        onError: (err: Error) => {
            const message =
                err.message.includes('409') || err.message.includes('400')
                    ? err.message.replace(/^\d+:\s*/, '')
                    : 'Failed to add category.';
            toast({ title: 'Error', description: message, variant: 'destructive' });
        },
    });

    function resetForm() {
        setName('');
        setDescription('');
    }

    function handleClose() {
        if (mutation.isPending) return;
        resetForm();
        onClose();
    }

    return (
        <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Add Category</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="ac-name">
                            Name <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            id="ac-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Plumbing"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="ac-desc">Description</Label>
                        <Textarea
                            id="ac-desc"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Brief description of this category"
                            rows={3}
                        />
                    </div>

                    <p className="text-xs text-muted-foreground">
                        The category icon will default to a tag — update it by adding the icon name
                        in code.
                    </p>

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
                            {mutation.isPending ? 'Adding...' : 'Add Category'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
