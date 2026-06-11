import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation } from '@tanstack/react-query';
import { Bold, FileText, Italic, Link2, Loader2, Paperclip, Underline, X } from 'lucide-react';
import { EditorContent } from '@tiptap/react';

import { Button } from '@/components/ui/button';
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

    const [showLinkInput, setShowLinkInput] = useState(false);
    const [isEditingLink, setIsEditingLink] = useState(false);
    const [linkUrl, setLinkUrl] = useState('');
    const [linkText, setLinkText] = useState('');
    const [linkAnchorRect, setLinkAnchorRect] = useState<DOMRect | null>(null);
    const linkUrlInputRef = useRef<HTMLInputElement>(null);
    const linkBtnRef = useRef<HTMLButtonElement>(null);
    const linkPortalRef = useRef<HTMLDivElement>(null);

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

    function closeLinkDialog() {
        setShowLinkInput(false);
        setIsEditingLink(false);
        setLinkUrl('');
        setLinkText('');
    }

    function applyLink() {
        const url = linkUrl.trim();
        if (!url || !editor) return;
        const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;

        const { from, to, empty } = editor.state.selection;
        const originalText = empty ? '' : editor.state.doc.textBetween(from, to);
        const newText = linkText.trim() || originalText;

        if (!newText) {
            closeLinkDialog();
            return;
        }

        const exitLink = ({ tr, state }: { tr: any; state: any }) => {
            tr.removeStoredMark(state.schema.marks.link);
            return true;
        };

        if (!empty && newText === originalText) {
            editor.chain().focus().setLink({ href }).setTextSelection(to).command(exitLink).run();
        } else {
            const safe = newText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            editor
                .chain()
                .focus()
                .deleteSelection()
                .insertContent(`<a href="${href}">${safe}</a>`)
                .command(exitLink)
                .run();
        }
        closeLinkDialog();
    }

    useEffect(() => {
        if (!showLinkInput) return;
        setTimeout(() => linkUrlInputRef.current?.focus(), 0);
        const handleClickOutside = (e: MouseEvent) => {
            if (
                linkBtnRef.current?.contains(e.target as Node) ||
                linkPortalRef.current?.contains(e.target as Node)
            )
                return;
            closeLinkDialog();
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showLinkInput]);

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

    const toolbarBtn = (active: boolean) =>
        `mm-toolbar-btn${active ? ' mm-toolbar-btn-active' : ''}`;

    const canSend =
        (editorState?.hasContent ?? false) || pendingFiles.length > 0;

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

                        <div className="w-px h-3.5 bg-border mx-0.5 flex-shrink-0" />

                        <button
                            ref={linkBtnRef}
                            type="button"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                if (!editor) return;
                                if (showLinkInput) {
                                    closeLinkDialog();
                                    return;
                                }
                                if (editorState?.isLink) {
                                    editor.chain().focus().extendMarkRange('link').run();
                                    const { from, to } = editor.state.selection;
                                    const currentText = editor.state.doc.textBetween(from, to);
                                    const currentHref = editor.getAttributes('link').href ?? '';
                                    const coords = editor.view.coordsAtPos(from);
                                    setLinkText(currentText);
                                    setLinkUrl(currentHref);
                                    setLinkAnchorRect(
                                        new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top),
                                    );
                                    setIsEditingLink(true);
                                } else {
                                    const { from, empty } = editor.state.selection;
                                    const selectedText = empty
                                        ? ''
                                        : editor.state.doc.textBetween(from, editor.state.selection.to);
                                    const coords = editor.view.coordsAtPos(from);
                                    setLinkText(selectedText);
                                    setLinkUrl('');
                                    setLinkAnchorRect(
                                        new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top),
                                    );
                                    setIsEditingLink(false);
                                }
                                setShowLinkInput(true);
                            }}
                            className={toolbarBtn((editorState?.isLink ?? false) || showLinkInput)}
                            title={editorState?.isLink ? 'Edit link' : 'Add link'}
                        >
                            <Link2 className="w-3.5 h-3.5" />
                        </button>

                        <div className="w-px h-3.5 bg-border mx-0.5 flex-shrink-0" />

                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={pendingFiles.length >= MAX_ATTACHMENTS_PER_MESSAGE}
                            className={`${toolbarBtn(false)} disabled:opacity-50 disabled:pointer-events-none`}
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
                    </div>
                </div>
            </div>
            <MentionDropdownPortal dropdown={dropdown} />
            {showLinkInput &&
                linkAnchorRect &&
                createPortal(
                    <div
                        ref={linkPortalRef}
                        className="fixed z-[99999] bg-background border border-border rounded-lg shadow-lg overflow-hidden py-1"
                        style={{
                            bottom: window.innerHeight - linkAnchorRect.top + 6,
                            left: Math.max(8, Math.min(linkAnchorRect.left, window.innerWidth - 296)),
                            width: 288,
                        }}
                    >
                        <div className="flex flex-col gap-2 px-3 py-2.5">
                            <div className="flex items-center gap-2 rounded-md border border-input bg-background px-2.5 py-1.5 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring transition-colors">
                                <input
                                    type="text"
                                    value={linkText}
                                    onChange={(e) => setLinkText(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            linkUrlInputRef.current?.focus();
                                        }
                                        if (e.key === 'Escape') {
                                            e.preventDefault();
                                            closeLinkDialog();
                                        }
                                    }}
                                    placeholder="Text"
                                    className="flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground min-w-0"
                                />
                            </div>
                            <div className="flex items-center gap-2 rounded-md border border-input bg-background px-2.5 py-1.5 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring transition-colors">
                                <Link2 className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                <input
                                    ref={linkUrlInputRef}
                                    type="text"
                                    value={linkUrl}
                                    onChange={(e) => setLinkUrl(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            applyLink();
                                        }
                                        if (e.key === 'Escape') {
                                            e.preventDefault();
                                            closeLinkDialog();
                                        }
                                    }}
                                    placeholder="Paste or type a URL…"
                                    className="flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground min-w-0"
                                />
                            </div>
                            <div className="flex items-center justify-between pt-0.5">
                                {isEditingLink ? (
                                    <button
                                        type="button"
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            editor
                                                ?.chain()
                                                .focus()
                                                .extendMarkRange('link')
                                                .unsetLink()
                                                .run();
                                            closeLinkDialog();
                                        }}
                                        className="text-xs text-destructive hover:opacity-70 transition-opacity"
                                    >
                                        Remove link
                                    </button>
                                ) : (
                                    <span />
                                )}
                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            closeLinkDialog();
                                        }}
                                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            applyLink();
                                        }}
                                        disabled={!linkUrl.trim()}
                                        className="text-xs font-medium text-primary hover:opacity-70 transition-opacity disabled:opacity-40"
                                    >
                                        Apply
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>,
                    document.body,
                )}
        </div>
    );
}
