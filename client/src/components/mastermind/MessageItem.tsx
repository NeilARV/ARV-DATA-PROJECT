import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { MessageActions } from '@/components/mastermind/MessageActions';
import { MessageAttachments } from '@/components/mastermind/MessageAttachments';
import { MessageReactions } from '@/components/mastermind/MessageReactions';
import {
    InlineMessageEditor,
    type EditMessagePayload,
} from '@/components/mastermind/InlineMessageEditor';

import { useToast } from '@/hooks/use-toast';

import { getAvatarColor } from '@/utils/avatar';
import {
    addReaction,
    removeReaction,
    editMessage,
    deleteMessage,
    setChannelPin,
    uploadAttachment,
    type UploadedAttachment,
} from '@/api/mastermind.api';

import type { MastermindMessageWire } from '@shared/mastermind/events';

function formatTimestamp(iso: string): string {
    const date = new Date(iso);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (date.toDateString() === now.toDateString()) return timeStr;
    if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${timeStr}`;
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + timeStr;
}

type MessageItemProps = {
    message: MastermindMessageWire;
    showHeader: boolean;
    isHighlighted?: boolean;
    currentUserId: string | undefined;
    canPin: boolean;
};

export function MessageItem({
    message,
    showHeader,
    isHighlighted = false,
    currentUserId,
    canPin,
}: MessageItemProps) {
    const { senderFirstName, senderLastName, senderId, senderProfileImageUrl } = message;
    const { toast } = useToast();
    const rootRef = useRef<HTMLDivElement>(null);
    const [isEditing, setIsEditing] = useState(false);

    const initials = `${senderFirstName.charAt(0)}${senderLastName.charAt(0)}`.toUpperCase();
    const avatarColor = getAvatarColor(senderId);
    const displayName = `${senderFirstName} ${senderLastName}`;
    const isAuthor = currentUserId === senderId;

    // Deep-link target: bring the message into view when the highlight lands on it.
    useEffect(() => {
        if (isHighlighted) {
            rootRef.current?.scrollIntoView({ block: 'center' });
        }
    }, [isHighlighted]);

    // Reactions/edits/pins update the cache via the WebSocket broadcast; the mutations only fire
    // the request and surface failures.
    const reactionMutation = useMutation({
        mutationFn: ({ emoji, isActive }: { emoji: string; isActive: boolean }) =>
            isActive ? removeReaction(message.id, emoji) : addReaction(message.id, emoji),
        onError: () =>
            toast({ title: 'Reaction failed', description: 'Please try again.', variant: 'destructive' }),
    });

    const editMutation = useMutation({
        mutationFn: async ({ content, keptAttachments, newFiles }: EditMessagePayload) => {
            const uploaded =
                newFiles.length > 0
                    ? await Promise.all(newFiles.map((file) => uploadAttachment(file)))
                    : [];
            const attachments: UploadedAttachment[] = [
                ...keptAttachments.map((a) => ({
                    fileUrl: a.fileUrl,
                    fileName: a.fileName,
                    fileType: a.fileType,
                    fileSizeBytes: a.fileSizeBytes,
                })),
                ...uploaded,
            ];
            await editMessage(message.id, content, attachments);
        },
        onSuccess: () => setIsEditing(false),
        onError: () =>
            toast({ title: 'Edit failed', description: 'Please try again.', variant: 'destructive' }),
    });

    const deleteMutation = useMutation({
        mutationFn: () => deleteMessage(message.id),
        onError: () =>
            toast({ title: 'Delete failed', description: 'Please try again.', variant: 'destructive' }),
    });

    const pinMutation = useMutation({
        mutationFn: () => setChannelPin(message.channelId, message.id),
        onSuccess: () => toast({ title: 'Message pinned' }),
        onError: () =>
            toast({ title: 'Pin failed', description: 'Please try again.', variant: 'destructive' }),
    });

    function handleToggleReaction(emoji: string) {
        const isActive = message.reactions.find((r) => r.emoji === emoji)?.reactedByMe ?? false;
        reactionMutation.mutate({ emoji, isActive });
    }

    return (
        <div
            ref={rootRef}
            className={`relative flex gap-3 px-4 hover:bg-accent/30 transition-colors group ${
                showHeader ? 'pt-3 pb-2' : 'py-0.5'
            }${isHighlighted ? ' mm-message-highlight' : ''}`}
        >
            {/* Avatar column — fixed 36px width keeps message bodies aligned */}
            <div className="w-9 flex-shrink-0 flex justify-center pt-0.5">
                {showHeader &&
                    (senderProfileImageUrl ? (
                        <img
                            src={senderProfileImageUrl}
                            alt={displayName}
                            className="w-9 h-9 rounded-full object-cover"
                        />
                    ) : (
                        <div
                            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                            style={{ backgroundColor: avatarColor }}
                        >
                            {initials}
                        </div>
                    ))}
            </div>

            {/* Message body */}
            <div className="flex-1 min-w-0">
                {showHeader && (
                    <div className="flex items-baseline gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-foreground">{displayName}</span>
                        <span className="text-xs text-muted-foreground">
                            {formatTimestamp(message.createdAt)}
                        </span>
                    </div>
                )}

                {message.isDeleted ? (
                    <p className="text-sm italic text-muted-foreground">This message was deleted.</p>
                ) : isEditing ? (
                    <InlineMessageEditor
                        channelId={message.channelId}
                        initialContent={message.content}
                        initialAttachments={message.attachments}
                        isSaving={editMutation.isPending}
                        onSave={(payload) => editMutation.mutate(payload)}
                        onCancel={() => setIsEditing(false)}
                    />
                ) : (
                    <>
                        <div className="mastermind-message text-sm text-foreground leading-relaxed">
                            <span dangerouslySetInnerHTML={{ __html: message.content }} />
                            {message.isEdited && (
                                <span className="text-xs text-muted-foreground ml-1">(edited)</span>
                            )}
                        </div>
                        <MessageAttachments attachments={message.attachments} />
                        <MessageReactions
                            reactions={message.reactions}
                            onToggle={handleToggleReaction}
                        />
                    </>
                )}
            </div>

            {!message.isDeleted && !isEditing && (
                <MessageActions
                    onReact={handleToggleReaction}
                    canPin={canPin}
                    onPin={() => pinMutation.mutate()}
                    isAuthor={isAuthor}
                    onEdit={() => setIsEditing(true)}
                    canDelete={isAuthor || canPin}
                    onDelete={() => deleteMutation.mutate()}
                />
            )}
        </div>
    );
}
