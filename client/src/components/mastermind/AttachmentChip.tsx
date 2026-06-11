import { FileText, X } from 'lucide-react';

type AttachmentChipProps = {
    previewUrl: string | null;
    fileName: string;
    onRemove: () => void;
};

export function AttachmentChip({ previewUrl, fileName, onRemove }: AttachmentChipProps) {
    return (
        <div className="relative flex items-center gap-2 rounded-md border border-border bg-muted px-2 py-1.5 max-w-[180px]">
            {previewUrl ? (
                <img src={previewUrl} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
            ) : (
                <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            )}
            <span className="text-xs text-foreground truncate">{fileName}</span>
            <button
                type="button"
                onClick={onRemove}
                className="flex-shrink-0 text-muted-foreground hover:text-destructive transition-colors"
            >
                <X className="w-3.5 h-3.5" />
            </button>
        </div>
    );
}
