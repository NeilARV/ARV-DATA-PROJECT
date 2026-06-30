import { useCallback, useEffect, useState } from 'react';

/** Reads the current theme: an explicit `theme` choice in localStorage wins, else the root `dark` class. */
function getInitialIsDark(): boolean {
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme === 'dark') return true;
    if (storedTheme === 'light') return false;
    return document.documentElement.classList.contains('dark');
}

/**
 * Tracks and toggles the app's dark/light theme. `isDark` stays in sync across every consumer by
 * observing the root `dark` class, so toggling in one place (e.g. the header) updates siblings
 * (e.g. the footer logo) without prop drilling or a shared provider.
 *
 * @returns `isDark` — true when dark mode is active — and `toggleTheme` to flip it.
 */
export function useTheme() {
    const [isDark, setIsDark] = useState(getInitialIsDark);

    useEffect(() => {
        const root = document.documentElement;
        const observer = new MutationObserver(() => setIsDark(root.classList.contains('dark')));
        observer.observe(root, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    const toggleTheme = useCallback(() => {
        const next = !document.documentElement.classList.contains('dark');
        document.documentElement.classList.toggle('dark', next);
        localStorage.setItem('theme', next ? 'dark' : 'light');
        // The MutationObserver above will pick up the class change and update `isDark`.
    }, []);

    return { isDark, toggleTheme };
}
