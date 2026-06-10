import { createPortal } from 'react-dom';

import type { MentionDropdown } from '@/hooks/use-mastermind-editor';

type MentionDropdownPortalProps = {
    dropdown: MentionDropdown | null;
};

export function MentionDropdownPortal({ dropdown }: MentionDropdownPortalProps) {
    if (!dropdown || dropdown.items.length === 0) return null;

    return createPortal(
        <div
            className="fixed z-[99999] bg-background border border-border rounded-lg shadow-lg overflow-hidden py-1"
            data-mention-dropdown="true"
            style={{
                bottom: window.innerHeight - dropdown.rect.top + 6,
                left: Math.max(8, Math.min(dropdown.rect.left, window.innerWidth - 252)),
                minWidth: 200,
                maxWidth: 280,
            }}
        >
            <div className="px-3 py-1 text-xs font-medium text-muted-foreground">
                Mention someone
            </div>
            {dropdown.items.map((item, i) => {
                const isBroadcast = item.id === '@channel';
                return (
                    <button
                        key={item.id}
                        type="button"
                        className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors ${
                            i === dropdown.selectedIndex ? 'bg-accent' : 'hover:bg-accent'
                        }`}
                        onMouseDown={(e) => {
                            e.preventDefault();
                            dropdown.command(item);
                        }}
                    >
                        <span
                            className={`text-xs font-semibold ${
                                isBroadcast ? 'text-amber-500' : 'text-primary'
                            }`}
                        >
                            @
                        </span>
                        <span className={isBroadcast ? 'font-medium' : ''}>{item.label}</span>
                        {isBroadcast && (
                            <span className="ml-auto text-xs text-muted-foreground">
                                all members
                            </span>
                        )}
                    </button>
                );
            })}
        </div>,
        document.body,
    );
}
