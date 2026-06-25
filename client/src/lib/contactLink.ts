import type { ContactSubject } from '@database/validation/contactMessages.validation';

/**
 * Builds a link to the centralized `/contact` page with an optional prefilled subject/message.
 * Used wherever the app used to open the contact modal (header, gated-access panels, request-access
 * flows) so contact entry points all funnel to one page.
 */
export function buildContactUrl(subject?: ContactSubject, message?: string): string {
    const params = new URLSearchParams();
    if (subject) params.set('subject', subject);
    if (message) params.set('message', message);
    const qs = params.toString();
    return qs ? `/contact?${qs}` : '/contact';
}
