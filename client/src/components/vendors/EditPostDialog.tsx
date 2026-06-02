import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PostComposer } from './PostComposer';
import type { PostComposerHandle } from './PostComposer';
import type { Post } from '@/types/vendors';

type EditPostDialogProps = {
    open: boolean;
    onClose: () => void;
    post: Post;
};

export function EditPostDialog({ open, onClose, post }: EditPostDialogProps) {
    const composerRef = useRef<PostComposerHandle>(null);
    const [isPending, setIsPending] = useState(false);

    return (
        <Dialog open={open} onOpenChange={(v) => !v && !isPending && onClose()}>
            <DialogContent
                className="max-w-lg"
                onPointerDownOutside={(e) => {
                    if ((e.target as Element).closest('[data-mention-dropdown]')) {
                        e.preventDefault();
                    }
                }}
            >
                <DialogHeader>
                    <DialogTitle>Edit Post</DialogTitle>
                </DialogHeader>

                <PostComposer
                    ref={composerRef}
                    post={post}
                    onSuccess={onClose}
                    hideSubmitButton
                    onPendingChange={setIsPending}
                />

                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={onClose} disabled={isPending}>
                        Cancel
                    </Button>
                    <Button onClick={() => composerRef.current?.submit()} disabled={isPending}>
                        {isPending ? 'Saving...' : 'Save'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
