import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bold, Italic, Link2, Underline } from 'lucide-react';
import type { Editor } from '@tiptap/core';

type EditorState = {
    isBold: boolean;
    isItalic: boolean;
    isUnderline: boolean;
    isLink: boolean;
} | null;

type ComposerToolbarProps = {
    editor: Editor | null;
    editorState: EditorState;
    children?: React.ReactNode;
};

const btn = (active: boolean) => `mm-toolbar-btn${active ? ' mm-toolbar-btn-active' : ''}`;

export function ComposerToolbar({ editor, editorState, children }: ComposerToolbarProps) {
    const [showLinkInput, setShowLinkInput] = useState(false);
    const [isEditingLink, setIsEditingLink] = useState(false);
    const [linkUrl, setLinkUrl] = useState('');
    const [linkText, setLinkText] = useState('');
    const [linkAnchorRect, setLinkAnchorRect] = useState<DOMRect | null>(null);
    const linkUrlInputRef = useRef<HTMLInputElement>(null);
    const linkBtnRef = useRef<HTMLButtonElement>(null);
    const linkPortalRef = useRef<HTMLDivElement>(null);

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
        const t = setTimeout(() => linkUrlInputRef.current?.focus(), 0);
        const handleClickOutside = (e: MouseEvent) => {
            if (
                linkBtnRef.current?.contains(e.target as Node) ||
                linkPortalRef.current?.contains(e.target as Node)
            )
                return;
            closeLinkDialog();
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            clearTimeout(t);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showLinkInput]);

    return (
        <>
            <div className="flex items-center gap-0.5 px-2 pb-2 pt-1 border-t border-border/50">
                <button
                    type="button"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        editor?.chain().focus().toggleBold().run();
                    }}
                    className={btn(editorState?.isBold ?? false)}
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
                    className={btn(editorState?.isItalic ?? false)}
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
                    className={btn(editorState?.isUnderline ?? false)}
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
                    className={btn((editorState?.isLink ?? false) || showLinkInput)}
                    title={editorState?.isLink ? 'Edit link' : 'Add link'}
                >
                    <Link2 className="w-3.5 h-3.5" />
                </button>

                {children}
            </div>

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
        </>
    );
}
