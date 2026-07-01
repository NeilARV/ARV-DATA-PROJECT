import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import {
    Brain,
    Database,
    Handshake,
    LogOut,
    Mail,
    Menu,
    Moon,
    Rocket,
    Settings,
    Store,
    Sun,
    User,
    X,
} from 'lucide-react';

import { NotificationBell } from '@/components/mastermind/NotificationBell';
import { Logo, btnGhost, btnPrimary, scrollToSection } from '@/components/Home/primitives';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { useToast } from '@/hooks/use-toast';

// Each nav link doubles as a home-page section id (scrolled to on `/`) and an app route
// (navigated to once inside the app). Icons show in the mobile profile-menu links.
const NAV_LINKS = [
    { label: 'Data', id: 'data', path: '/data', icon: Database },
    { label: 'Deals', id: 'deals', path: '/deals', icon: Handshake },
    { label: 'Vendors', id: 'vendors', path: '/vendors', icon: Store },
    { label: 'Mastermind', id: 'mastermind', path: '/mastermind', icon: Brain },
] as const;

// Routes that count as "inside the app": the header swaps its marketing chrome (Launch App,
// scroll-to-section links) for direct app navigation.
const APP_PATHS = ['/data', '/deals', '/vendors', '/mastermind', '/analytics'] as const;

/**
 * The shared site header, used on both the marketing pages (home, contact, auth) and inside the
 * apps (Data/Deals/Vendors/Mastermind). On marketing pages the nav links scroll to home-page
 * sections and logged-in users get a Launch App button; inside the app the links navigate between
 * the four apps and Launch App is dropped. Logged-out visitors get Sign in / Get started;
 * logged-in users get the notification bell and a profile menu.
 */
export function MarketingHeader() {
    const [location, setLocation] = useLocation();
    const { isAuthenticated, canAccessAdminPanel, logout } = useAuth();
    const { toast } = useToast();
    const { isDark, toggleTheme } = useTheme();

    const isInApp = APP_PATHS.some((p) => location === p || location.startsWith(`${p}/`));

    const [showMenu, setShowMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close the profile menu when clicking outside it.
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setShowMenu(false);
            }
        };
        if (showMenu) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [showMenu]);

    // Inside the app each nav link opens its app; on the home page it scrolls to its section;
    // on other marketing pages it returns to the home page.
    const onNavLinkClick = (link: (typeof NAV_LINKS)[number]) => {
        if (isInApp) {
            setLocation(link.path);
        } else if (location === '/') {
            scrollToSection(link.id);
        } else {
            setLocation('/');
        }
    };

    const handleLogout = () => {
        logout();
        toast({ title: 'Logged Out', description: 'You have been logged out' });
        setLocation('/');
    };

    // In-app the header must stay static: `sticky z-50` creates a stacking context that would trap
    // the dropdown menus (z-[502]) below Leaflet's z-[500] map overlays. App layouts don't scroll
    // the body, so sticky adds nothing there; full width matches the edge-to-edge app chrome.
    return (
        <header
            className={
                isInApp
                    ? 'border-b border-border bg-background'
                    : 'sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur'
            }
        >
            <div
                className={`relative flex h-16 items-center justify-between gap-2 px-4 sm:px-6 ${
                    isInApp ? '' : 'mx-auto max-w-7xl'
                }`}
            >
                <button
                    type="button"
                    onClick={() => setLocation('/')}
                    className="flex items-center gap-2"
                    data-testid="button-marketing-logo"
                >
                    <Logo />
                </button>

                {/* Absolutely centered so the links stay anchored to the page center no matter how
                    many controls sit to the right (Launch App, auth buttons, bell, menu). */}
                <nav className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-1 lg:flex">
                    {NAV_LINKS.map((link) => {
                        const isActive =
                            isInApp &&
                            (location === link.path || location.startsWith(`${link.path}/`));
                        return (
                            <button
                                key={link.id}
                                type="button"
                                onClick={() => onNavLinkClick(link)}
                                className={
                                    isActive ? `${btnGhost} bg-accent text-foreground` : btnGhost
                                }
                                data-testid={`button-marketing-nav-${link.id}`}
                            >
                                {link.label}
                            </button>
                        );
                    })}
                </nav>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={toggleTheme}
                        aria-label="Toggle theme"
                        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        data-testid="button-marketing-theme-toggle"
                    >
                        {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    </button>

                    {!isAuthenticated ? (
                        <>
                            <button
                                type="button"
                                onClick={() => setLocation('/login')}
                                className={`${btnGhost} hidden sm:inline-flex`}
                                data-testid="button-marketing-signin"
                            >
                                Sign in
                            </button>
                            <button
                                type="button"
                                onClick={() => setLocation('/signup')}
                                className={btnPrimary}
                                data-testid="button-marketing-getstarted"
                            >
                                Get started
                            </button>
                        </>
                    ) : (
                        <>
                            {!isInApp && (
                                <button
                                    type="button"
                                    onClick={() => setLocation('/data')}
                                    className={btnPrimary}
                                    data-testid="button-marketing-launch"
                                >
                                    <Rocket className="h-4 w-4" />
                                    <span className="hidden sm:inline">Launch App</span>
                                </button>
                            )}

                            <NotificationBell />

                            <div className="relative" ref={menuRef}>
                                <button
                                    type="button"
                                    onClick={() => setShowMenu(!showMenu)}
                                    aria-label="Open menu"
                                    className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    data-testid="button-marketing-menu"
                                >
                                    {showMenu ? (
                                        <X className="h-4 w-4" />
                                    ) : (
                                        <Menu className="h-4 w-4" />
                                    )}
                                </button>
                                {showMenu && (
                                    <div className="absolute right-0 mt-2 w-48 rounded-md border border-border bg-background shadow-lg z-[502]">
                                        <div className="py-1">
                                            {/* In-app on mobile the desktop nav links are hidden, so the
                                                four apps are reachable from the profile menu instead. */}
                                            {isInApp && (
                                                <div className="lg:hidden">
                                                    {NAV_LINKS.map((link) => (
                                                        <button
                                                            key={link.id}
                                                            type="button"
                                                            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-muted"
                                                            onClick={() => {
                                                                setLocation(link.path);
                                                                setShowMenu(false);
                                                            }}
                                                            data-testid={`menu-item-${link.id}`}
                                                        >
                                                            <link.icon className="h-4 w-4" />
                                                            {link.label}
                                                        </button>
                                                    ))}
                                                    <div className="mx-2 my-1 border-t border-border" />
                                                </div>
                                            )}
                                            <button
                                                type="button"
                                                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-muted"
                                                onClick={() => {
                                                    setLocation('/profile');
                                                    setShowMenu(false);
                                                }}
                                            >
                                                <User className="h-4 w-4" />
                                                Profile Settings
                                            </button>
                                            <button
                                                type="button"
                                                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-muted"
                                                onClick={() => {
                                                    setLocation('/contact');
                                                    setShowMenu(false);
                                                }}
                                            >
                                                <Mail className="h-4 w-4" />
                                                Contact Us
                                            </button>
                                            {canAccessAdminPanel && (
                                                <button
                                                    type="button"
                                                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-muted"
                                                    onClick={() => {
                                                        setLocation('/admin');
                                                        setShowMenu(false);
                                                    }}
                                                >
                                                    <Settings className="h-4 w-4" />
                                                    Admin
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-muted"
                                                onClick={() => {
                                                    handleLogout();
                                                    setShowMenu(false);
                                                }}
                                            >
                                                <LogOut className="h-4 w-4" />
                                                Logout
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
}
