import { Loader2 } from 'lucide-react';

import { DmHeader } from '@/components/mastermind/DmHeader';
import { MessageList } from '@/components/mastermind/MessageList';
import { MessageComposer } from '@/components/mastermind/MessageComposer';

import { useDmConversation } from '@/hooks/use-dm-conversation';

type DmConversationViewProps = {
    otherUserId: string;
    highlightMessageId?: string | null;
    onHighlightDone?: () => void;
};

/**
 * The direct-message conversation pane: resolves the DM by counterparty id, then renders the
 * header, the message history (or an empty draft for a never-messaged pair), and the composer.
 */
export function DmConversationView({
    otherUserId,
    highlightMessageId,
    onHighlightDone,
}: DmConversationViewProps) {
    const { data, isLoading, isError } = useDmConversation(otherUserId);

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (isError || !data) {
        return (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                This conversation is unavailable.
            </div>
        );
    }

    const { channelId, otherUser } = data;
    const firstName = otherUser.firstName || 'this user';

    return (
        <>
            <DmHeader otherUser={otherUser} />
            {channelId ? (
                <MessageList
                    channelId={channelId}
                    isDm
                    highlightMessageId={highlightMessageId}
                    onHighlightDone={onHighlightDone}
                />
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-2">
                    <p className="text-sm font-medium text-foreground">No messages yet</p>
                    <p className="text-sm text-muted-foreground">
                        Send a message to start the conversation with {firstName}.
                    </p>
                </div>
            )}
            <MessageComposer
                mode="dm"
                otherUserId={otherUserId}
                otherUserName={firstName}
                channelId={channelId}
            />
        </>
    );
}
