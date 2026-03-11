import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { User, Mail, Phone } from "lucide-react";
import { formatPhoneNumber } from "@/utils/formatPhoneNumber";
import type { RelationshipManager } from "@/hooks/use-auth";

interface InfoModalProps {
  open: boolean;
  onClose: () => void;
  relationshipManager: RelationshipManager;
}

export default function InfoModal({ open, onClose, relationshipManager }: InfoModalProps) {
  const phone = relationshipManager.phone
    ? (relationshipManager.phone.includes("(")
        ? relationshipManager.phone
        : formatPhoneNumber(relationshipManager.phone))
    : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm" data-testid="modal-info">
        <DialogHeader>
          <DialogTitle>Your Relationship Manager</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-4 py-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <User className="w-8 h-8 text-primary" />
          </div>

          <div className="flex flex-col items-start gap-1.5 min-w-0">
            <p className="text-base font-semibold text-foreground">
              {relationshipManager.firstName} {relationshipManager.lastName}
            </p>
            <div className="flex items-center gap-2 text-sm">
              <Mail className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <a
                href={`mailto:${relationshipManager.email}`}
                className="text-primary hover:underline truncate"
              >
                {relationshipManager.email}
              </a>
            </div>
            {phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <a
                  href={`tel:${relationshipManager.phone?.replace(/\D/g, "")}`}
                  className="text-foreground hover:underline"
                >
                  {phone}
                </a>
              </div>
            )}
          </div>
        </div>

        <Button variant="outline" onClick={onClose} className="w-full" data-testid="button-info-close">
          Close
        </Button>
      </DialogContent>
    </Dialog>
  );
}
