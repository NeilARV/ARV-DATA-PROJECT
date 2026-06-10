import { useRef, useReducer, useCallback, useEffect, useMemo } from 'react';
import { useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import { mergeAttributes } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

export type MentionItem = { id: string; label: string };

export type MentionDropdown = {
    items: MentionItem[];
    command: (item: MentionItem) => void;
    rect: DOMRect;
    selectedIndex: number;
};

type UseMastermindEditorOptions = {
    channelId: string;
    placeholder?: string;
    onSubmit?: () => void;
    initialContent?: string;
    autofocus?: boolean;
};

// Shown first when the user types "@", before any real users.
const BROADCAST_ITEMS: MentionItem[] = [{ id: '@channel', label: 'channel' }];

export function useMastermindEditor({
    channelId,
    placeholder = 'Type a message…',
    onSubmit,
    initialContent,
    autofocus = false,
}: UseMastermindEditorOptions) {
    const onSubmitRef = useRef(onSubmit);
    onSubmitRef.current = onSubmit;

    // ── Dropdown state ──────────────────────────────────────────────────────
    const mentionRef = useRef<MentionDropdown | null>(null);
    const [, bumpMention] = useReducer((x: number) => x + 1, 0);

    const openMention = useCallback((d: MentionDropdown) => {
        mentionRef.current = d;
        bumpMention();
    }, []);

    const updateMention = useCallback(
        (items: MentionItem[], rect: DOMRect, command: (item: MentionItem) => void) => {
            if (mentionRef.current) {
                mentionRef.current = { ...mentionRef.current, items, rect, command, selectedIndex: 0 };
                bumpMention();
            }
        },
        [],
    );

    const closeMention = useCallback(() => {
        mentionRef.current = null;
        bumpMention();
    }, []);

    const moveMention = useCallback((dir: 1 | -1): boolean => {
        const d = mentionRef.current;
        if (!d || d.items.length === 0) return false;
        mentionRef.current = {
            ...d,
            selectedIndex: (d.selectedIndex + dir + d.items.length) % d.items.length,
        };
        bumpMention();
        return true;
    }, []);

    const selectMention = useCallback((): boolean => {
        const d = mentionRef.current;
        if (!d || d.items.length === 0) return false;
        d.command(d.items[d.selectedIndex]);
        return true;
    }, []);

    // Stable refs so ProseMirror callbacks always call the latest version.
    const openMentionRef = useRef(openMention);
    const updateMentionRef = useRef(updateMention);
    const closeMentionRef = useRef(closeMention);
    const moveMentionRef = useRef(moveMention);
    const selectMentionRef = useRef(selectMention);
    openMentionRef.current = openMention;
    updateMentionRef.current = updateMention;
    closeMentionRef.current = closeMention;
    moveMentionRef.current = moveMention;
    selectMentionRef.current = selectMention;

    // ── Channel members query (mention candidates) ───────────────────────────
    type MemberRow = { id: string; firstName: string; lastName: string };

    const { data: membersData } = useQuery({
        queryKey: [`/api/channels/${channelId}/members`],
        queryFn: () =>
            apiRequest('GET', `/api/channels/${channelId}/members`).then((r) => r.json()) as Promise<{
                users: MemberRow[];
            }>,
        staleTime: 2 * 60 * 1000,
        enabled: !!channelId,
    });

    const allUsersRef = useRef<MentionItem[]>([]);
    useEffect(() => {
        allUsersRef.current = (membersData?.users ?? []).map((u) => ({
            id: u.id,
            label: `${u.firstName} ${u.lastName}`,
        }));
    }, [membersData]);

    // ── UserMention extension ────────────────────────────────────────────────
    const UserMention = useMemo(
        () =>
            Mention.extend({
                name: 'userMention',
                addOptions(): any {
                    return {
                        ...this.parent?.(),
                        HTMLAttributes: { class: 'mention' },
                        renderHTML: ({ node }: { options: any; node: any }) => [
                            'span',
                            mergeAttributes(
                                { 'data-type': 'mention', class: 'mention' },
                                { 'data-id': node.attrs.id, 'data-label': node.attrs.label },
                            ),
                            `@${node.attrs.label ?? node.attrs.id}`,
                        ],
                        renderText: ({ node }: { options: any; node: any }) =>
                            `@${node.attrs.label ?? node.attrs.id}`,
                        suggestion: {
                            pluginKey: new PluginKey('userMentionSuggestion'),
                            char: '@',
                            items: ({ query }: { query: string }) => {
                                const q = query.toLowerCase();
                                const broadcasts = BROADCAST_ITEMS.filter(
                                    (i) => !q || i.label.startsWith(q),
                                );
                                const realUsers = allUsersRef.current
                                    .filter((i) => i.label.toLowerCase().includes(q))
                                    .slice(0, 8);
                                return [...broadcasts, ...realUsers].slice(0, 10);
                            },
                            render: () => ({
                                onStart: (props: any) => {
                                    const rect = props.clientRect?.();
                                    if (!rect) return;
                                    openMentionRef.current({
                                        items: props.items,
                                        command: (item: MentionItem) =>
                                            props.command({ id: item.id, label: item.label }),
                                        rect,
                                        selectedIndex: 0,
                                    });
                                },
                                onUpdate: (props: any) => {
                                    const rect = props.clientRect?.();
                                    if (!rect) return;
                                    updateMentionRef.current(
                                        props.items,
                                        rect,
                                        (item: MentionItem) =>
                                            props.command({ id: item.id, label: item.label }),
                                    );
                                },
                                onKeyDown: ({ event }: { event: KeyboardEvent }) => {
                                    if (event.key === 'ArrowDown') return moveMentionRef.current(1);
                                    if (event.key === 'ArrowUp') return moveMentionRef.current(-1);
                                    if (event.key === 'Enter') return selectMentionRef.current();
                                    return false;
                                },
                                onExit: () => closeMentionRef.current(),
                            }),
                        },
                    };
                },
            }),
        [],
    ); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Editor ───────────────────────────────────────────────────────────────
    const editor = useEditor({
        content: initialContent,
        autofocus: autofocus ? 'end' : false,
        extensions: [
            StarterKit,
            Underline,
            Link.configure({
                autolink: true,
                linkOnPaste: true,
                openOnClick: false,
                HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
            }),
            Placeholder.configure({ placeholder }),
            UserMention,
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

    return { editor, editorState, dropdown: mentionRef.current, bumpMention };
}
