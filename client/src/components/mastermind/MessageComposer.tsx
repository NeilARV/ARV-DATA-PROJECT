import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { MessageEditorSurface } from '@/components/mastermind/MessageEditorSurface';
import { MentionDropdownPortal } from '@/components/mastermind/MentionDropdownPortal';

import { useMastermindEditor } from '@/hooks/use-mastermind-editor';
import { useAttachmentDrafts } from '@/hooks/use-attachment-drafts';
import { useToast } from '@/hooks/use-toast';

import { apiRequest } from '@/lib/queryClient';
import { uploadAttachment, type UploadedAttachment } from '@/api/mastermind.api';

type MessageComposerProps = {
    channelId: string;
    channelName: string;
};

/** Composer for sending a new message to a channel: rich text plus image/file attachments. */
export function MessageComposer({ channelId, channelName }: MessageComposerProps) {
    const { toast } = useToast();
    const attachments = useAttachmentDrafts();

    const mutation = useMutation({
        mutationFn: async () => {
            let uploaded: UploadedAttachment[] = [];
            if (attachments.newFiles.length > 0) {
                uploaded = await Promise.all(attachments.newFiles.map((file) => uploadAttachment(file)));
            }
            await apiRequest('POST', `/api/channels/${channelId}/messages`, {
                content: editor?.getHTML() ?? '',
                attachments: uploaded.length > 0 ? uploaded : undefined,
            });
        },
        onSuccess: () => {
            editor?.commands.clearContent();
            attachments.reset();
            // Socket broadcasts the new message back — no manual cache invalidation needed.
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
        channelId,
        placeholder: `Message #${channelName}…`,
        onSubmit: handleSend,
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
            <MentionDropdownPortal dropdown={dropdown} />
        </div>
    );
}
