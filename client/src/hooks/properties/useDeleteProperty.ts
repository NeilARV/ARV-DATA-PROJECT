import { useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { deleteProperty } from '@/api/admin.api';
import { useToast } from '@/hooks/use-toast';
import { useProperty } from '@/hooks/useProperty';

export function useDeleteProperty(onSuccess?: () => void) {
    const { toast } = useToast();
    const { setProperty } = useProperty();

    return useMutation({
        mutationFn: deleteProperty,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['/api/properties'] });
            queryClient.invalidateQueries({ queryKey: ['/api/properties/map'] });
            toast({ title: 'Success', description: 'Property has been deleted' });
            setProperty(null);
            onSuccess?.();
        },
        onError: (error: any) => {
            toast({
                title: 'Error',
                description: error.message || 'Failed to delete property',
                variant: 'destructive',
            });
        },
    });
}
