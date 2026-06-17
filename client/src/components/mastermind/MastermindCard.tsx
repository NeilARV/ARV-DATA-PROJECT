import { Link } from 'wouter';
import { Loader2, Mail, Phone, Globe, X, type LucideIcon } from 'lucide-react';

type MastermindCardProps = {
    /** Display name — callers compile first/last or pass a company name. */
    name: string;
    /** When set, the name becomes a link to this route (e.g. a vendor's page). */
    nameHref?: string | null;
    imageUrl?: string | null;
    /** Fallback avatar initials when no image is available (e.g. user mentions). */
    initials?: string | null;
    /** Background color for the initials fallback avatar. */
    avatarColor?: string;
    /** Fallback avatar icon when there is no image or initials (e.g. vendor mentions). */
    fallbackIcon?: LucideIcon;
    description?: string | null;
    email?: string | null;
    phone?: string | null;
    website?: string | null;
    /** Shows a subtle spinner while async fields (vendor details) are still loading. */
    isLoading?: boolean;
    /** Card width in px. Vendors are given a wider card so the description reads well. */
    width?: number;
    onClose: () => void;
};

function normalizeUrl(url: string): string {
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

type ContactRowProps = { icon: LucideIcon; children: React.ReactNode };

function ContactRow({ icon: Icon, children }: ContactRowProps) {
    return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="min-w-0 truncate">{children}</span>
        </div>
    );
}

// Presentational mention card shared by user and vendor chips. Every field is optional and
// rendered only when present, so the same component serves both: users pass name + image,
// vendors pass name + logo + description + phone/website. The caller owns the data shaping.
export function MastermindCard({
    name,
    nameHref,
    imageUrl,
    initials,
    avatarColor,
    fallbackIcon: FallbackIcon,
    description,
    email,
    phone,
    website,
    isLoading = false,
    width = 288,
    onClose,
}: MastermindCardProps) {
    const hasContact = !!(email || phone || website);

    return (
        <div
            className="relative bg-background border border-border rounded-lg shadow-lg overflow-hidden"
            style={{ width }}
        >
            {/* Close tucks into the top-left corner, between the card edge and the avatar. The
                content is shifted right and down (asymmetric padding) to leave room for it. */}
            <button
                type="button"
                onClick={onClose}
                className="absolute top-1.5 left-1.5 z-10 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="Close"
            >
                <X className="w-3.5 h-3.5" />
            </button>

            <div className="pt-5 pl-7 pr-4 pb-4">
                {/* Avatar beside name (+ description when present). Without a description the name
                    is vertically centered with the avatar. */}
                <div className={`flex gap-3 ${description ? 'items-start' : 'items-center'}`}>
                    <div className="w-11 h-11 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center bg-muted">
                        {imageUrl ? (
                            <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                        ) : initials ? (
                            <span
                                className="w-full h-full flex items-center justify-center text-white text-sm font-semibold"
                                style={{ backgroundColor: avatarColor }}
                            >
                                {initials}
                            </span>
                        ) : FallbackIcon ? (
                            <FallbackIcon className="w-6 h-6 text-muted-foreground" />
                        ) : null}
                    </div>

                    <div className="flex-1 min-w-0">
                        {nameHref ? (
                            <Link
                                href={nameHref}
                                className="block text-sm font-semibold text-foreground leading-tight break-words hover:text-primary hover:underline transition-colors"
                            >
                                {name}
                            </Link>
                        ) : (
                            <p className="text-sm font-semibold text-foreground leading-tight break-words">
                                {name}
                            </p>
                        )}

                        {description && (
                            <p className="text-sm text-muted-foreground mt-1 leading-relaxed max-h-40 overflow-y-auto">
                                {description}
                            </p>
                        )}
                    </div>
                </div>

                {hasContact && (
                    <div className="space-y-1.5 mt-3">
                        {phone && <ContactRow icon={Phone}>{phone}</ContactRow>}
                        {email && (
                            <ContactRow icon={Mail}>
                                <a
                                    href={`mailto:${email}`}
                                    className="hover:text-primary transition-colors"
                                >
                                    {email}
                                </a>
                            </ContactRow>
                        )}
                        {website && (
                            <ContactRow icon={Globe}>
                                <a
                                    href={normalizeUrl(website)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hover:text-primary transition-colors"
                                >
                                    {website.replace(/^https?:\/\//, '')}
                                </a>
                            </ContactRow>
                        )}
                    </div>
                )}

                {isLoading && (
                    <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Loading…
                    </div>
                )}
            </div>
        </div>
    );
}
