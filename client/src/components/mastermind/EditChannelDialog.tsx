import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

import { useToast } from '@/hooks/use-toast';

import type { ChannelSummary } from '@/types/mastermind';

import { updateChannel } from '@/api/mastermind.api';

type EditChannelDialogProps = {
    open: boolean;
    onClose: () => void;
    channel: ChannelSummary;
    // Called after a successful rename so the page can follow the active channel's new URL.
    onRenamed?: (newName: string) => void;
};

// Channel names are lowercase slugs (e.g. "san-diego-market"); shape input as the user types.
function toChannelSlug(value: string): string {
    return value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export function EditChannelDialog({ open, onClose, channel, onRenamed }: EditChannelDialogProps) {
    const [name, setName] = useState(channel.name);
    const [description, setDescription] = useState(channel.description ?? '');

    const queryClient = useQueryClient();
    const { toast } = useToast();

    const mutation = useMutation({
        mutationFn: () =>
            updateChannel(channel.id, { name, description: description.trim() || null }),
        // Await the refetch before navigating so the page doesn't briefly see a stale list
        // (which would bounce the user to the first channel instead of the renamed one).
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['/api/channels'] });
            toast({ title: 'Channel updated', description: 'Changes have been saved.' });
            if (name !== channel.name) onRenamed?.(name);
            onClose();
        },
        onError: (err: Error) => {
            const message =
                err.message.includes('409') || err.message.includes('400')
                    ? err.message.replace(/^\d+:\s*/, '')
                    : 'Failed to update channel.';
            toast({ title: 'Error', description: message, variant: 'destructive' });
        },
    });

    function handleClose() {
        if (mutation.isPending) return;
        setName(channel.name);
        setDescription(channel.description ?? '');
        onClose();
    }

    return (
        <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Edit Channel</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="edit-channel-name">
                            Name <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            id="edit-channel-name"
                            value={name}
                            onChange={(e) => setName(toChannelSlug(e.target.value))}
                            placeholder="e.g. first-time-flippers"
                        />
                        <p className="text-xs text-muted-foreground">
                            Lowercase letters, numbers, and hyphens. Shown as #{name || 'channel-name'}.
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="edit-channel-desc">Description</Label>
                        <Textarea
                            id="edit-channel-desc"
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
                            {mutation.isPending ? 'Saving...' : 'Save'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
