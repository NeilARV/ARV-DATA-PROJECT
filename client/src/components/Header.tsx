import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Map,
  Grid3x3,
  Table2,
  Search,
  Moon,
  Sun,
  Settings,
  LogIn,
  LogOut,
  Trophy,
  Users,
  Menu,
  User,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import darkLogoUrl from "@assets/arv-data-logo-dark.png";
import lightLogoUrl from "@assets/arv-data-logo-light.png";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { X } from "lucide-react";

interface HeaderProps {
  viewMode: "map" | "grid" | "table" | "buyers-feed";
  onViewModeChange: (mode: "map" | "grid" | "table" | "buyers-feed") => void;
  onSearch?: (query: string) => void;
  onPropertySelect?: (propertyId: string) => void;
  onLoginClick?: () => void;
  onSignupClick?: () => void;
  onLeaderboardClick?: () => void;
  onBuyersFeedClick?: () => void;
  onLogoClick?: () => void;
  county?: string; // County filter for suggestions
}

interface PropertySuggestion {
  id: string;
  address: string;
  city: string;
  state: string;
  zipcode: string;
}

export default function Header({
  viewMode,
  onViewModeChange,
  onSearch,
  onPropertySelect,
  onLoginClick,
  onSignupClick,
  onLeaderboardClick,
  onBuyersFeedClick,
  onLogoClick,
  county,
}: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isDark, setIsDark] = useState(false);
  const [suggestions, setSuggestions] = useState<PropertySuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, logout } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    const isDarkMode = document.documentElement.classList.contains("dark");
    setIsDark(isDarkMode);
  }, []);

  // Debounced API call for suggestions
  useEffect(() => {
    const fetchSuggestions = async () => {
      const trimmedQuery = searchQuery.trim();
      if (trimmedQuery.length < 2) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      try {
        const countyParam = county ? `&county=${encodeURIComponent(county)}` : '';
        const response = await fetch(
          `/api/properties/suggestions?search=${encodeURIComponent(trimmedQuery)}${countyParam}`,
          { credentials: "include" }
        );
        if (response.ok) {
          const data = await response.json();
          setSuggestions(data);
          setShowSuggestions(data.length > 0);
        }
      } catch (error) {
        console.error("Error fetching suggestions:", error);
        setSuggestions([]);
        setShowSuggestions(false);
      }
    };

    const timeoutId = setTimeout(fetchSuggestions, 300); // 300ms debounce
    return () => clearTimeout(timeoutId);
  }, [searchQuery, county]);

  // Handle click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle click outside to close menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showMenu]);

  const toggleTheme = () => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);
    if (newIsDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setShowSuggestions(false);
    onSearch?.(searchQuery);
    console.log("Search:", searchQuery);
  };

  const selectSuggestion = (suggestion: PropertySuggestion) => {
    // Format the suggestion as a search query (e.g., "123 Main St, San Diego, CA 92101")
    const formattedQuery = `${suggestion.address}, ${suggestion.city}, ${suggestion.state} ${suggestion.zipcode}`;
    setSearchQuery(formattedQuery);
    setShowSuggestions(false);
    
    // If onPropertySelect is provided, fetch and open the property by ID
    if (onPropertySelect) {
      onPropertySelect(suggestion.id);
      setSearchQuery("");
    } else {
      // Fallback to search if onPropertySelect is not provided
      onSearch?.(formattedQuery);
    }
  };

  const handleLogout = async () => {
    try {
      
      logout();
      toast({
        title: "Logged Out",
        description: "You have been logged out",
      });
      setLocation("/");

    } catch (error) {
      console.error("Error logging out:", error);
      toast({
        title: "Error",
        description: "Failed to log out",
        variant: "destructive",
      });
    }
  };

  return (
    <header
      className="h-16 border-b border-border bg-background flex items-center justify-between px-4 gap-4"
      data-testid="header-main"
    >
      {/* Left Section */}
      <div className="flex items-center gap-4 flex-1 min-w-0">
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
          <h1 className="text-lg font-semibold hidden sm:block">ARV DATA</h1>
        </button>

        <form onSubmit={handleSearch} className="flex-1 max-w-md min-w-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              type="search"
              placeholder="Search by address"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (e.target.value.trim().length >= 2) {
                  // Suggestions will show via useEffect
                } else {
                  setShowSuggestions(false);
                }
              }}
              onFocus={() => {
                if (suggestions.length > 0) {
                  setShowSuggestions(true);
                }
              }}
              className="pl-10"
              data-testid="input-search"
            />
            {searchQuery && (
              <X 
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:cursor-pointer hover:text-foreground transition-colors z-10"
                onClick={() => {
                  setSearchQuery("");
                  setSuggestions([]);
                  setShowSuggestions(false);
                }}
              />
            )}
            {showSuggestions && suggestions.length > 0 && (
              <div
                ref={suggestionsRef}
                className="absolute z-[1001] w-full mt-1 bg-background border border-border rounded-md shadow-lg max-h-60 overflow-y-auto"
                data-testid="search-suggestions"
              >
                {suggestions.map((suggestion) => (
                  <div
                    key={suggestion.id}
                    className="px-3 py-2 cursor-pointer hover:bg-muted text-sm"
                    onClick={() => selectSuggestion(suggestion)}
                    data-testid={`suggestion-${suggestion.id}`}
                  >
                    <div className="font-medium">{suggestion.address}</div>
                    <div className="text-muted-foreground text-xs">
                      {suggestion.city}, {suggestion.state} {suggestion.zipcode}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </form>

        <div className="flex items-center gap-3 flex-shrink-0">

            
          <Button
            variant={viewMode === "buyers-feed" ? "default" : "outline"}
            size="sm"
            onClick={onBuyersFeedClick}
            data-testid="button-buyers-feed"
          >
            <Users className="w-4 h-4 mr-1" />
            <span className="hidden sm:inline">Buyers Feed</span>
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={onLeaderboardClick}
            data-testid="button-leaderboard"
          >
            <Trophy className="w-4 h-4 mr-1" />
            <span className="hidden sm:inline">Leaderboard</span>
          </Button>

          <div className="flex items-center border border-border rounded-md">
            <Button
              variant={viewMode === "map" ? "default" : "ghost"}
              size="sm"
              onClick={() => onViewModeChange("map")}
              className="rounded-r-none border-r"
              data-testid="button-view-map"
            >
              <Map className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Map</span>
            </Button>
            <Button
              variant={viewMode === "grid" ? "default" : "ghost"}
              size="sm"
              onClick={() => onViewModeChange("grid")}
              className="rounded-none border-r"
              data-testid="button-view-grid"
            >
              <Grid3x3 className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Grid</span>
            </Button>
            <Button
              variant={viewMode === "table" ? "default" : "ghost"}
              size="sm"
              onClick={() => onViewModeChange("table")}
              className="rounded-l-none"
              data-testid="button-view-table"
            >
              <Table2 className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Table</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {!isAuthenticated ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={onLoginClick}
              data-testid="button-login"
            >
              <LogIn className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Login</span>
            </Button>
            <Button
              size="sm"
              onClick={onSignupClick}
              data-testid="button-signup"
            >
              Sign up
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
                      <button
                        className="w-full text-left px-4 py-2 text-sm hover:bg-muted flex items-center gap-2"
                        onClick={() => {
                          setLocation("/profile");
                          setShowMenu(false);
                        }}
                        data-testid="menu-item-profile"
                      >
                        <User className="w-4 h-4" />
                        Profile Settings
                      </button>
                      {user.isAdmin && (
                        <button
                          className="w-full text-left px-4 py-2 text-sm hover:bg-muted flex items-center gap-2"
                          onClick={() => {
                            setLocation("/admin");
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
    </header>
  );
}
