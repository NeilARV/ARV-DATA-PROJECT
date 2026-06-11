import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { FileText, Loader2, Paperclip, X } from 'lucide-react';
import { EditorContent } from '@tiptap/react';

import { Button } from '@/components/ui/button';
import { ComposerToolbar } from '@/components/mastermind/ComposerToolbar';
import { MentionDropdownPortal } from '@/components/mastermind/MentionDropdownPortal';

import { useMastermindEditor } from '@/hooks/use-mastermind-editor';
import { useToast } from '@/hooks/use-toast';

import { apiRequest } from '@/lib/queryClient';
import { uploadAttachment, type UploadedAttachment } from '@/api/mastermind.api';
import {
    MAX_ATTACHMENTS_PER_MESSAGE,
    MASTERMIND_ALLOWED_FILE_ACCEPT,
} from '@/constants/mastermind';

type MessageComposerProps = {
    channelId: string;
    channelName: string;
};

export function MessageComposer({ channelId, channelName }: MessageComposerProps) {
    const { toast } = useToast();
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Object URLs for image previews, created once per file and revoked when the set changes.
    const previewUrls = useMemo(
        () => pendingFiles.map((file) => (file.type.startsWith('image/') ? URL.createObjectURL(file) : null)),
        [pendingFiles],
    );
    useEffect(() => {
        return () => {
            previewUrls.forEach((url) => url && URL.revokeObjectURL(url));
        };
    }, [previewUrls]);

    const mutation = useMutation({
        mutationFn: async () => {
            let attachments: UploadedAttachment[] = [];
            if (pendingFiles.length > 0) {
                attachments = await Promise.all(pendingFiles.map((file) => uploadAttachment(file)));
            }
            await apiRequest('POST', `/api/channels/${channelId}/messages`, {
                content: editor?.getHTML() ?? '',
                attachments: attachments.length > 0 ? attachments : undefined,
            });
        },
        onSuccess: () => {
            editor?.commands.clearContent();
            setPendingFiles([]);
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
        if (!hasText && pendingFiles.length === 0) return;
        mutation.mutate();
    }

    const { editor, editorState, dropdown } = useMastermindEditor({
        channelId,
        placeholder: `Message #${channelName}…`,
        onSubmit: handleSend,
    });

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const files = Array.from(e.target.files ?? []);
        const slots = MAX_ATTACHMENTS_PER_MESSAGE - pendingFiles.length;
        setPendingFiles((prev) => [...prev, ...files.slice(0, slots)]);
        e.target.value = '';
    }

    function removeFile(index: number) {
        setPendingFiles((prev) => prev.filter((_, i) => i !== index));
    }

    const canSend = (editorState?.hasContent ?? false) || pendingFiles.length > 0;

    return (
        <div className="flex-shrink-0 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]">
            <div className="m-3">
                <div className="rounded-lg border border-input bg-background focus-within:border-ring focus-within:ring-1 focus-within:ring-ring transition-colors">
                    {/* Pending attachments */}
                    {pendingFiles.length > 0 && (
                        <div className="flex flex-wrap gap-2 px-3 pt-3">
                            {pendingFiles.map((file, i) => {
                                const previewUrl = previewUrls[i];
                                return (
                                    <div
                                        key={`${file.name}-${i}`}
                                        className="relative flex items-center gap-2 rounded-md border border-border bg-muted px-2 py-1.5 max-w-[180px]"
                                    >
                                        {previewUrl ? (
                                            <img
                                                src={previewUrl}
                                                alt=""
                                                className="w-8 h-8 rounded object-cover flex-shrink-0"
                                            />
                                        ) : (
                                            <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                        )}
                                        <span className="text-xs text-foreground truncate">
                                            {file.name}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => removeFile(i)}
                                            className="flex-shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Editor area */}
                    <div
                        className="px-3 pt-3 pb-1 min-h-[60px] max-h-48 overflow-y-auto text-sm cursor-text"
                        onClick={() => editor?.commands.focus()}
                    >
                        <EditorContent editor={editor} />
                    </div>

                    {/* Toolbar — formatting buttons on the left, file + send on the right */}
                    <ComposerToolbar editor={editor} editorState={editorState}>
                        <div className="w-px h-3.5 bg-border mx-0.5 flex-shrink-0" />
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={pendingFiles.length >= MAX_ATTACHMENTS_PER_MESSAGE}
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
                        <span className="text-xs text-muted-foreground mr-2 hidden sm:inline select-none">
                            Ctrl+↵ to send
                        </span>
                        <Button
                            size="sm"
                            onClick={handleSend}
                            disabled={!canSend || mutation.isPending}
                            className="h-7 text-xs px-3"
                        >
                            {mutation.isPending ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                                'Send'
                            )}
                        </Button>
                    </ComposerToolbar>
                </div>
            </div>
            <MentionDropdownPortal dropdown={dropdown} />
        </div>
    );
}
