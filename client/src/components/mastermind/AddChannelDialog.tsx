import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

import { useToast } from '@/hooks/use-toast';

import { createChannel } from '@/api/mastermind.api';

type AddChannelDialogProps = {
    open: boolean;
    onClose: () => void;
};

// Channel names are lowercase slugs (e.g. "san-diego-market"); shape input as the user types.
function toChannelSlug(value: string): string {
    return value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export function AddChannelDialog({ open, onClose }: AddChannelDialogProps) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');

    const queryClient = useQueryClient();
    const { toast } = useToast();

    const mutation = useMutation({
        mutationFn: () => createChannel({ name, description: description.trim() || null }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['/api/channels'] });
            toast({ title: 'Channel created', description: `#${name} has been added.` });
            resetForm();
            onClose();
        },
        onError: (err: Error) => {
            const message =
                err.message.includes('409') || err.message.includes('400')
                    ? err.message.replace(/^\d+:\s*/, '')
                    : 'Failed to create channel.';
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
                    <DialogTitle>Add Channel</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="add-channel-name">
                            Name <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            id="add-channel-name"
                            value={name}
                            onChange={(e) => setName(toChannelSlug(e.target.value))}
                            placeholder="e.g. first-time-flippers"
                        />
                        <p className="text-xs text-muted-foreground">
                            Lowercase letters, numbers, and hyphens. Shown as #{name || 'channel-name'}.
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="add-channel-desc">Description</Label>
                        <Textarea
                            id="add-channel-desc"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="What is this channel about?"
                            rows={3}
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={handleClose} disabled={mutation.isPending}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => mutation.mutate()}
                            disabled={!name.trim() || mutation.isPending}
                        >
                            {mutation.isPending ? 'Creating...' : 'Create Channel'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
