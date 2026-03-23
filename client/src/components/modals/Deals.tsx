import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Handshake } from "lucide-react";

interface DealsContentProps {
  onClose: () => void;
}

export default function DealsContent({ onClose }: DealsContentProps) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-xl">
          <Handshake className="w-5 h-5 text-primary" />
          Deal Feed
        </DialogTitle>
      </DialogHeader>

      <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
        <Handshake className="w-12 h-12 text-muted-foreground/40" />
        <p className="text-lg font-medium text-muted-foreground">Deal feed coming soon</p>
        <p className="text-sm text-muted-foreground/60">
          Posted deals from verified wholesalers will appear here.
        </p>
      </div>
    </>
  );
}
