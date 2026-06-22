import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { MessageEditorSurface } from '@/components/mastermind/MessageEditorSurface';
import { MentionDropdownPortal } from '@/components/mastermind/MentionDropdownPortal';

import { useMastermindEditor } from '@/hooks/use-mastermind-editor';
import { useAttachmentDrafts } from '@/hooks/use-attachment-drafts';
import { useToast } from '@/hooks/use-toast';

import { apiRequest } from '@/lib/queryClient';
import { uploadAttachment, type UploadedAttachment } from '@/api/mastermind.api';

// Channel mode posts to a channel and relies on the socket echo. DM mode posts to the DM endpoint
// (creating the conversation on first send), disables mentions, and refreshes the DM list.
type MessageComposerProps =
    | { mode: 'channel'; channelId: string; channelName: string }
    | { mode: 'dm'; otherUserId: string; otherUserName: string; channelId: string | null };

/** Composer for sending a new message to a channel or a DM: rich text plus image/file attachments. */
export function MessageComposer(props: MessageComposerProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const attachments = useAttachmentDrafts();

    const isDm = props.mode === 'dm';
    const endpoint = isDm
        ? `/api/dms/${props.otherUserId}/messages`
        : `/api/channels/${props.channelId}/messages`;
    const placeholder = isDm ? `Message ${props.otherUserName}…` : `Message #${props.channelName}…`;
    // The editor's mention lookup is channel-scoped; DMs disable mentions so the id is unused there.
    const editorChannelId = props.mode === 'channel' ? props.channelId : '';

    const mutation = useMutation({
        mutationFn: async () => {
            let uploaded: UploadedAttachment[] = [];
            if (attachments.newFiles.length > 0) {
                uploaded = await Promise.all(attachments.newFiles.map((file) => uploadAttachment(file)));
            }
            await apiRequest('POST', endpoint, {
                content: editor?.getHTML() ?? '',
                attachments: uploaded.length > 0 ? uploaded : undefined,
            });
        },
        onSuccess: () => {
            editor?.commands.clearContent();
            attachments.reset();
            // Channel + existing-DM messages echo back over the socket — no manual cache update.
            // For DMs, refresh the sidebar list (recency/unread); for a brand-new conversation
            // (no channel yet) also re-resolve so its message list renders.
            if (props.mode === 'dm') {
                void queryClient.invalidateQueries({ queryKey: ['/api/dms'], exact: true });
                if (props.channelId === null) {
                    void queryClient.invalidateQueries({
                        queryKey: ['/api/dms', props.otherUserId, 'resolve'],
                    });
                }
            }
        },
        onError: () => {
            toast({
                title: 'Failed to send',
                description: 'Your message could not be sent. Please try again.',
                variant: 'destructive',
            });
        },
    });

    function handleSend() {
        if (!editor || mutation.isPending) return;
        const hasText = editor.getText().trim().length > 0;
        if (!hasText && !attachments.hasAttachments) return;
        mutation.mutate();
    }

    // Declared after handleSend on purpose: the editor takes handleSend as onSubmit, and handleSend
    // reads `editor` back — function-declaration hoisting makes the cycle safe.
    const { editor, editorState, dropdown } = useMastermindEditor({
        channelId: editorChannelId,
        placeholder,
        onSubmit: handleSend,
        enableMentions: !isDm,
    });

    const canSend = (editorState?.hasContent ?? false) || attachments.hasAttachments;

    return (
        <div className="flex-shrink-0 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]">
            <div className="m-3">
                <MessageEditorSurface
                    editor={editor}
                    editorState={editorState}
                    drafts={attachments.drafts}
                    previewUrls={attachments.previewUrls}
                    canAddMore={attachments.canAddMore}
                    onAddFiles={attachments.addFiles}
                    onRemoveDraft={attachments.removeDraft}
                    editorClassName="px-3 pt-3 pb-1 min-h-[60px]"
                >
                    <span className="text-xs text-muted-foreground mr-2 hidden sm:inline select-none">
                        ↵ to send · Shift+↵ for newline
                    </span>
                    <Button
                        size="sm"
                        onClick={handleSend}
                        disabled={!canSend || mutation.isPending}
                        className="h-7 text-xs px-3"
                    >
                        {mutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Send'}
                    </Button>
                </MessageEditorSurface>
            </div>
            {!isDm && <MentionDropdownPortal dropdown={dropdown} />}
        </div>
    );
}
