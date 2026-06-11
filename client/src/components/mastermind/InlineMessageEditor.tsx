import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Paperclip } from 'lucide-react';
import { EditorContent } from '@tiptap/react';

import { Button } from '@/components/ui/button';
import { ComposerToolbar } from '@/components/mastermind/ComposerToolbar';
import { MentionDropdownPortal } from '@/components/mastermind/MentionDropdownPortal';
import { AttachmentChip } from '@/components/mastermind/AttachmentChip';

import { useMastermindEditor } from '@/hooks/use-mastermind-editor';

import type { MessageAttachmentWire } from '@shared/mastermind/events';

import {
    MAX_ATTACHMENTS_PER_MESSAGE,
    MASTERMIND_ALLOWED_FILE_ACCEPT,
} from '@/constants/mastermind';

// Existing attachments are kept by reference; new ones are uploaded by the parent on save.
type AttachmentDraft =
    | { kind: 'existing'; attachment: MessageAttachmentWire }
    | { kind: 'new'; file: File };

export type EditMessagePayload = {
    content: string;
    keptAttachments: MessageAttachmentWire[];
    newFiles: File[];
};

type InlineMessageEditorProps = {
    channelId: string;
    initialContent: string;
    initialAttachments: MessageAttachmentWire[];
    isSaving: boolean;
    onSave: (payload: EditMessagePayload) => void;
    onCancel: () => void;
};

export function InlineMessageEditor({
    channelId,
    initialContent,
    initialAttachments,
    isSaving,
    onSave,
    onCancel,
}: InlineMessageEditorProps) {
    const [drafts, setDrafts] = useState<AttachmentDraft[]>(() =>
        initialAttachments.map((attachment) => ({ kind: 'existing', attachment })),
    );
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Image previews: existing attachments use their stored URL; new files get a transient
    // object URL that is revoked when the draft set changes.
    const previewUrls = useMemo(
        () =>
            drafts.map((draft) => {
                if (draft.kind === 'existing') {
                    return draft.attachment.fileType.startsWith('image/')
                        ? draft.attachment.fileUrl
                        : null;
                }
                return draft.file.type.startsWith('image/') ? URL.createObjectURL(draft.file) : null;
            }),
        [drafts],
    );
    useEffect(() => {
        return () => {
            drafts.forEach((draft, i) => {
                if (draft.kind === 'new' && previewUrls[i]) URL.revokeObjectURL(previewUrls[i]!);
            });
        };
    }, [drafts, previewUrls]);

    function handleSave() {
        if (!editor || isSaving) return;
        const hasText = editor.getText().trim().length > 0;
        if (!hasText && drafts.length === 0) return;
        onSave({
            content: editor.getHTML(),
            keptAttachments: drafts.flatMap((draft) =>
                draft.kind === 'existing' ? [draft.attachment] : [],
            ),
            newFiles: drafts.flatMap((draft) => (draft.kind === 'new' ? [draft.file] : [])),
        });
    }

    const { editor, editorState, dropdown } = useMastermindEditor({
        channelId,
        initialContent,
        autofocus: true,
        placeholder: 'Edit your message…',
        onSubmit: handleSave,
    });

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const files = Array.from(e.target.files ?? []);
        const slots = MAX_ATTACHMENTS_PER_MESSAGE - drafts.length;
        setDrafts((prev) => [
            ...prev,
            ...files.slice(0, slots).map((file) => ({ kind: 'new' as const, file })),
        ]);
        e.target.value = '';
    }

    function removeDraft(index: number) {
        setDrafts((prev) => prev.filter((_, i) => i !== index));
    }

    const canSave = (editorState?.hasContent ?? false) || drafts.length > 0;

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
            <div className="rounded-lg border border-input bg-background focus-within:border-ring focus-within:ring-1 focus-within:ring-ring transition-colors">
                {drafts.length > 0 && (
                    <div className="flex flex-wrap gap-2 px-3 pt-3">
                        {drafts.map((draft, i) => (
                            <AttachmentChip
                                key={
                                    draft.kind === 'existing'
                                        ? draft.attachment.id
                                        : `${draft.file.name}-${i}`
                                }
                                previewUrl={previewUrls[i]}
                                fileName={
                                    draft.kind === 'existing'
                                        ? draft.attachment.fileName
                                        : draft.file.name
                                }
                                onRemove={() => removeDraft(i)}
                            />
                        ))}
                    </div>
                )}
                <div
                    className="px-3 py-2 max-h-48 overflow-y-auto text-sm cursor-text"
                    onClick={() => editor?.commands.focus()}
                >
                    <EditorContent editor={editor} />
                </div>
                <ComposerToolbar editor={editor} editorState={editorState}>
                    <div className="w-px h-3.5 bg-border mx-0.5 flex-shrink-0" />
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={drafts.length >= MAX_ATTACHMENTS_PER_MESSAGE}
                        className="mm-toolbar-btn disabled:opacity-50 disabled:pointer-events-none"
                        title="Attach a file"
                    >
                        <Paperclip className="w-3.5 h-3.5" />
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept={MASTERMIND_ALLOWED_FILE_ACCEPT}
                        multiple
                        className="hidden"
                        onChange={handleFileChange}
                    />
                    <div className="flex-1" />
                </ComposerToolbar>
            </div>
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
