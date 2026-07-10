import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';

export type SearchOption = { id: string; label: string; sublabel?: string };

type AsyncSearchSelectProps = {
    placeholder: string;
    search: string;
    onSearchChange: (value: string) => void;
    options: SearchOption[];
    onSelect: (option: SearchOption) => void;
    isLoading?: boolean;
    disabled?: boolean;
    emptyText?: string;
};

/** Text input with an inline async results dropdown; the parent owns the (debounced) query. */
export default function AsyncSearchSelect({
    placeholder,
    search,
    onSearchChange,
    options,
    onSelect,
    isLoading = false,
    disabled = false,
    emptyText = 'No matches',
}: AsyncSearchSelectProps) {
    const showDropdown = search.trim().length > 0;

    return (
        <div className="relative">
            <Input
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={placeholder}
                aria-label={placeholder}
                disabled={disabled}
            />
            {showDropdown && (
                <div className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-md">
                    {isLoading ? (
                        <div className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Searching...
                        </div>
                    ) : options.length === 0 ? (
                        <div className="px-2 py-2 text-sm text-muted-foreground">{emptyText}</div>
                    ) : (
                        options.map((option) => (
                            <button
                                key={option.id}
                                type="button"
                                onClick={() => onSelect(option)}
                                className="flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                            >
                                <span className="font-medium">{option.label}</span>
                                {option.sublabel && (
                                    <span className="text-xs text-muted-foreground">
                                        {option.sublabel}
                                    </span>
                                )}
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
