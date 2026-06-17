import { useState } from 'react';
import { Download, FileText } from 'lucide-react';

import { ImageLightbox } from '@/components/vendors/ImageLightbox';

import type { LinkPreviewWire, MessageAttachmentWire } from '@shared/mastermind/events';

type MessageMediaProps = {
    attachments: MessageAttachmentWire[];
    previews: LinkPreviewWire[];
};

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// A message's media — images, file downloads, and link previews — renders as three clearly
// separated blocks sharing one max width, so it's always obvious what's what. Only the blocks that
// exist render, and they're spaced apart (not crammed into one bordered box) so every combination
// stays legible: a lone image, a link + a file, or the full mix all read cleanly.
export function MessageMedia({ attachments, previews }: MessageMediaProps) {
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

    const images = attachments.filter((a) => a.fileType.startsWith('image/'));
    const files = attachments.filter((a) => !a.fileType.startsWith('image/'));

    if (images.length === 0 && files.length === 0 && previews.length === 0) return null;

    const lightboxImages = images.map((a, i) => ({ id: i, imageUrl: a.fileUrl, displayOrder: i }));

    return (
        <div className="mt-1.5 max-w-md space-y-2">
            {images.length > 0 && (
                <ImageGrid images={images} onOpen={(i) => setLightboxIndex(i)} />
            )}

            {files.length > 0 && (
                <div className="space-y-1.5">
                    {files.map((file) => (
                        <a
                            key={file.id}
                            href={file.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            download={file.fileName}
                            className="flex items-center gap-2.5 rounded-lg border border-border bg-card hover:bg-accent transition-colors px-3 py-2.5"
                        >
                            <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            <span className="flex flex-col min-w-0">
                                <span className="text-sm text-foreground truncate">
                                    {file.fileName}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {formatFileSize(file.fileSizeBytes)}
                                </span>
                            </span>
                            <Download className="w-4 h-4 text-muted-foreground flex-shrink-0 ml-auto" />
                        </a>
                    ))}
                </div>
            )}

            {previews.length > 0 && (
                <div className="space-y-2">
                    {previews.map((preview) => (
                        <LinkPreviewCard key={preview.url} preview={preview} />
                    ))}
                </div>
            )}

            {lightboxIndex !== null && lightboxImages.length > 0 && (
                <ImageLightbox
                    images={lightboxImages}
                    initialIndex={lightboxIndex}
                    onClose={() => setLightboxIndex(null)}
                />
            )}
        </div>
    );
}

// A single image fills its frame; multiples become a 2-column mosaic with hairline seams. An odd
// final tile spans the full width so the grid never ends on a lonely square.
function ImageGrid({
    images,
    onOpen,
}: {
    images: MessageAttachmentWire[];
    onOpen: (index: number) => void;
}) {
    if (images.length === 1) {
        return (
            <button
                type="button"
                onClick={() => onOpen(0)}
                className="block w-full overflow-hidden rounded-lg border border-border"
            >
                <img
                    src={images[0].fileUrl}
                    alt={images[0].fileName}
                    className="w-full max-h-80 object-cover"
                />
            </button>
        );
    }

    const isOdd = images.length % 2 === 1;
    return (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border">
            {images.map((image, i) => {
                const spanFull = isOdd && i === images.length - 1;
                return (
                    <button
                        key={image.id}
                        type="button"
                        onClick={() => onOpen(i)}
                        className={`block bg-card ${spanFull ? 'col-span-2' : ''}`}
                    >
                        <img
                            src={image.fileUrl}
                            alt={image.fileName}
                            className={`w-full object-cover ${spanFull ? 'max-h-60' : 'aspect-square'}`}
                        />
                    </button>
                );
            })}
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
            className="flex h-24 w-full overflow-hidden rounded-lg border border-border bg-card hover:bg-accent transition-colors"
        >
            {showImage && (
                // object-cover fills the thumbnail edge-to-edge (no letterbox bars); a wide og:image
                // is cropped to the box rather than shrunk inside it.
                <img
                    src={preview.image!}
                    alt=""
                    onError={() => setImageFailed(true)}
                    className="h-full hidden sm:flex w-38 flex-shrink-0 object-scale-down"
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
