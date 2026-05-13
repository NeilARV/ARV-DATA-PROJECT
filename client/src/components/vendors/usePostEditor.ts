import { useRef, useReducer, useCallback, useEffect, useMemo } from "react";
import { useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import { Extension, mergeAttributes } from "@tiptap/core";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import { PluginKey } from "@tiptap/pm/state";
import { useQuery } from "@tanstack/react-query";
import { fetchCategories, fetchVendors } from "@/api/vendors.api";

declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        fontSize: {
            setFontSize: (size: string) => ReturnType;
            unsetFontSize: () => ReturnType;
        };
    }
}

export const FontSize = Extension.create({
    name: "fontSize",
    addOptions() {
        return { types: ["textStyle"] };
    },
    addGlobalAttributes() {
        return [{
            types: this.options.types,
            attributes: {
                fontSize: {
                    default: null,
                    parseHTML: (el: HTMLElement) => el.style.fontSize || null,
                    renderHTML: (attrs: Record<string, unknown>) =>
                        !attrs.fontSize ? {} : { style: `font-size: ${attrs.fontSize}` },
                },
            },
        }];
    },
    addCommands() {
        return {
            setFontSize:
                (size: string) =>
                ({ chain }: { chain: () => any }) =>
                    chain().setMark("textStyle", { fontSize: size }).run(),
            unsetFontSize:
                () =>
                ({ chain }: { chain: () => any }) =>
                    chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run(),
        } as any;
    },
});

export type MentionItem = { id: string; label: string };

export type MentionDropdown = {
    type: "vendor" | "category";
    items: MentionItem[];
    command: (item: MentionItem) => void;
    rect: DOMRect;
    selectedIndex: number;
};

type UsePostEditorOptions = {
    content?: string;
    placeholder?: string;
    editorClass?: string;
    /** Pass [post.id] when editing so the editor resets when a different post opens */
    deps?: any[];
};

export function usePostEditor({
    content,
    placeholder = "Share an update, tip, or story… Use @ for vendors, # for categories",
    editorClass = "post-composer-editor focus:outline-none",
    deps = [],
}: UsePostEditorOptions = {}) {
    // ── Dropdown state ──────────────────────────────────────────────────────
    const mentionRef = useRef<MentionDropdown | null>(null);
    const [, bumpMention] = useReducer((x: number) => x + 1, 0);

    const openMention = useCallback((d: MentionDropdown) => {
        mentionRef.current = d;
        bumpMention();
    }, []);

    const updateMention = useCallback((items: MentionItem[], rect: DOMRect, command: (item: MentionItem) => void) => {
        if (mentionRef.current) {
            mentionRef.current = { ...mentionRef.current, items, rect, command, selectedIndex: 0 };
            bumpMention();
        }
    }, []);

    const closeMention = useCallback(() => {
        mentionRef.current = null;
        bumpMention();
    }, []);

    const moveMention = useCallback((dir: 1 | -1): boolean => {
        const d = mentionRef.current;
        if (!d || d.items.length === 0) return false;
        mentionRef.current = { ...d, selectedIndex: (d.selectedIndex + dir + d.items.length) % d.items.length };
        bumpMention();
        return true;
    }, []);

    const selectMention = useCallback((): boolean => {
        const d = mentionRef.current;
        if (!d || d.items.length === 0) return false;
        d.command(d.items[d.selectedIndex]);
        return true;
    }, []);

    // Stable refs so ProseMirror callbacks always call the latest version
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

    // ── Data queries ────────────────────────────────────────────────────────
    const { data: vendorsData } = useQuery({
        queryKey: ["vendors"],
        queryFn: () => fetchVendors(),
        staleTime: 5 * 60 * 1000,
    });
    const { data: categoriesData } = useQuery({
        queryKey: ["categories"],
        queryFn: fetchCategories,
        staleTime: 5 * 60 * 1000,
    });

    const allVendorsRef = useRef<MentionItem[]>([]);
    const allCategoriesRef = useRef<MentionItem[]>([]);

    useEffect(() => {
        allVendorsRef.current = (vendorsData ?? []).map(v => ({ id: v.id, label: v.name }));
    }, [vendorsData]);

    useEffect(() => {
        allCategoriesRef.current = (categoriesData ?? []).map(c => ({ id: String(c.id), label: c.name }));
    }, [categoriesData]);

    // ── Extension instances ─────────────────────────────────────────────────
    // Full config is burned into each extension via addOptions() inside extend()
    // rather than via configure(), which prevents char/renderText bleed between
    // two Mention-based extensions sharing the same options prototype.
    const VendorMention = useMemo(() => Mention.extend({
        name: "vendorMention",
        addOptions(): any {
            return {
                ...this.parent?.(),
                HTMLAttributes: { class: "mention-vendor" },
                deleteTriggerWithBackspace: false,
                renderHTML: ({ node }: { options: any; node: any }) => [
                    "span",
                    mergeAttributes(
                        { "data-type": "vendorMention", class: "mention-vendor" },
                        { "data-id": node.attrs.id, "data-label": node.attrs.label },
                    ),
                    `@${node.attrs.label ?? node.attrs.id}`,
                ],
                renderText: ({ node }: { options: any; node: any }) =>
                    `@${node.attrs.label ?? node.attrs.id}`,
                suggestion: {
                    pluginKey: new PluginKey("vendorMentionSuggestion"),
                    char: "@",
                    items: ({ query }: { query: string }) =>
                        allVendorsRef.current
                            .filter(i => i.label.toLowerCase().includes(query.toLowerCase()))
                            .slice(0, 8),
                    render: () => ({
                        onStart: (props: any) => {
                            const rect = props.clientRect?.();
                            if (!rect) return;
                            openMentionRef.current({
                                type: "vendor",
                                items: props.items,
                                command: (item: MentionItem) => props.command({ id: item.id, label: item.label }),
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
                                (item: MentionItem) => props.command({ id: item.id, label: item.label }),
                            );
                        },
                        onKeyDown: ({ event }: { event: KeyboardEvent }) => {
                            if (event.key === "ArrowDown") return moveMentionRef.current(1);
                            if (event.key === "ArrowUp") return moveMentionRef.current(-1);
                            if (event.key === "Enter") return selectMentionRef.current();
                            return false;
                        },
                        onExit: () => closeMentionRef.current(),
                    }),
                },
            };
        },
    }), []); // eslint-disable-line react-hooks/exhaustive-deps

    const CategoryMention = useMemo(() => Mention.extend({
        name: "categoryMention",
        addOptions(): any {
            return {
                ...this.parent?.(),
                HTMLAttributes: { class: "mention-category" },
                renderHTML: ({ node }: { options: any; node: any }) => [
                    "span",
                    mergeAttributes(
                        { "data-type": "categoryMention", class: "mention-category" },
                        { "data-id": node.attrs.id, "data-label": node.attrs.label },
                    ),
                    `#${node.attrs.label ?? node.attrs.id}`,
                ],
                renderText: ({ node }: { options: any; node: any }) =>
                    `#${node.attrs.label ?? node.attrs.id}`,
                suggestion: {
                    pluginKey: new PluginKey("categoryMentionSuggestion"),
                    char: "#",
                    items: ({ query }: { query: string }) =>
                        allCategoriesRef.current
                            .filter(i => i.label.toLowerCase().includes(query.toLowerCase()))
                            .slice(0, 8),
                    render: () => ({
                        onStart: (props: any) => {
                            const rect = props.clientRect?.();
                            if (!rect) return;
                            openMentionRef.current({
                                type: "category",
                                items: props.items,
                                command: (item: MentionItem) => props.command({ id: item.id, label: item.label }),
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
                                (item: MentionItem) => props.command({ id: item.id, label: item.label }),
                            );
                        },
                        onKeyDown: ({ event }: { event: KeyboardEvent }) => {
                            if (event.key === "ArrowDown") return moveMentionRef.current(1);
                            if (event.key === "ArrowUp") return moveMentionRef.current(-1);
                            if (event.key === "Enter") return selectMentionRef.current();
                            return false;
                        },
                        onExit: () => closeMentionRef.current(),
                    }),
                },
            };
        },
    }), []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Editor ──────────────────────────────────────────────────────────────
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const editor = useEditor({
        extensions: [
            StarterKit,
            Underline,
            TextStyle,
            FontSize,
            Placeholder.configure({ placeholder }),
            VendorMention,
            CategoryMention,
        ],
        content,
        editorProps: {
            attributes: { class: editorClass },
        },
    }, deps);

    const editorState = useEditorState({
        editor,
        selector: (ctx) => ({
            fontSize: ctx.editor?.getAttributes("textStyle").fontSize?.replace("px", "") ?? "14",
            isBold: !!ctx.editor?.isActive("bold"),
            isItalic: !!ctx.editor?.isActive("italic"),
            isUnderline: !!ctx.editor?.isActive("underline"),
        }),
    });

    return {
        editor,
        editorState,
        dropdown: mentionRef.current,
        bumpMention,
    };
}
