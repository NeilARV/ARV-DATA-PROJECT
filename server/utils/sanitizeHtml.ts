import sanitizeHtml from 'sanitize-html';

// Tags TipTap emits (StarterKit + link + underline + mention). Anything outside this
// allowlist is stripped, which is what closes the stored-XSS hole on message content.
const ALLOWED_TAGS = [
    'p',
    'br',
    'hr',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'strike',
    'code',
    'pre',
    'blockquote',
    'ul',
    'ol',
    'li',
    'a',
    'span',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
];

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
        a: ['href', 'target', 'rel'],
        ol: ['start'],
        // TipTap mention nodes render as <span data-type="mention" data-id="…">.
        span: ['data-type', 'data-id', 'data-label'],
    },
    // Restrict span classes to the mention marker so stored content can't hook arbitrary CSS.
    allowedClasses: {
        span: ['mention'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    // Force safe link behavior regardless of what the client sent.
    transformTags: {
        a: sanitizeHtml.simpleTransform('a', {
            rel: 'noopener noreferrer nofollow',
            target: '_blank',
        }),
    },
};

// Strips disallowed tags/attributes from TipTap HTML before it is persisted.
export function sanitizeMessageHtml(dirty: string): string {
    return sanitizeHtml(dirty, SANITIZE_OPTIONS);
}

// True when the HTML carries no visible text (e.g. "<p></p>" or only stripped tags),
// so callers can reject a message that is empty once sanitized.
export function isHtmlEmpty(html: string): boolean {
    const text = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
        .replace(/&nbsp;/g, ' ')
        .trim();
    return text.length === 0;
}
