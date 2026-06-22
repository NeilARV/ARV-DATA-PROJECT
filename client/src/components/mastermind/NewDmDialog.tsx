import { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

import { fetchDmCandidates, type DmCandidate } from '@/api/dms.api';
import { getAvatarColor } from '@/utils/avatar';

type NewDmDialogProps = {
    open: boolean;
    onClose: () => void;
};

/** Picker to start a new direct message: search Mastermind-eligible users and open a DM with one. */
export function NewDmDialog({ open, onClose }: NewDmDialogProps) {
    const [, setLocation] = useLocation();
    const [search, setSearch] = useState('');

    const { data: candidates, isLoading } = useQuery<DmCandidate[]>({
        queryKey: ['/api/dms/candidates'],
        queryFn: fetchDmCandidates,
        enabled: open,
        staleTime: 2 * 60 * 1000,
    });

    const q = search.trim().toLowerCase();
    const filtered = (candidates ?? []).filter((u) =>
        `${u.firstName} ${u.lastName}`.toLowerCase().includes(q),
    );

    function handleClose() {
        setSearch('');
        onClose();
    }

    function handleSelect(userId: string) {
        handleClose();
        setLocation(`/mastermind/dm/${userId}`);
    }

    return (
        <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>New message</DialogTitle>
                </DialogHeader>

                <div className="space-y-3">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search people…"
                            className="pl-8"
                            autoFocus
                        />
                    </div>

                    <div className="max-h-72 overflow-y-auto">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                            </div>
                        ) : filtered.length === 0 ? (
                            <p className="py-8 text-sm text-muted-foreground text-center">
                                No people found.
                            </p>
                        ) : (
                            <ul>
                                {filtered.map((u) => {
                                    const name = `${u.firstName} ${u.lastName}`.trim();
                                    const initials =
                                        `${u.firstName.charAt(0)}${u.lastName.charAt(0)}`.toUpperCase();
                                    return (
                                        <li key={u.id}>
                                            <button
                                                type="button"
                                                onClick={() => handleSelect(u.id)}
                                                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-accent transition-colors text-left"
                                            >
                                                {u.profileImageUrl ? (
                                                    <img
                                                        src={u.profileImageUrl}
                                                        alt={name}
                                                        className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                                                    />
                                                ) : (
                                                    <div
                                                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                                                        style={{ backgroundColor: getAvatarColor(u.id) }}
                                                    >
                                                        {initials}
                                                    </div>
                                                )}
                                                <span className="text-sm text-foreground truncate">
                                                    {name}
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
