import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { LogOut, Mail, Menu, Moon, Rocket, Settings, Sun, User, X } from 'lucide-react';

import { NotificationBell } from '@/components/mastermind/NotificationBell';
import { Logo, btnGhost, btnPrimary, scrollToSection } from '@/components/Home/primitives';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { useToast } from '@/hooks/use-toast';

// Section ids on the marketing home page that the nav links scroll to (see components/Home/*).
const NAV_LINKS = [
    { label: 'Data', id: 'data' },
    { label: 'Deals', id: 'deals' },
    { label: 'Vendors', id: 'vendors' },
    { label: 'Mastermind', id: 'mastermind' },
] as const;

/**
 * The clean, public-facing header for the marketing pages (home, login, signup, contact). Distinct
 * from the in-app `Header` used inside Data/Deals/Vendors/Mastermind. Logged-out visitors get
 * Sign in / Get started; logged-in users get Launch App, the notification bell, and a profile menu.
 */
export function MarketingHeader() {
    const [location, setLocation] = useLocation();
    const { isAuthenticated, canAccessAdminPanel, logout } = useAuth();
    const { toast } = useToast();
    const { isDark, toggleTheme } = useTheme();

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

    // On the home page each nav link scrolls to its section; elsewhere it returns to the home page.
    const onNavLinkClick = (id: string) => {
        if (location === '/') {
            scrollToSection(id);
        } else {
            setLocation('/');
        }
    };

    const handleLogout = () => {
        logout();
        toast({ title: 'Logged Out', description: 'You have been logged out' });
        setLocation('/');
    };

    return (
        <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur">
            <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:px-6">
                <button
                    type="button"
                    onClick={() => setLocation('/')}
                    className="flex items-center gap-2"
                    data-testid="button-marketing-logo"
                >
                    <Logo />
                </button>

                <nav className="hidden items-center gap-1 lg:flex">
                    {NAV_LINKS.map((link) => (
                        <button
                            key={link.id}
                            type="button"
                            onClick={() => onNavLinkClick(link.id)}
                            className={btnGhost}
                        >
                            {link.label}
                        </button>
                    ))}
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
                            <button
                                type="button"
                                onClick={() => setLocation('/data')}
                                className={btnPrimary}
                                data-testid="button-marketing-launch"
                            >
                                <Rocket className="h-4 w-4" />
                                <span className="hidden sm:inline">Launch App</span>
                            </button>

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
