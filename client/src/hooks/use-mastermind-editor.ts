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
import { fetchVendors } from '@/api/vendors.api';

export type MentionItem = { id: string; label: string; kind: 'broadcast' | 'user' | 'vendor' };

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
const BROADCAST_ITEMS: MentionItem[] = [{ id: '@channel', label: 'channel', kind: 'broadcast' }];

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
            kind: 'user' as const,
        }));
    }, [membersData]);

    // ── Vendor query (mention candidates) ────────────────────────────────────
    // Vendors are mentionable under the same "@" as users. The list is a public read,
    // shared with the Vendors app, and cached briefly so reopening the composer is instant.
    const { data: vendorsData } = useQuery({
        queryKey: ['vendors'],
        queryFn: () => fetchVendors(),
        staleTime: 5 * 60 * 1000,
    });

    const allVendorsRef = useRef<MentionItem[]>([]);
    useEffect(() => {
        allVendorsRef.current = (vendorsData ?? []).map((v) => ({
            id: v.id,
            label: v.name,
            kind: 'vendor' as const,
        }));
    }, [vendorsData]);

    // ── UserMention extension ────────────────────────────────────────────────
    const UserMention = useMemo(
        () =>
            Mention.extend({
                name: 'userMention',
                // Stored mentions are rendered as <span data-type="mention">. TipTap's default
                // parseHTML keys off this.name ('userMention'), so without this override the edit
                // editor wouldn't recognize a stored mention — it would degrade to plain text,
                // dropping the data-id (the notify target) and the `mention` class (the colored
                // chip). Match what renderHTML actually emits so mentions survive an edit.
                parseHTML(): any {
                    return [{ tag: 'span[data-type="mention"]' }];
                },
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
                            // A single "@" suggestion lists broadcasts, then channel members, then
                            // vendors. Vendors share the trigger but insert a distinct node type
                            // (see `command` below) because their IDs are UUIDs like users'.
                            items: ({ query }: { query: string }) => {
                                const q = query.toLowerCase();
                                const broadcasts = BROADCAST_ITEMS.filter(
                                    (i) => !q || i.label.startsWith(q),
                                );
                                const realUsers = allUsersRef.current
                                    .filter((i) => i.label.toLowerCase().includes(q))
                                    .slice(0, 6);
                                const vendors = allVendorsRef.current
                                    .filter((i) => i.label.toLowerCase().includes(q))
                                    .slice(0, 6);
                                return [...broadcasts, ...realUsers, ...vendors].slice(0, 12);
                            },
                            // Insert a vendorMention node for vendor items and a userMention node
                            // otherwise. Mirrors TipTap's default mention command (swallow trailing
                            // space, insert node + space, collapse cursor) but picks the node type.
                            command: ({ editor, range, props }: any) => {
                                const nodeType =
                                    props.kind === 'vendor' ? 'vendorMention' : 'userMention';
                                const nodeAfter = editor.view.state.selection.$to.nodeAfter;
                                if (nodeAfter?.text?.startsWith(' ')) range.to += 1;
                                editor
                                    .chain()
                                    .focus()
                                    .insertContentAt(range, [
                                        { type: nodeType, attrs: { id: props.id, label: props.label } },
                                        { type: 'text', text: ' ' },
                                    ])
                                    .run();
                                window.getSelection()?.collapseToEnd();
                            },
                            render: () => ({
                                onStart: (props: any) => {
                                    const rect = props.clientRect?.();
                                    if (!rect) return;
                                    openMentionRef.current({
                                        items: props.items,
                                        command: (item: MentionItem) =>
                                            props.command({
                                                id: item.id,
                                                label: item.label,
                                                kind: item.kind,
                                            }),
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
                                            props.command({
                                                id: item.id,
                                                label: item.label,
                                                kind: item.kind,
                                            }),
                                    );
                                },
                                onKeyDown: ({ event }: { event: KeyboardEvent }) => {
                                    if (event.key === 'ArrowDown') return moveMentionRef.current(1);
                                    if (event.key === 'ArrowUp') return moveMentionRef.current(-1);
                                    // Always own Enter while the suggestion is active — even with
                                    // zero matches — so it never falls through to submit the
                                    // message mid-mention (e.g. an unmatched "@xyz" query).
                                    if (event.key === 'Enter') {
                                        selectMentionRef.current();
                                        return true;
                                    }
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

    // ── VendorMention node ───────────────────────────────────────────────────
    // Render/parse only: it contributes NO suggestion plugin (the single userMention
    // suggestion above drives insertion of both node types), so it never creates a
    // competing "@" trigger. parseHTML matches the stored chip so it survives an edit.
    const VendorMention = useMemo(
        () =>
            Mention.extend({
                name: 'vendorMention',
                addProseMirrorPlugins(): any {
                    return [];
                },
                parseHTML(): any {
                    return [{ tag: 'span[data-type="vendorMention"]' }];
                },
                addOptions(): any {
                    return {
                        ...this.parent?.(),
                        HTMLAttributes: { class: 'mention-vendor' },
                        renderHTML: ({ node }: { options: any; node: any }) => [
                            'span',
                            mergeAttributes(
                                { 'data-type': 'vendorMention', class: 'mention-vendor' },
                                { 'data-id': node.attrs.id, 'data-label': node.attrs.label },
                            ),
                            `@${node.attrs.label ?? node.attrs.id}`,
                        ],
                        renderText: ({ node }: { options: any; node: any }) =>
                            `@${node.attrs.label ?? node.attrs.id}`,
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
                autolink: false,
                linkOnPaste: true,
                openOnClick: false,
                HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
            }),
            Placeholder.configure({ placeholder }),
            UserMention,
            VendorMention,
        ],
        editorProps: {
            attributes: { class: 'mastermind-composer-editor focus:outline-none' },
            handleKeyDown: (_view, event) => {
                // Enter submits; Shift+Enter inserts a newline. (While the mention dropdown is
                // open, its suggestion plugin handles Enter first and this never fires.)
                if (event.key === 'Enter' && !event.shiftKey) {
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
            isLink: !!ctx.editor?.isActive('link'),
            hasContent: (ctx.editor?.getText().trim().length ?? 0) > 0,
        }),
    });

    return { editor, editorState, dropdown: mentionRef.current, bumpMention };
}
