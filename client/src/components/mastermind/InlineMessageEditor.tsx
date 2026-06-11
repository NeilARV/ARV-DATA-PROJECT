import { EditorContent } from '@tiptap/react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ComposerToolbar } from '@/components/mastermind/ComposerToolbar';
import { MentionDropdownPortal } from '@/components/mastermind/MentionDropdownPortal';

import { useMastermindEditor } from '@/hooks/use-mastermind-editor';

type InlineMessageEditorProps = {
    channelId: string;
    initialContent: string;
    isSaving: boolean;
    onSave: (content: string) => void;
    onCancel: () => void;
};

export function InlineMessageEditor({
    channelId,
    initialContent,
    isSaving,
    onSave,
    onCancel,
}: InlineMessageEditorProps) {
    function handleSave() {
        if (!editor || isSaving) return;
        if (editor.getText().trim().length === 0) return;
        onSave(editor.getHTML());
    }

    const { editor, editorState, dropdown } = useMastermindEditor({
        channelId,
        initialContent,
        autofocus: true,
        placeholder: 'Edit your message…',
        onSubmit: handleSave,
    });

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
                <div
                    className="px-3 py-2 max-h-48 overflow-y-auto text-sm cursor-text"
                    onClick={() => editor?.commands.focus()}
                >
                    <EditorContent editor={editor} />
                </div>
                <ComposerToolbar editor={editor} editorState={editorState}>
                    <div className="flex-1" />
                </ComposerToolbar>
            </div>
            <div className="flex items-center gap-2 mt-1.5">
                <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={!(editorState?.hasContent ?? false) || isSaving}
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
                    Esc to cancel · Ctrl+↵ to save
                </span>
            </div>
            <MentionDropdownPortal dropdown={dropdown} />
        </div>
    );
}
