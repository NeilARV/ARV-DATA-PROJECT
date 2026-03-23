import {
  Dialog as RadixDialog,
  DialogContent,
} from "@/components/ui/dialog";
import { cn } from "@/utils/merge";

interface AppDialogProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** When true: hides close button, blocks outside-click and escape-key dismissal */
  forced?: boolean;
  /** Tailwind classes forwarded to DialogContent (use for sizing, overflow, etc.) */
  className?: string;
}

export default function AppDialog({
  open,
  onClose,
  children,
  forced = false,
  className,
}: AppDialogProps) {
  return (
    <RadixDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !forced) onClose();
      }}
    >
      <DialogContent
        className={cn(forced && "[&>button]:hidden", className)}
        onPointerDownOutside={(e) => {
          if (forced) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (forced) e.preventDefault();
        }}
      >
        {children}
      </DialogContent>
    </RadixDialog>
  );
}
