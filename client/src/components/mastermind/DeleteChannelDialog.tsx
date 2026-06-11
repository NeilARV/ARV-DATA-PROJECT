import { useMutation, useQueryClient } from '@tanstack/react-query';

import AppDialog from '@/components/modals/Dialog';
import ConfirmationContent from '@/components/modals/Confirmation';

import { useToast } from '@/hooks/use-toast';

import type { ChannelSummary } from '@/types/mastermind';

import { deleteChannel } from '@/api/mastermind.api';

type DeleteChannelDialogProps = {
    open: boolean;
    onClose: () => void;
    channel: ChannelSummary;
    // Called after a successful delete so the page can redirect away if this channel was open.
    onDeleted?: () => void;
};

export function DeleteChannelDialog({ open, onClose, channel, onDeleted }: DeleteChannelDialogProps) {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    const mutation = useMutation({
        mutationFn: () => deleteChannel(channel.id),
        // Await the refetch before redirecting so the page acts on a list without the deleted
        // channel — avoids landing back on the now-dead channel via the stale list.
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['/api/channels'] });
            toast({ title: 'Channel deleted', description: `#${channel.name} has been removed.` });
            onDeleted?.();
            onClose();
        },
        onError: () => {
            toast({
                title: 'Error',
                description: 'Failed to delete channel.',
                variant: 'destructive',
            });
        },
    });

    return (
        <AppDialog open={open} onClose={onClose} className="sm:max-w-sm">
            <ConfirmationContent
                onClose={onClose}
                onConfirm={() => mutation.mutate()}
                title="Delete Channel"
                description={`Delete #${channel.name}? This permanently removes the channel and all of its messages. This cannot be undone.`}
                confirmText="Delete"
                cancelText="Cancel"
                variant="destructive"
                isLoading={mutation.isPending}
            />
        </AppDialog>
    );
}
