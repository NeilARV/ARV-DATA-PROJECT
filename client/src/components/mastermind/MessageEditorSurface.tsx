import { useRef } from 'react';
import { Paperclip } from 'lucide-react';
import { EditorContent } from '@tiptap/react';
import type { Editor } from '@tiptap/core';

import { ComposerToolbar, type EditorState } from '@/components/mastermind/ComposerToolbar';
import { AttachmentChip } from '@/components/mastermind/AttachmentChip';

import type { AttachmentDraft } from '@/hooks/use-attachment-drafts';

import { MASTERMIND_ALLOWED_FILE_ACCEPT } from '@/constants/mastermind';

type MessageEditorSurfaceProps = {
    editor: Editor | null;
    editorState: EditorState;
    drafts: AttachmentDraft[];
    previewUrls: (string | null)[];
    canAddMore: boolean;
    onAddFiles: (files: File[]) => void;
    onRemoveDraft: (id: string) => void;
    // Padding/min-height of the editor area; varies between the composer and the inline editor.
    editorClassName?: string;
    // Action controls (send hint, Save/Send buttons) rendered on the toolbar's right side.
    children?: React.ReactNode;
};

const SHARED_EDITOR_CLASS = 'max-h-48 overflow-y-auto text-sm cursor-text';

/**
 * The shared message-editing surface: a bordered box with pending-attachment chips, the rich-text
 * editor area, and the formatting toolbar plus a file-attach button. Used by both MessageComposer
 * (new messages) and InlineMessageEditor (editing existing ones); each supplies its own action
 * controls via `children`, rendered on the toolbar's right side.
 */
export function MessageEditorSurface({
    editor,
    editorState,
    drafts,
    previewUrls,
    canAddMore,
    onAddFiles,
    onRemoveDraft,
    editorClassName = 'px-3 py-2',
    children,
}: MessageEditorSurfaceProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        onAddFiles(Array.from(e.target.files ?? []));
        e.target.value = '';
    }

    return (
        <div className="rounded-lg border border-input bg-background focus-within:border-ring focus-within:ring-1 focus-within:ring-ring transition-colors">
            {drafts.length > 0 && (
                <div className="flex flex-wrap gap-2 px-3 pt-3">
                    {drafts.map((draft, i) => (
                        <AttachmentChip
                            key={draft.id}
                            previewUrl={previewUrls[i]}
                            fileName={draft.kind === 'existing' ? draft.attachment.fileName : draft.file.name}
                            onRemove={() => onRemoveDraft(draft.id)}
                        />
                    ))}
                </div>
            )}
            <div
                className={`${editorClassName} ${SHARED_EDITOR_CLASS}`}
                onClick={() => editor?.commands.focus()}
            >
                <EditorContent editor={editor} />
            </div>
            <ComposerToolbar editor={editor} editorState={editorState}>
                <div className="w-px h-3.5 bg-border mx-0.5 flex-shrink-0" />
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!canAddMore}
                    className="mm-toolbar-btn disabled:opacity-50 disabled:pointer-events-none"
                    title="Attach a file"
                    aria-label="Attach a file"
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
                {children}
            </ComposerToolbar>
        </div>
    );
}
