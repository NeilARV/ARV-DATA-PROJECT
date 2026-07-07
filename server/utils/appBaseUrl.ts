const DEFAULT_APP_URL = 'https://data.arvfinance.com';

/**
 * Resolves the app's public base URL for absolute links embedded in outgoing
 * emails (verification links, deal alerts, Mastermind notifications), so links
 * point at the issuing environment — a token minted against one database
 * doesn't exist in another.
 * @returns the APP_URL env value with a scheme and no trailing slash, or the
 * production URL when APP_URL is unset.
 */
export function getAppBaseUrl(): string {
    // || (not ??) on purpose: an empty APP_URL must fall back to the default,
    // never produce scheme-less relative links in an email.
    const raw = process.env.APP_URL?.trim() || DEFAULT_APP_URL;
    // Email clients cannot follow relative or scheme-less URLs
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
    return withScheme.replace(/\/+$/, '');
}
