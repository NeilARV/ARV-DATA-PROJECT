/** A pulsing green "live" indicator dot. */
export function LiveDot() {
    return (
        <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-online opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-status-online" />
        </span>
    );
}
