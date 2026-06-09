import { useRef } from 'react';
import { useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';

type UseMastermindEditorOptions = {
    placeholder?: string;
    onSubmit?: () => void;
};

export function useMastermindEditor({
    placeholder = 'Type a message…',
    onSubmit,
}: UseMastermindEditorOptions = {}) {
    const onSubmitRef = useRef(onSubmit);
    onSubmitRef.current = onSubmit;

    const editor = useEditor({
        extensions: [
            StarterKit,
            Underline,
            Link.configure({
                autolink: true,
                linkOnPaste: true,
                openOnClick: false,
                HTMLAttributes: {
                    target: '_blank',
                    rel: 'noopener noreferrer',
                },
            }),
            Placeholder.configure({ placeholder }),
        ],
        editorProps: {
            attributes: { class: 'mastermind-composer-editor focus:outline-none' },
            handleKeyDown: (_view, event) => {
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                    onSubmitRef.current?.();
                    return true;
                }
                return false;
            },
        },
    });

    const editorState = useEditorState({
        editor,
        selector: (ctx) => ({
            isBold: !!ctx.editor?.isActive('bold'),
            isItalic: !!ctx.editor?.isActive('italic'),
            isUnderline: !!ctx.editor?.isActive('underline'),
            hasContent: (ctx.editor?.getText().trim().length ?? 0) > 0,
        }),
    });

    return { editor, editorState };
}
