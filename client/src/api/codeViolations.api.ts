import { apiRequest } from '@/lib/queryClient';

// Response shapes for the admin code-violation endpoints. Dates arrive as ISO strings.
export interface CvUploadStatus {
    id: string;
    fileName: string | null;
    status: string;
    rowCount: number | null;
    matchedCount: number | null;
    error: string | null;
    createdAt: string | null;
    processedAt: string | null;
}

export interface CvUploadViolation {
    id: string;
    recordNumber: string;
    rawAddress: string | null;
    violationDate: string | null;
    applicationName: string | null;
    status: string | null;
    matchMethod: string | null;
    matchConfidence: string | null;
    reviewStatus: string;
    propertyId: string | null;
    matchedAddress: string | null;
    ownerCompany: string | null;
    recipientCount: number;
    notified: boolean;
}

/**
 * Upload an Accela CSV for processing. Uses a raw fetch (multipart) since apiRequest
 * JSON-encodes its body. Resolves once the server accepts it (202) — processing continues
 * server-side; poll fetchCodeViolationUpload for status.
 */
export async function uploadCodeViolationCsv(file: File): Promise<{ uploadId: string }> {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/admin/code-violations/uploads', {
        method: 'POST',
        body: formData,
        credentials: 'include',
    });

    if (!res.ok) {
        const text = (await res.text()) || res.statusText;
        let message = text;
        try {
            const json = JSON.parse(text);
            if (typeof json.message === 'string') message = json.message;
        } catch {
            // non-JSON error body — use the raw text
        }
        throw new Error(message);
    }
    return res.json();
}

/** Fetch one upload's processing status + summary. */
export async function fetchCodeViolationUpload(uploadId: string): Promise<{ upload: CvUploadStatus }> {
    const res = await apiRequest('GET', `/api/admin/code-violations/uploads/${uploadId}`);
    return res.json();
}

/** Fetch the enriched violation rows for one upload (the review list). */
export async function fetchCodeViolationViolations(
    uploadId: string,
): Promise<{ violations: CvUploadViolation[] }> {
    const res = await apiRequest('GET', `/api/admin/code-violations/uploads/${uploadId}/violations`);
    return res.json();
}
