import { useState } from "react";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { AdminUser, AccountTypeOption, RelationshipManager } from "@/types/admin";

const SUBSCRIPTION_TIERS = ["basic", "pro", "premium"] as const;
const NO_VALUE = "__none__";

export type EditUserContentProps = {
  user: AdminUser;
  relationshipManagers: RelationshipManager[];
  accountTypesList: AccountTypeOption[];
  onClose: () => void;
  onSuccess?: () => void;
};

export default function EditUserContent({
  user,
  relationshipManagers,
  accountTypesList,
  onClose,
  onSuccess,
}: EditUserContentProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const [selectedRmId, setSelectedRmId] = useState<string | null>(
    user.relationshipManagers?.[0]?.id ?? null
  );
  const [selectedTier, setSelectedTier] = useState<string | null>(user.subscriptionTier);
  const [selectedAccountTypes, setSelectedAccountTypes] = useState<string[]>(
    user.accountTypes ?? []
  );

  const availableAccountTypes = accountTypesList.filter(
    (t) => !selectedAccountTypes.includes(t.name)
  );

  const handleSave = async () => {
    setIsLoading(true);
    try {
      await apiRequest("PATCH", `/api/users/${user.id}`, {
        subscriptionTier: selectedTier,
        accountTypes: selectedAccountTypes,
        relationshipManagerId: selectedRmId,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users/?excludeDomain=arvfinance.com"] });
      toast({ title: "User updated", description: "Changes have been saved." });
      onSuccess?.();
      onClose();
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update user",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit User</DialogTitle>
      </DialogHeader>

      <div className="space-y-4 pt-2">
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none">User</label>
          <Input
            value={`${user.firstName} ${user.lastName}`}
            readOnly
            className="bg-muted cursor-not-allowed"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium leading-none">Relationship Manager</label>
          <Select
            value={selectedRmId ?? NO_VALUE}
            onValueChange={(v) => setSelectedRmId(v === NO_VALUE ? null : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="No manager" />
            </SelectTrigger>
            <SelectContent className="z-[10000]">
              <SelectItem value={NO_VALUE}>No manager</SelectItem>
              {relationshipManagers
                .filter((rm) => rm.id !== user.id)
                .map((rm) => (
                  <SelectItem key={rm.id} value={rm.id}>
                    {rm.first_name} {rm.last_name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium leading-none">Account Tier</label>
          <Select
            value={selectedTier ?? NO_VALUE}
            onValueChange={(v) => setSelectedTier(v === NO_VALUE ? null : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="No tier" />
            </SelectTrigger>
            <SelectContent className="z-[10000]">
              <SelectItem value={NO_VALUE}>No tier</SelectItem>
              {SUBSCRIPTION_TIERS.map((tier) => (
                <SelectItem key={tier} value={tier}>
                  {tier}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium leading-none">Account Types</label>
          <div className="flex flex-wrap gap-1.5 min-h-[28px]">
            {selectedAccountTypes.map((typeName) => (
              <Badge
                key={typeName}
                variant="secondary"
                className="gap-0.5 pr-0.5 font-normal"
              >
                {typeName}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 rounded-full hover:bg-destructive/20 hover:text-destructive"
                  aria-label={`Remove ${typeName}`}
                  onClick={() =>
                    setSelectedAccountTypes((prev) => prev.filter((t) => t !== typeName))
                  }
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
            {availableAccountTypes.length > 0 && (
              <Select
                value=""
                onValueChange={(v) => {
                  if (v) setSelectedAccountTypes((prev) => [...prev, v]);
                }}
              >
                <SelectTrigger className="h-7 w-[120px] border-dashed">
                  <SelectValue placeholder="Add type" />
                </SelectTrigger>
                <SelectContent className="z-[10000]">
                  {availableAccountTypes.map((t) => (
                    <SelectItem key={t.id} value={t.name} hideIndicator>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {selectedAccountTypes.length === 0 && availableAccountTypes.length === 0 && (
              <span className="text-sm text-muted-foreground">No account types available</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-2 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          className="flex-1"
          disabled={isLoading}
        >
          Cancel
        </Button>
        <Button
          type="button"
          className="flex-1"
          onClick={handleSave}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            "Save"
          )}
        </Button>
      </div>
    </>
  );
}
