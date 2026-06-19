import { useEffect, useMemo, useState } from 'react';

import { MAX_ATTACHMENTS_PER_MESSAGE } from '@/constants/mastermind';

import type { MessageAttachmentWire } from '@shared/mastermind/events';

// A pending attachment in the editor: either one that already exists on the message (kept by
// reference) or a newly picked file (uploaded by the caller on save). Each carries a stable `id`
// so list rendering keys on identity, not array index.
export type AttachmentDraft =
    | { id: string; kind: 'existing'; attachment: MessageAttachmentWire }
    | { id: string; kind: 'new'; file: File };

export type UseAttachmentDraftsResult = {
    drafts: AttachmentDraft[];
    previewUrls: (string | null)[];
    canAddMore: boolean;
    hasAttachments: boolean;
    keptAttachments: MessageAttachmentWire[];
    newFiles: File[];
    addFiles: (files: File[]) => void;
    removeDraft: (id: string) => void;
    reset: () => void;
};

/**
 * Manage the set of attachment drafts for a message editor: existing attachments (seeded from
 * `initial`) plus newly picked files, capped at MAX_ATTACHMENTS_PER_MESSAGE. Provides image
 * preview URLs (revoked automatically when the draft set changes) and the split kept/new lists
 * the caller persists on save.
 * @param initial existing attachments to seed as `kind: 'existing'` drafts (omit for a fresh composer)
 * @returns the draft list, preview URLs, capacity/state flags, the kept/new split, and mutators
 */
export function useAttachmentDrafts(initial?: MessageAttachmentWire[]): UseAttachmentDraftsResult {
    const [drafts, setDrafts] = useState<AttachmentDraft[]>(() =>
        (initial ?? []).map((attachment) => ({ id: attachment.id, kind: 'existing', attachment })),
    );

    // Image previews: existing attachments use their stored URL; new files get a transient object
    // URL that is revoked when the draft set changes (see the cleanup effect below).
    const previewUrls = useMemo(
        () =>
            drafts.map((draft) => {
                if (draft.kind === 'existing') {
                    return draft.attachment.fileType.startsWith('image/')
                        ? draft.attachment.fileUrl
                        : null;
                }
                return draft.file.type.startsWith('image/') ? URL.createObjectURL(draft.file) : null;
            }),
        [drafts],
    );
    useEffect(() => {
        return () => {
            drafts.forEach((draft, i) => {
                const url = previewUrls[i];
                if (draft.kind === 'new' && url) URL.revokeObjectURL(url);
            });
        };
    }, [drafts, previewUrls]);

    function addFiles(files: File[]): void {
        const slots = MAX_ATTACHMENTS_PER_MESSAGE - drafts.length;
        if (slots <= 0) return;
        setDrafts((prev) => [
            ...prev,
            ...files.slice(0, slots).map((file) => ({ id: crypto.randomUUID(), kind: 'new' as const, file })),
        ]);
    }

    function removeDraft(id: string): void {
        setDrafts((prev) => prev.filter((draft) => draft.id !== id));
    }

    function reset(): void {
        setDrafts([]);
    }

    const keptAttachments = drafts.flatMap((draft) =>
        draft.kind === 'existing' ? [draft.attachment] : [],
    );
    const newFiles = drafts.flatMap((draft) => (draft.kind === 'new' ? [draft.file] : []));

    return {
        drafts,
        previewUrls,
        canAddMore: drafts.length < MAX_ATTACHMENTS_PER_MESSAGE,
        hasAttachments: drafts.length > 0,
        keptAttachments,
        newFiles,
        addFiles,
        removeDraft,
        reset,
    };
}
