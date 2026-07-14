import { Loader2 } from 'lucide-react';

import { Button, type ButtonProps } from '@/components/ui/button';

type SubmitButtonProps = ButtonProps & {
    /** Whether the associated action is in flight; shows a spinner and disables the button. */
    loading: boolean;
    /** Label to show while loading; falls back to the button's normal children. */
    loadingText?: string;
};

/** A submit button that swaps its label for a spinner and disables itself while `loading`. */
export function SubmitButton({
    loading,
    loadingText,
    children,
    disabled,
    type = 'submit',
    ...props
}: SubmitButtonProps) {
    return (
        <Button type={type} disabled={disabled || loading} {...props}>
            {loading ? (
                <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {loadingText ?? children}
                </>
            ) : (
                children
            )}
        </Button>
    );
}
