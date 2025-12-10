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
  User,
  LogOut,
  Trophy,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import logoUrl from "@assets/arv-data-logo.png";
import { useAuth, AuthUser } from "@/hooks/use-auth";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface HeaderProps {
  viewMode: "map" | "grid" | "table";
  onViewModeChange: (mode: "map" | "grid" | "table") => void;
  onSearch?: (query: string) => void;
  onLoginClick?: () => void;
  onSignupClick?: () => void;
  onLeaderboardClick?: () => void;
  onLogoClick?: () => void;
}

export default function Header({
  viewMode,
  onViewModeChange,
  onSearch,
  onLoginClick,
  onSignupClick,
  onLeaderboardClick,
  onLogoClick,
}: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isDark, setIsDark] = useState(false);
  const [, setLocation] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    const isDarkMode = document.documentElement.classList.contains("dark");
    setIsDark(isDarkMode);
  }, []);

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
    onSearch?.(searchQuery);
    console.log("Search:", searchQuery);
  };

  const handleLogout = async () => {
    try {
      // Use the regular user logout endpoint
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        // Clear all cached queries on logout
        queryClient.clear();
        toast({
          title: "Logged Out",
          description: "You have been logged out",
        });
        setLocation("/");
      }
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
      className="h-16 border-b border-border bg-background flex items-center px-4 gap-4"
      data-testid="header-main"
    >
      <button
        className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer"
        onClick={onLogoClick}
        data-testid="button-logo-home"
      >
        <img 
          src={logoUrl} 
          alt="ARV DATA" 
          className="h-10 w-auto"
          data-testid="img-logo"
        />
        <h1 className="text-lg font-semibold hidden sm:block">ARV DATA</h1>
      </button>

      <form onSubmit={handleSearch} className="flex-1 max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by address or city..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search"
          />
        </div>
      </form>

      <div className="flex items-center gap-2">
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

        <Button
          variant="outline"
          size="sm"
          onClick={onLeaderboardClick}
          data-testid="button-leaderboard"
        >
          <Trophy className="w-4 h-4 mr-1" />
          <span className="hidden sm:inline">Leaderboard</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setLocation("/admin")}
          data-testid="button-admin"
        >
          <Settings className="w-4 h-4 mr-1" />
          <span className="hidden sm:inline">Admin</span>
        </Button>

        {isAuthenticated && user ? (
          <>
            <Button variant="outline" size="sm" data-testid="button-user-menu">
              <User className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">{user.firstName}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </>
        ) : (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={onLoginClick}
              data-testid="button-login"
            >
              <LogIn className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Sign in</span>
            </Button>
            <Button
              size="sm"
              onClick={onSignupClick}
              data-testid="button-signup"
            >
              Sign up
            </Button>
          </div>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          data-testid="button-theme-toggle"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>
      </div>
    </header>
  );
}
