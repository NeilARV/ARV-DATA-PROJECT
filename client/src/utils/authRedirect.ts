// Resolves a post-auth redirect target from a query string, restricted to internal
// paths (single leading slash) so an attacker can't craft an off-site redirect.
export function getRedirectTarget(search: string): string {
    const raw = new URLSearchParams(search).get('redirect');
    if (!raw) return '/';
    // Must be a single-slash internal path. Reject protocol-relative ("//") and
    // backslash variants ("/\", "\/") that browsers normalize to "//".
    if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '/';
    return raw;
}
