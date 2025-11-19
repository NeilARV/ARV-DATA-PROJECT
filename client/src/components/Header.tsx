import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Map, Grid3x3, Table2, CloudUpload, Search, Moon, Sun } from "lucide-react";
import { useState, useEffect } from "react";
import logoUrl from "@assets/arv-data-logo.png";

interface HeaderProps {
  viewMode: "map" | "grid" | "table";
  onViewModeChange: (mode: "map" | "grid" | "table") => void;
  onUploadClick: () => void;
  onSearch?: (query: string) => void;
}

export default function Header({
  viewMode,
  onViewModeChange,
  onUploadClick,
  onSearch,
}: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const isDarkMode = document.documentElement.classList.contains('dark');
    setIsDark(isDarkMode);
  }, []);

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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch?.(searchQuery);
    console.log('Search:', searchQuery);
  };

  return (
    <header className="h-16 border-b border-border bg-background flex items-center px-4 gap-4" data-testid="header-main">
      <div className="flex items-center gap-3">
        <img 
          src={logoUrl} 
          alt="ARV DATA" 
          className="h-10 w-auto"
          data-testid="img-logo"
        />
        <h1 className="text-lg font-semibold hidden sm:block">ARV DATA</h1>
      </div>

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

        <Button onClick={onUploadClick} size="sm" data-testid="button-upload">
          <CloudUpload className="w-4 h-4 mr-1" />
          <span className="hidden sm:inline">Upload</span>
        </Button>

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
