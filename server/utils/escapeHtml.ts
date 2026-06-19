/**
 * Escape the HTML-special characters in plain text so it is safe to interpolate
 * into an HTML document or email body. This lets no markup through; when the input
 * is intentionally rich HTML, use `sanitizeMessageHtml` from `./sanitizeHtml` instead.
 * @param text untrusted plain-text input
 * @returns the input with &, <, >, ", and ' replaced by their HTML entities
 */
export function escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, (char) => {
        switch (char) {
            case '&':
                return '&amp;';
            case '<':
                return '&lt;';
            case '>':
                return '&gt;';
            case '"':
                return '&quot;';
            case "'":
                return '&#39;';
            default:
                return char;
        }
    });
}
