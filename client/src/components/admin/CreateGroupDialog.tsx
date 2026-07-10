import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import AppDialog from '@/components/modals/Dialog';
import { DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { parseApiError } from '@/utils/apiError';

type CreateGroupDialogProps = {
    open: boolean;
    onClose: () => void;
};

/** Dialog to create an operator group (name + optional description). */
export default function CreateGroupDialog({ open, onClose }: CreateGroupDialogProps) {
    const { toast } = useToast();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');

    const createMutation = useMutation({
        mutationFn: async () => {
            const res = await apiRequest('POST', '/api/groups', {
                name: name.trim(),
                description: description.trim() || undefined,
            });
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['/api/groups'] });
            toast({ title: 'Group created' });
            setName('');
            setDescription('');
            onClose();
        },
        onError: (error) =>
            toast({
                title: 'Could not create group',
                description: parseApiError(error),
                variant: 'destructive',
            }),
    });

    return (
        <AppDialog open={open} onClose={onClose} className="max-w-md">
            <DialogHeader>
                <DialogTitle>New group</DialogTitle>
                <DialogDescription>
                    Create an operator group. You can add companies and members after.
                </DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground" htmlFor="new-group-name">
                    Name
                </label>
                <Input
                    id="new-group-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Vertigo Rev"
                    maxLength={255}
                    data-testid="input-new-group-name"
                />
            </div>
            <div className="space-y-1.5">
                <label
                    className="text-sm font-medium text-foreground"
                    htmlFor="new-group-description"
                >
                    Description <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <Textarea
                    id="new-group-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Who is this operator?"
                    rows={2}
                    maxLength={1000}
                />
            </div>

            <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onClose} disabled={createMutation.isPending}>
                    Cancel
                </Button>
                <Button
                    onClick={() => createMutation.mutate()}
                    disabled={!name.trim() || createMutation.isPending}
                    data-testid="button-create-group"
                >
                    {createMutation.isPending ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Creating...
                        </>
                    ) : (
                        'Create group'
                    )}
                </Button>
            </div>
        </AppDialog>
    );
}
