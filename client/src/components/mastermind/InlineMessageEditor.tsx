import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { MessageEditorSurface } from '@/components/mastermind/MessageEditorSurface';
import { MentionDropdownPortal } from '@/components/mastermind/MentionDropdownPortal';

import { useMastermindEditor } from '@/hooks/use-mastermind-editor';
import { useAttachmentDrafts } from '@/hooks/use-attachment-drafts';

import type { MessageAttachmentWire } from '@shared/mastermind/events';
import type { EditMessagePayload } from '@/types/mastermind';

type InlineMessageEditorProps = {
    channelId: string;
    initialContent: string;
    initialAttachments: MessageAttachmentWire[];
    isSaving: boolean;
    onSave: (payload: EditMessagePayload) => void;
    onCancel: () => void;
};

/** Inline editor for an existing message: edits the text and adds/removes attachments. */
export function InlineMessageEditor({
    channelId,
    initialContent,
    initialAttachments,
    isSaving,
    onSave,
    onCancel,
}: InlineMessageEditorProps) {
    const attachments = useAttachmentDrafts(initialAttachments);

    function handleSave() {
        if (!editor || isSaving) return;
        const hasText = editor.getText().trim().length > 0;
        if (!hasText && !attachments.hasAttachments) return;
        onSave({
            content: editor.getHTML(),
            keptAttachments: attachments.keptAttachments,
            newFiles: attachments.newFiles,
        });
    }

    // Declared after handleSave on purpose: the editor takes handleSave as onSubmit, and handleSave
    // reads `editor` back — function-declaration hoisting makes the cycle safe.
    const { editor, editorState, dropdown } = useMastermindEditor({
        channelId,
        initialContent,
        autofocus: true,
        placeholder: 'Edit your message…',
        onSubmit: handleSave,
    });

    const canSave = (editorState?.hasContent ?? false) || attachments.hasAttachments;

    return (
        <div
            className="mt-0.5"
            onKeyDown={(e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    onCancel();
                }
            }}
        >
            <MessageEditorSurface
                editor={editor}
                editorState={editorState}
                drafts={attachments.drafts}
                previewUrls={attachments.previewUrls}
                canAddMore={attachments.canAddMore}
                onAddFiles={attachments.addFiles}
                onRemoveDraft={attachments.removeDraft}
            />
            <div className="flex items-center gap-2 mt-1.5">
                <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={!canSave || isSaving}
                    className="h-7 text-xs px-3"
                >
                    {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={onCancel}
                    disabled={isSaving}
                    className="h-7 text-xs px-3"
                >
                    Cancel
                </Button>
                <span className="text-xs text-muted-foreground hidden sm:inline select-none">
                    Esc to cancel · ↵ to save
                </span>
            </div>
            <MentionDropdownPortal dropdown={dropdown} />
        </div>
    );
}
