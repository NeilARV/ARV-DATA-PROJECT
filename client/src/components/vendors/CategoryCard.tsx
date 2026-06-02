import {
    Hammer,
    Wrench,
    Zap,
    House,
    Thermometer,
    LayoutDashboard,
    Handshake,
    Paintbrush,
    Layers,
    TreePine,
    Tag,
    Microwave,
    Briefcase,
    Compass,
    Milestone,
    Bath,
    Wind,
    Award,
    Medal,
    Badge,
    Archive,
    Building2,
    Package,
    Table2,
    CreditCard,
    Hash,
    LayoutGrid,
    Palette,
    DoorOpen,
    PenTool,
    Settings,
    Landmark,
    ShoppingBag,
    Pencil,
    Flame,
    Anchor,
    Warehouse,
    Mountain,
    CloudRain,
    ClipboardCheck,
    ShieldCheck,
    Sparkles,
    Scale,
    Nut,
    ShieldAlert,
    Truck,
    Pen,
    ClipboardList,
    Camera,
    Waves,
    Key,
    Scan,
    Grid3x3,
    Droplets,
    Sofa,
    ArrowUpDown,
    Ruler,
    Bug,
    Scroll,
    AppWindow,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Category } from '@/types/vendors';

const ICON_MAP: Record<string, LucideIcon> = {
    // Existing
    hammer: Hammer,
    wrench: Wrench,
    zap: Zap,
    house: House,
    thermometer: Thermometer,
    'layout-dashboard': LayoutDashboard,
    handshake: Handshake,
    paintbrush: Paintbrush,
    layers: Layers,
    'tree-pine': TreePine,

    // New
    microwave: Microwave,
    briefcase: Briefcase,
    compass: Compass,
    road: Milestone,
    bath: Bath,
    wind: Wind,
    award: Award,
    medal: Medal,
    badge: Badge,
    archive: Archive,
    'building-2': Building2,
    package: Package,
    'table-2': Table2,
    'credit-card': CreditCard,
    hash: Hash,
    'layout-grid': LayoutGrid,
    palette: Palette,
    'door-open': DoorOpen,
    'pen-tool': PenTool,
    settings: Settings,
    landmark: Landmark,
    'shopping-bag': ShoppingBag,
    pencil: Pencil,
    flame: Flame,
    anchor: Anchor,
    warehouse: Warehouse,
    mountain: Mountain,
    'cloud-rain': CloudRain,
    'clipboard-check': ClipboardCheck,
    'shield-check': ShieldCheck,
    sparkles: Sparkles,
    scale: Scale,
    nut: Nut,
    'shield-alert': ShieldAlert,
    truck: Truck,
    pen: Pen,
    'clipboard-list': ClipboardList,
    camera: Camera,
    waves: Waves,
    key: Key,
    scan: Scan,
    'grid-3x3': Grid3x3,
    droplets: Droplets,
    sofa: Sofa,
    'arrow-up-down': ArrowUpDown,
    ruler: Ruler,
    bug: Bug,
    scroll: Scroll,
    'app-window': AppWindow,
};

type CategoryCardProps = {
    category: Category;
    onClick: (category: Category) => void;
};

export function CategoryCard({ category, onClick }: CategoryCardProps) {
    const Icon = ICON_MAP[category.iconName] ?? Tag;

    return (
        <button
            className="w-full min-w-0 text-left p-4 bg-card border border-border rounded-xl hover:bg-accent transition-colors cursor-pointer"
            onClick={() => onClick(category)}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="p-3 bg-primary/10 rounded-lg flex-shrink-0">
                        <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                        <span className="font-semibold text-base text-foreground leading-tight block">
                            {category.name}
                        </span>
                        {category.description && (
                            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                                {category.description}
                            </p>
                        )}
                    </div>
                </div>
                <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full flex-shrink-0">
                    {category.vendorCount}
                </span>
            </div>
        </button>
    );
}
