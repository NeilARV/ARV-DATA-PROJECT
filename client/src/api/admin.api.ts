import { apiRequest } from '@/lib/queryClient';

export async function deleteProperty(id: string): Promise<void> {
    await apiRequest('DELETE', `/api/properties/${id}`);
}
