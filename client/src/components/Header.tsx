import { Button } from '@/components/ui/button';
import {
    Map,
    Grid3x3,
    Table2,
    Moon,
    Sun,
    Settings,
    LogIn,
    LogOut,
    Users,
    Menu,
    User,
    DollarSign,
    Handshake,
    ChevronDown,
    Mail,
    Store,
    X,
    Brain,
    Database,
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import darkLogoUrl from '@assets/arv-data-logo-dark.png';
import lightLogoUrl from '@assets/arv-data-logo-light.png';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { useView } from '@/hooks/useView';
import { useFilters } from '@/hooks/useFilters';
import { useRequireSubscription } from '@/hooks/useRequireSubscription';
import { useDialogs } from '@/hooks/useDialogs';
import { BUYERS_FEED_STATUS_FILTERS } from '@/constants/propertyStatus.constants';
import { WHOLESALE_VIEW_STATUS_FILTERS } from '@/constants/propertyStatus.constants';
import { useCompanies } from '@/hooks/useCompanies';
import { useGeoMap } from '@/hooks/useMap';
import { MAP_ZOOM_LOGO, MAP_ZOOM_COUNTY } from '@/constants/map.constants';
import { getCountyCenter, getDefaultMapCenter } from '@/lib/county';
import { useProperty } from '@/hooks/useProperty';

export default function Header() {
    const { openDialog } = useDialogs();
    const { filters, setFilters, setSortBy, clearFilters } = useFilters();
    const { view, setView, setSidebarView } = useView();
    const { setProperty } = useProperty();
    const { setCompany, loadCompanies, company } = useCompanies();
    const { setMapCenter, setMapZoom } = useGeoMap();

    // Initialize isDark synchronously to avoid wrong logo on first render
    const [isDark, setIsDark] = useState(() => {
        // Check localStorage first (faster)
        const storedTheme = localStorage.getItem('theme');
        if (storedTheme === 'dark') return true;
        if (storedTheme === 'light') return false;
        // Fallback to checking DOM class list
        return document.documentElement.classList.contains('dark');
    });
    const [showMenu, setShowMenu] = useState(false);
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const { requireSubscription, ContactDialog, setShowContact } = useRequireSubscription();

    const menuRef = useRef<HTMLDivElement>(null);
    const moreMenuRef = useRef<HTMLDivElement>(null);
    const [location, setLocation] = useLocation();
    const { user, isAuthenticated, canAccessAdminPanel, canAccessApp, logout } = useAuth();
    const { toast } = useToast();

    // Sync with DOM changes on mount (e.g., if theme was set elsewhere)
    useEffect(() => {
        const isDarkMode = document.documentElement.classList.contains('dark');
        if (isDarkMode !== isDark) {
            setIsDark(isDarkMode);
        }
    }, [isDark]);

    // Handle click outside to close menu
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

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
                setShowMoreMenu(false);
            }
        };
        if (showMoreMenu) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [showMoreMenu]);

    const toggleTheme = () => {
        const newIsDark = !isDark;
        setIsDark(newIsDark);
        if (newIsDark) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    };

    const handleLogout = async () => {
        try {
            logout();
            toast({
                title: 'Logged Out',
                description: 'You have been logged out',
            });
            setLocation('/');
        } catch (error) {
            console.error('Error logging out:', error);
            toast({
                title: 'Error',
                description: 'Failed to log out',
                variant: 'destructive',
            });
        }
    };

    const onBuyersFeedClick = () => {
        requireSubscription(() => {
            setProperty(null);
            setFilters((prev) => ({ ...prev, statusFilters: BUYERS_FEED_STATUS_FILTERS }));
            setView('buyers-feed');
            loadCompanies({ sort: 'most-bought-properties' });
        });
    };

    const onWholesaleClick = () => {
        requireSubscription(() => {
            setProperty(null);
            setFilters((prev) => ({ ...prev, statusFilters: WHOLESALE_VIEW_STATUS_FILTERS }));
            setView('wholesale');
            loadCompanies({ sort: 'wholesalers' });
        });
    };

    const onTableViewClick = () => {
        requireSubscription(() => {
            setProperty(null);
            setView('table');
        });
    };

    const onLogoClick = async () => {
        setLocation('/');
        setView('map');
        setSidebarView('directory');
        setCompany(null);
        setProperty(null);
        setSortBy('recently-sold');
        setMapCenter(undefined);
        setMapZoom(MAP_ZOOM_LOGO);
    };

    return (
        <header
            className="h-16 border-b border-border bg-background flex items-center px-4 gap-4 relative"
            data-testid="header-main"
        >
            {/* Left: Logo */}
            <div className="flex-1 flex items-center min-w-0">
                <button
                    className="flex items-center hover:opacity-80 transition-opacity cursor-pointer flex-shrink-0"
                    onClick={onLogoClick}
                    data-testid="button-logo-home"
                >
                    <img
                        src={isDark ? lightLogoUrl : darkLogoUrl}
                        alt="ARV DATA"
                        className="h-16 w-auto"
                        data-testid="img-logo"
                    />
                    <h1 className="text-xl lg:text-2xl font-semibold hidden lg:block">ARV Data</h1>
                </button>

                {/* Mobile: centered brand title */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none lg:hidden">
                    <span className="text-base font-semibold text-foreground">ARV Finance</span>
                </div>
            </div>

            {/* Center: Nav buttons — desktop only */}
            <div className="hidden lg:flex items-center gap-3">
                <Button
                    variant={location === '/deals' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setLocation('/deals')}
                    data-testid="button-deals"
                >
                    <Handshake className="w-4 h-4 mr-1" />
                    Deal Room
                </Button>

                <div className="flex items-center border border-border rounded-md">
                    <Button
                        variant={
                            location === '/' && view === 'buyers-feed' ? 'default' : 'ghost'
                        }
                        size="sm"
                        onClick={onBuyersFeedClick}
                        className="rounded-r-none"
                        data-testid="button-buyers-feed"
                    >
                        <Users className="w-4 h-4 mr-1" />
                        Buyers Feed
                    </Button>
                    <span className="w-px h-5 bg-border shrink-0" />
                    <Button
                        variant={location === '/' && view === 'wholesale' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={onWholesaleClick}
                        className="rounded-none"
                        data-testid="button-wholesale"
                    >
                        <DollarSign className="w-4 h-4 mr-1" />
                        Wholesale
                    </Button>
                    <span className="w-px h-5 bg-border shrink-0" />
                    <Button
                        variant={location === '/' && view === 'map' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => {
                            setView('map');
                            const county = filters?.county ?? 'San Diego';
                            const center = getCountyCenter(county) ?? getDefaultMapCenter();
                            setMapCenter(center);
                            setMapZoom(MAP_ZOOM_COUNTY);
                        }}
                        className="rounded-none"
                        data-testid="button-view-map"
                    >
                        <Map className="w-4 h-4 mr-1" />
                        Map
                    </Button>
                    <span className="w-px h-5 bg-border shrink-0" />
                    <div className="relative" ref={moreMenuRef}>
                        <Button
                            variant={
                                location === '/' && (view === 'grid' || view === 'table')
                                    ? 'default'
                                    : 'ghost'
                            }
                            size="sm"
                            className="rounded-l-none gap-1"
                            data-testid="button-view-more"
                            onClick={() => setShowMoreMenu(!showMoreMenu)}
                        >
                            {view === 'grid' ? (
                                <Grid3x3 className="w-4 h-4 mr-1" />
                            ) : view === 'table' ? (
                                <Table2 className="w-4 h-4 mr-1" />
                            ) : null}
                            {view === 'grid' ? 'Grid' : view === 'table' ? 'Table' : 'More'}
                            <ChevronDown className="w-3 h-3" />
                        </Button>
                        {showMoreMenu && (
                            <div className="absolute right-0 mt-2 w-36 bg-background border border-border rounded-md shadow-lg z-[502]">
                                <div className="py-1">
                                    <button
                                        className="w-full text-left px-4 py-2 text-sm hover:bg-muted flex items-center gap-2"
                                        data-testid="button-view-grid"
                                        onClick={() => {
                                            requireSubscription(() => {
                                                setView('grid');
                                                if (!company) clearFilters();
                                            });
                                            setShowMoreMenu(false);
                                        }}
                                    >
                                        <Grid3x3 className="w-4 h-4" />
                                        Grid
                                    </button>
                                    <button
                                        className="w-full text-left px-4 py-2 text-sm hover:bg-muted flex items-center gap-2"
                                        data-testid="button-view-table"
                                        onClick={() => {
                                            onTableViewClick();
                                            setShowMoreMenu(false);
                                        }}
                                    >
                                        <Table2 className="w-4 h-4" />
                                        Table
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <Button
                    variant={location === '/vendors' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setLocation('/vendors')}
                    data-testid="button-vendors"
                >
                    <Store className="w-4 h-4 mr-1" />
                    Vendors
                </Button>

                {canAccessApp && (
                    <Button
                        variant={location === '/mastermind' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setLocation('/mastermind')}
                        data-testid="button-mastermind"
                    >
                        <Brain className="w-4 h-4 mr-1" />
                        Mastermind
                    </Button>
                )}
            </div>

            {/* Right: Theme + Hamburger */}
            <div className="flex-1 flex items-center justify-end gap-2">
                {!isAuthenticated ? (
                    <>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openDialog({ type: 'login' })}
                            data-testid="button-login"
                        >
                            <LogIn className="w-4 h-4 mr-1" />
                            <span className="hidden sm:inline">Login</span>
                        </Button>
                        <Button
                            size="sm"
                            onClick={() => openDialog({ type: 'signup' })}
                            data-testid="button-signup"
                        >
                            Sign up
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowContact(true)}
                            data-testid="button-contact-logged-out"
                        >
                            <Mail className="w-4 h-4 mr-1" />
                            <span className="hidden sm:inline">Contact Us</span>
                        </Button>
                    </>
                ) : (
                    <>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={toggleTheme}
                            data-testid="button-theme-toggle"
                        >
                            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                        </Button>

                        {user && (
                            <div className="relative" ref={menuRef}>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setShowMenu(!showMenu)}
                                    data-testid="button-menu-toggle"
                                >
                                    {showMenu ? (
                                        <X className="w-4 h-4" />
                                    ) : (
                                        <Menu className="w-4 h-4" />
                                    )}
                                </Button>
                                {showMenu && (
                                    <div
                                        className="absolute right-0 mt-2 w-48 bg-background border border-border rounded-md shadow-lg z-[502]"
                                        data-testid="menu-dropdown"
                                    >
                                        <div className="py-1">
                                            {/* Mobile-only navigation links — hidden on lg+ where header buttons are visible */}
                                            <div className="lg:hidden">
                                                <button
                                                    className="w-full text-left px-4 py-2 text-sm hover:bg-muted flex items-center gap-2"
                                                    onClick={() => {
                                                        onLogoClick();
                                                        setShowMenu(false);
                                                    }}
                                                    data-testid="menu-item-data"
                                                >
                                                    <Database className="w-4 h-4" />
                                                    Data App
                                                </button>
                                                <button
                                                    className="w-full text-left px-4 py-2 text-sm hover:bg-muted flex items-center gap-2"
                                                    onClick={() => {
                                                        setLocation('/deals');
                                                        setShowMenu(false);
                                                    }}
                                                    data-testid="menu-item-deals"
                                                >
                                                    <Handshake className="w-4 h-4" />
                                                    Deal Room
                                                </button>
                                                <button
                                                    className="w-full text-left px-4 py-2 text-sm hover:bg-muted flex items-center gap-2"
                                                    onClick={() => {
                                                        setLocation('/vendors');
                                                        setShowMenu(false);
                                                    }}
                                                    data-testid="menu-item-vendors"
                                                >
                                                    <Store className="w-4 h-4" />
                                                    Vendors
                                                </button>
                                                {canAccessApp && (
                                                    <button
                                                        className="w-full text-left px-4 py-2 text-sm hover:bg-muted flex items-center gap-2"
                                                        onClick={() => {
                                                            setLocation('/mastermind');
                                                            setShowMenu(false);
                                                        }}
                                                        data-testid="menu-item-mastermind"
                                                    >
                                                        <Brain className="w-4 h-4" />
                                                        Mastermind
                                                    </button>
                                                )}
                                                <div className="border-t border-border mx-2 my-1" />
                                            </div>

                                            <button
                                                className="w-full text-left px-4 py-2 text-sm hover:bg-muted flex items-center gap-2"
                                                onClick={() => {
                                                    setLocation('/profile');
                                                    setShowMenu(false);
                                                }}
                                                data-testid="menu-item-profile"
                                            >
                                                <User className="w-4 h-4" />
                                                Profile Settings
                                            </button>
                                            <button
                                                className="w-full text-left px-4 py-2 text-sm hover:bg-muted flex items-center gap-2"
                                                onClick={() => {
                                                    setShowContact(true);
                                                    setShowMenu(false);
                                                }}
                                                data-testid="menu-item-contact"
                                            >
                                                <Mail className="w-4 h-4" />
                                                Contact Us
                                            </button>
                                            {canAccessAdminPanel && (
                                                <button
                                                    className="w-full text-left px-4 py-2 text-sm hover:bg-muted flex items-center gap-2"
                                                    onClick={() => {
                                                        setLocation('/admin');
                                                        setShowMenu(false);
                                                    }}
                                                    data-testid="menu-item-admin"
                                                >
                                                    <Settings className="w-4 h-4" />
                                                    Admin
                                                </button>
                                            )}
                                            <button
                                                className="w-full text-left px-4 py-2 text-sm hover:bg-muted flex items-center gap-2"
                                                onClick={() => {
                                                    handleLogout();
                                                    setShowMenu(false);
                                                }}
                                                data-testid="menu-item-logout"
                                            >
                                                <LogOut className="w-4 h-4" />
                                                Logout
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

            {ContactDialog}
        </header>
    );
}
