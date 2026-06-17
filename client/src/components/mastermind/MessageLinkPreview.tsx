import { useState } from 'react';

import type { LinkPreviewWire } from '@shared/mastermind/events';

type MessageLinkPreviewProps = {
    previews: LinkPreviewWire[];
};

export function MessageLinkPreview({ previews }: MessageLinkPreviewProps) {
    if (previews.length === 0) return null;

    return (
        <div className="mt-1 mb-1 space-y-1.5">
            {previews.map((preview) => (
                <LinkPreviewCard key={preview.url} preview={preview} />
            ))}
        </div>
    );
}

function LinkPreviewCard({ preview }: { preview: LinkPreviewWire }) {
    // og:image and favicon are remote third-party URLs that can 404; on failure we drop them so a
    // broken image never leaves a blank column or a broken-glyph chip.
    const [imageFailed, setImageFailed] = useState(false);
    const [logoFailed, setLogoFailed] = useState(false);

    const showImage = !!preview.image && !imageFailed;
    const showLogo = !!preview.logo && !logoFailed;

    return (
        <a
            href={preview.url}
            target="_blank"
            rel="noopener noreferrer"
            // Fixed height + h-full landscape image means the picture always fills its box
            // edge-to-edge (no gap below it) and never crops a wide og:image into a square.
            className="flex h-24 w-full max-w-lg overflow-hidden rounded-lg border border-border bg-muted hover:bg-accent transition-colors"
        >
            {showImage && (
                <img
                    src={preview.image!}
                    alt=""
                    onError={() => setImageFailed(true)}
                    className="h-full w-38 flex-shrink-0 object-scale-down bg-background"
                />
            )}
            <div className="flex flex-col justify-center min-w-0 gap-1 px-3 py-2">
                {(showLogo || preview.publisher) && (
                    <span className="flex items-center gap-1.5 min-w-0">
                        {showLogo && (
                            // White chip so dark/transparent favicons stay visible in dark mode.
                            <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-white">
                                <img
                                    src={preview.logo!}
                                    alt=""
                                    onError={() => setLogoFailed(true)}
                                    className="h-3 w-3 rounded-full object-contain"
                                />
                            </span>
                        )}
                        {preview.publisher && (
                            <span className="text-xs text-muted-foreground truncate">
                                {preview.publisher}
                            </span>
                        )}
                    </span>
                )}
                {preview.title && (
                    <span className="text-sm font-medium text-foreground line-clamp-1">
                        {preview.title}
                    </span>
                )}
                {preview.description && (
                    <span className="text-xs text-muted-foreground line-clamp-2">
                        {preview.description}
                    </span>
                )}
            </div>
        </a>
    );
}
