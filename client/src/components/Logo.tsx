import { useTheme } from '@/hooks/use-theme';
import darkLogoUrl from '@assets/arv-data-logo-dark.png';
import lightLogoUrl from '@assets/arv-data-logo-light.png';

/** The ARV Data wordmark logo, auto-swapping between the light/dark variant for the active theme. */
export function Logo({ className = 'h-12 w-auto' }: { className?: string }) {
    const { isDark } = useTheme();
    return <img src={isDark ? lightLogoUrl : darkLogoUrl} alt="ARV Data" className={className} />;
}
