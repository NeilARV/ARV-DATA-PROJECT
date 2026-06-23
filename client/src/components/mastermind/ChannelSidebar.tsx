import { useState } from 'react';
import { Brain, Hash, MessageSquarePlus, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AddChannelDialog } from '@/components/mastermind/AddChannelDialog';
import { EditChannelDialog } from '@/components/mastermind/EditChannelDialog';
import { DeleteChannelDialog } from '@/components/mastermind/DeleteChannelDialog';
import { NewDmDialog } from '@/components/mastermind/NewDmDialog';
import { UserAvatar } from '@/components/mastermind/UserAvatar';

import type { ChannelSummary } from '@/types/mastermind';
import type { DirectMessageSummaryWire } from '@shared/mastermind/events';

type ChannelSidebarProps = {
    channels: ChannelSummary[];
    activeChannelId: string | null;
    onSelectChannel: (id: string) => void;
    canManageChannels: boolean;
    onChannelRenamed: (channelId: string, newName: string) => void;
    onChannelDeleted: (channelId: string) => void;
    dms: DirectMessageSummaryWire[];
    activeDmUserId: string | null;
    onSelectDm: (userId: string) => void;
};

function UnreadBadge({ count, hasMention }: { count: number; hasMention: boolean }) {
    if (count === 0) return null;
    const label = count > 99 ? '99+' : String(count);
    return (
        <span className={`mm-unread-badge ${hasMention ? 'mm-unread-badge-mention' : ''}`}>
            {label}
        </span>
    );
}

export function ChannelSidebar({
    channels,
    activeChannelId,
    onSelectChannel,
    canManageChannels,
    onChannelRenamed,
    onChannelDeleted,
    dms,
    activeDmUserId,
    onSelectDm,
}: ChannelSidebarProps) {
    const [addOpen, setAddOpen] = useState(false);
    const [newDmOpen, setNewDmOpen] = useState(false);
    const [channelToEdit, setChannelToEdit] = useState<ChannelSummary | null>(null);
    const [channelToDelete, setChannelToDelete] = useState<ChannelSummary | null>(null);

    return (
        <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border w-full md:w-60 lg:w-64 flex-shrink-0">
            {/* Community header */}
            <div className="flex items-center gap-2.5 px-4 py-4 border-b border-sidebar-border flex-shrink-0">
                <Brain className="w-5 h-5 text-primary flex-shrink-0" />
                <span className="text-base lg:text-lg font-semibold text-foreground truncate">ARV Mastermind</span>
            </div>

            {/* Scrollable channel list */}
            <div className="flex-1 overflow-y-auto py-2 min-h-0">
                <div className="flex items-center justify-between px-3 mb-1">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Channels
                    </span>
                    {canManageChannels && (
                        <button
                            onClick={() => setAddOpen(true)}
                            className="p-0.5 rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
                            aria-label="Add channel"
                            title="Add channel"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                    )}
                </div>

                <ul>
                    {channels.map((c) => {
                        const isActive = activeChannelId === c.id;
                        const hasUnread = c.unreadCount > 0;
                        return (
                            <li key={c.id} className="group relative">
                                <button
                                    onClick={() => onSelectChannel(c.id)}
                                    className={`mm-channel-item ${isActive ? 'mm-channel-item-active' : ''} ${canManageChannels ? 'pr-8' : ''}`}
                                >
                                    <Hash className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                                    <span
                                        className={`truncate flex-1 ${hasUnread && !isActive ? 'font-semibold text-foreground' : ''}`}
                                    >
                                        {c.name}
                                    </span>
                                    {!isActive && (
                                        <UnreadBadge
                                            count={c.unreadCount}
                                            hasMention={c.hasMention}
                                        />
                                    )}
                                </button>

                                {canManageChannels && (
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <button
                                                className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-sidebar-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 data-[state=open]:bg-sidebar-accent"
                                                aria-label={`Manage #${c.name}`}
                                            >
                                                <MoreVertical className="w-4 h-4" />
                                            </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onSelect={() => setChannelToEdit(c)}>
                                                <Pencil className="w-4 h-4" />
                                                Edit
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                onSelect={() => setChannelToDelete(c)}
                                                className="text-destructive focus:text-destructive"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                                Delete
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                )}
                            </li>
                        );
                    })}
                </ul>

                {/* Direct Messages */}
                <div className="flex items-center justify-between px-3 mt-5 mb-1">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Direct Messages
                    </span>
                    <button
                        onClick={() => setNewDmOpen(true)}
                        className="p-0.5 rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
                        aria-label="New message"
                        title="New message"
                    >
                        <MessageSquarePlus className="w-4 h-4" />
                    </button>
                </div>

                {dms.length === 0 ? (
                    <p className="px-3 text-xs text-muted-foreground italic">No conversations yet</p>
                ) : (
                    <ul>
                        {dms.map((dm) => {
                            const isActive = activeDmUserId === dm.otherUser.id;
                            const hasUnread = dm.unreadCount > 0;
                            const name =
                                `${dm.otherUser.firstName} ${dm.otherUser.lastName}`.trim();
                            return (
                                <li key={dm.channelId}>
                                    <button
                                        onClick={() => onSelectDm(dm.otherUser.id)}
                                        className={`mm-channel-item ${isActive ? 'mm-channel-item-active' : ''}`}
                                    >
                                        <UserAvatar
                                            user={dm.otherUser}
                                            sizeClass="w-4 h-4"
                                            textClass="text-[8px]"
                                        />
                                        <span
                                            className={`truncate flex-1 ${hasUnread && !isActive ? 'font-semibold text-foreground' : ''}`}
                                        >
                                            {name}
                                        </span>
                                        {!isActive && (
                                            <UnreadBadge count={dm.unreadCount} hasMention={false} />
                                        )}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            <NewDmDialog open={newDmOpen} onClose={() => setNewDmOpen(false)} />

            {canManageChannels && (
                <>
                    <AddChannelDialog open={addOpen} onClose={() => setAddOpen(false)} />
                    {channelToEdit && (
                        <EditChannelDialog
                            open
                            channel={channelToEdit}
                            onClose={() => setChannelToEdit(null)}
                            onRenamed={(newName) => onChannelRenamed(channelToEdit.id, newName)}
                        />
                    )}
                    {channelToDelete && (
                        <DeleteChannelDialog
                            open
                            channel={channelToDelete}
                            onClose={() => setChannelToDelete(null)}
                            onDeleted={() => onChannelDeleted(channelToDelete.id)}
                        />
                    )}
                </>
            )}
        </div>
    );
}
