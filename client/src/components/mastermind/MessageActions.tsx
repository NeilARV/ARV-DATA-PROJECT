import { useState } from 'react';
import { Pencil, Pin, SmilePlus, Trash2 } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import { MASTERMIND_REACTION_EMOJIS } from '@/constants/mastermind';

type MessageActionsProps = {
    onReact: (emoji: string) => void;
    canPin: boolean;
    onPin: () => void;
    isAuthor: boolean;
    onEdit: () => void;
    canDelete: boolean;
    onDelete: () => void;
};

export function MessageActions({
    onReact,
    canPin,
    onPin,
    isAuthor,
    onEdit,
    canDelete,
    onDelete,
}: MessageActionsProps) {
    const [pickerOpen, setPickerOpen] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);

    const actionBtn =
        'w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors';

    return (
        <div className="absolute -top-3 right-4 hidden group-hover:flex items-center gap-0.5 rounded-md border border-border bg-background shadow-sm p-0.5">
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                    <button type="button" className={actionBtn} title="Add reaction">
                        <SmilePlus className="w-4 h-4" />
                    </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-auto p-1">
                    <div className="flex items-center gap-0.5">
                        {MASTERMIND_REACTION_EMOJIS.map((emoji) => (
                            <button
                                key={emoji}
                                type="button"
                                onClick={() => {
                                    onReact(emoji);
                                    setPickerOpen(false);
                                }}
                                className="w-8 h-8 flex items-center justify-center rounded-md text-base hover:bg-accent transition-colors"
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                </PopoverContent>
            </Popover>

            {canPin && (
                <button type="button" className={actionBtn} title="Pin message" onClick={onPin}>
                    <Pin className="w-4 h-4" />
                </button>
            )}

            {isAuthor && (
                <button type="button" className={actionBtn} title="Edit message" onClick={onEdit}>
                    <Pencil className="w-4 h-4" />
                </button>
            )}

            {canDelete && (
                <>
                    <button
                        type="button"
                        className={`${actionBtn} hover:text-destructive`}
                        title="Delete message"
                        onClick={() => setConfirmOpen(true)}
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Delete message?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This message will be removed for everyone. This cannot be
                                    undone.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={onDelete}
                                >
                                    Delete
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </>
            )}
        </div>
    );
}
