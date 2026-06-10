import type { MessageReactionSummary } from '@shared/mastermind/events';

type MessageReactionsProps = {
    reactions: MessageReactionSummary[];
    onToggle: (emoji: string) => void;
};

export function MessageReactions({ reactions, onToggle }: MessageReactionsProps) {
    if (reactions.length === 0) return null;

    return (
        <div className="flex flex-wrap gap-1 mt-1">
            {reactions.map((reaction) => (
                <button
                    key={reaction.emoji}
                    type="button"
                    onClick={() => onToggle(reaction.emoji)}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
                        reaction.reactedByMe
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-muted text-foreground hover:bg-accent'
                    }`}
                >
                    <span className="leading-none">{reaction.emoji}</span>
                    <span className="tabular-nums">{reaction.count}</span>
                </button>
            ))}
        </div>
    );
}
