import { Check } from 'lucide-react';

/** A checkmarked feature-list item used in the marketing app sections. */
export function FeatureBullet({ children }: { children: React.ReactNode }) {
    return (
        <li className="flex items-start gap-2 text-sm text-muted-foreground">
            <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
            <span>{children}</span>
        </li>
    );
}
