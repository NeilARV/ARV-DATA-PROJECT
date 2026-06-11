import { useState } from 'react';
import { Download, FileText } from 'lucide-react';

import { ImageLightbox } from '@/components/vendors/ImageLightbox';

import type { MessageAttachmentWire } from '@shared/mastermind/events';

type MessageAttachmentsProps = {
    attachments: MessageAttachmentWire[];
};

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MessageAttachments({ attachments }: MessageAttachmentsProps) {
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

    if (attachments.length === 0) return null;

    const images = attachments.filter((a) => a.fileType.startsWith('image/'));
    const files = attachments.filter((a) => !a.fileType.startsWith('image/'));

    const lightboxImages = images.map((a, i) => ({
        id: i,
        imageUrl: a.fileUrl,
        displayOrder: i,
    }));

    return (
        <div className="mt-1 mb-1 space-y-1.5">
            {images.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {images.map((image, i) => (
                        <button
                            key={image.id}
                            type="button"
                            onClick={() => setLightboxIndex(i)}
                            className="block rounded-lg overflow-hidden border border-border"
                        >
                            <img
                                src={image.fileUrl}
                                alt={image.fileName}
                                className="max-h-60 max-w-[320px] object-cover"
                            />
                        </button>
                    ))}
                </div>
            )}

            {files.map((file) => (
                <a
                    key={file.id}
                    href={file.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={file.fileName}
                    className="flex w-fit items-center gap-2 rounded-md border border-border bg-muted hover:bg-accent transition-colors px-3 py-2 max-w-sm"
                >
                    <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="flex flex-col min-w-0">
                        <span className="text-sm text-foreground truncate">{file.fileName}</span>
                        <span className="text-xs text-muted-foreground">
                            {formatFileSize(file.fileSizeBytes)}
                        </span>
                    </span>
                    <Download className="w-4 h-4 text-muted-foreground flex-shrink-0 ml-auto" />
                </a>
            ))}

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
