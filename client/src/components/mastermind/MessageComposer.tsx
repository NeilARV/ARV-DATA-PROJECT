import { Bold, Italic, Loader2, Underline } from 'lucide-react';
import { EditorContent } from '@tiptap/react';

import { Button } from '@/components/ui/button';
import { useMastermindEditor } from '@/hooks/use-mastermind-editor';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

import { useMutation } from '@tanstack/react-query';

type MessageComposerProps = {
    channelId: string;
    channelName: string;
};

export function MessageComposer({ channelId, channelName }: MessageComposerProps) {
    const { toast } = useToast();

    const mutation = useMutation({
        mutationFn: (content: string) =>
            apiRequest('POST', `/api/channels/${channelId}/messages`, { content }),
        onSuccess: () => {
            editor?.commands.clearContent();
            // Socket broadcasts the new message back — no manual cache invalidation needed
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
        const text = editor.getText().trim();
        if (!text) return;
        mutation.mutate(editor.getHTML());
    }

    const { editor, editorState } = useMastermindEditor({
        placeholder: `Message #${channelName}…`,
        onSubmit: handleSend,
    });

    const toolbarBtn = (active: boolean) =>
        `mm-toolbar-btn${active ? ' mm-toolbar-btn-active' : ''}`;

    return (
        <div className="flex-shrink-0 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]">
            <div className="m-3">
                <div className="rounded-lg border border-input bg-background focus-within:border-ring focus-within:ring-1 focus-within:ring-ring transition-colors">
                    {/* Editor area */}
                    <div
                        className="px-3 pt-3 pb-1 min-h-[60px] max-h-48 overflow-y-auto text-sm cursor-text"
                        onClick={() => editor?.commands.focus()}
                    >
                        <EditorContent editor={editor} />
                    </div>

                    {/* Toolbar */}
                    <div className="flex items-center gap-0.5 px-2 pb-2 pt-1 border-t border-border/50">
                        <button
                            type="button"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                editor?.chain().focus().toggleBold().run();
                            }}
                            className={toolbarBtn(editorState?.isBold ?? false)}
                            title="Bold (Ctrl+B)"
                        >
                            <Bold className="w-3.5 h-3.5" />
                        </button>
                        <button
                            type="button"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                editor?.chain().focus().toggleItalic().run();
                            }}
                            className={toolbarBtn(editorState?.isItalic ?? false)}
                            title="Italic (Ctrl+I)"
                        >
                            <Italic className="w-3.5 h-3.5" />
                        </button>
                        <button
                            type="button"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                editor?.chain().focus().toggleUnderline().run();
                            }}
                            className={toolbarBtn(editorState?.isUnderline ?? false)}
                            title="Underline (Ctrl+U)"
                        >
                            <Underline className="w-3.5 h-3.5" />
                        </button>

                        <div className="flex-1" />

                        <span className="text-xs text-muted-foreground mr-2 hidden sm:inline select-none">
                            Ctrl+↵ to send
                        </span>

                        <Button
                            size="sm"
                            onClick={handleSend}
                            disabled={!(editorState?.hasContent ?? false) || mutation.isPending}
                            className="h-7 text-xs px-3"
                        >
                            {mutation.isPending ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                                'Send'
                            )}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
