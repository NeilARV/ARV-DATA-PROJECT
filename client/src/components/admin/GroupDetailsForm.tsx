import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { parseApiError } from '@/utils/apiError';
import type { Group } from '@shared/types/groups';

type GroupDetailsFormProps = {
    group: Group;
};

/**
 * Rename / edit-description form for a group. Seed the inputs from the group once — mount with
 * `key={group.id}` so switching groups reinitializes them (RX.NO-DERIVED-STATE).
 */
export default function GroupDetailsForm({ group }: GroupDetailsFormProps) {
    const { toast } = useToast();
    const [name, setName] = useState(group.name);
    const [description, setDescription] = useState(group.description ?? '');

    const updateMutation = useMutation({
        mutationFn: async () => {
            const res = await apiRequest('PATCH', `/api/groups/${group.id}`, {
                name: name.trim(),
                description: description.trim() ? description.trim() : null,
            });
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['/api/groups'] });
            toast({ title: 'Group updated' });
        },
        onError: (error) =>
            toast({
                title: 'Could not update group',
                description: parseApiError(error),
                variant: 'destructive',
            }),
    });

    const trimmedName = name.trim();
    const isDirty =
        trimmedName !== group.name || description.trim() !== (group.description ?? '');
    const canSave = trimmedName.length > 0 && isDirty && !updateMutation.isPending;

    return (
        <section className="space-y-3">
            <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground" htmlFor="group-name">
                    Name
                </label>
                <Input
                    id="group-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={255}
                />
            </div>
            <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground" htmlFor="group-description">
                    Description{' '}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <Textarea
                    id="group-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    maxLength={1000}
                    placeholder="Who is this operator?"
                />
            </div>
            <div className="flex justify-end">
                <Button size="sm" onClick={() => updateMutation.mutate()} disabled={!canSave}>
                    {updateMutation.isPending ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                        </>
                    ) : (
                        'Save changes'
                    )}
                </Button>
            </div>
        </section>
    );
}
