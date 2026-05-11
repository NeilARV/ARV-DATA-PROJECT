import {
    Hammer, Wrench, Zap, House, Thermometer, LayoutDashboard,
    Handshake, Paintbrush, Layers, TreePine, Tag,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Category } from "@/types/vendors";

const ICON_MAP: Record<string, LucideIcon> = {
    "hammer": Hammer,
    "wrench": Wrench,
    "zap": Zap,
    "house": House,
    "thermometer": Thermometer,
    "layout-dashboard": LayoutDashboard,
    "handshake": Handshake,
    "paintbrush": Paintbrush,
    "layers": Layers,
    "tree-pine": TreePine,
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
    "general-contractor": "Full-service renovation & rehab",
    "plumber": "Plumbing installation & repair",
    "electrician": "Electrical work & wiring",
    "roofer": "Roof replacement & repair",
    "hvac": "Heating, ventilation & air conditioning",
    "home-stager": "Professional staging & design",
    "wholesaler": "Off-market deal sourcing",
    "painter": "Interior & exterior painting",
    "flooring": "Hardwood, tile & carpet installation",
    "landscaping": "Outdoor design & maintenance",
};

type CategoryCardProps = {
    category: Category;
    onClick: (category: Category) => void;
};

export function CategoryCard({ category, onClick }: CategoryCardProps) {
    const Icon = ICON_MAP[category.iconName] ?? Tag;
    const description = category.description ?? CATEGORY_DESCRIPTIONS[category.slug] ?? "";

    return (
        <button
            className="w-full text-left p-4 bg-card border border-border rounded-xl hover:bg-accent transition-colors cursor-pointer"
            onClick={() => onClick(category)}
        >
            <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-primary/10 rounded-md flex-shrink-0">
                    <Icon className="w-4 h-4 text-primary" />
                </div>
                <span className="font-medium text-sm text-foreground leading-tight">{category.name}</span>
            </div>
            {description && (
                <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
            )}
        </button>
    );
}
