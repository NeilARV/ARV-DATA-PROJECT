import type {
    CvIngestResponse,
    CvUploadDetailResponse,
    CvUploadListResponse,
} from '@shared/types/code-violations';

const BASE = '/api/code-violations';

/**
 * Throw a clean `Error` (the server's JSON `message`, falling back to raw text) for a non-2xx
 * response, so callers can surface `err.message` directly. These wrappers use `fetch` rather than
 * `apiRequest` because the upload is multipart (which `apiRequest` would JSON-encode) and the rest
 * stay consistent with it — all within TanStack Query query/mutation functions, never a component.
 */
async function throwIfNotOk(res: Response): Promise<void> {
    if (res.ok) return;
    const text = (await res.text()) || res.statusText;
    let message = text;
    try {
        const json = JSON.parse(text);
        if (typeof json.message === 'string') message = json.message;
    } catch {
        /* response body wasn't JSON — use the raw text */
    }
    throw new Error(message);
}

/**
 * Upload an Accela code-enforcement CSV export (Phase-1 ingest — archives, parses, enqueues, and
 * returns immediately). No `Content-Type` header so the browser sets the multipart boundary.
 *
 * @param file the CSV file to ingest
 * @returns the new upload id and ingest counters
 */
export async function uploadCodeViolationCsv(file: File): Promise<CvIngestResponse> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${BASE}/uploads`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
    });
    await throwIfNotOk(res);
    return res.json();
}

/** List ingest runs, most recent first, for the admin history table. */
export async function fetchCodeViolationUploads(): Promise<CvUploadListResponse> {
    const res = await fetch(`${BASE}/uploads`, { credentials: 'include' });
    await throwIfNotOk(res);
    return res.json();
}

/** Fetch one ingest run plus its per-complaint breakdown (statuses + alert recipients). */
export async function fetchCodeViolationUpload(id: string): Promise<CvUploadDetailResponse> {
    const res = await fetch(`${BASE}/uploads/${id}`, { credentials: 'include' });
    await throwIfNotOk(res);
    return res.json();
}
