import { Section } from "@/types/options";
import type { StatusTag } from "@/types/property";

// Status tag colors match PropertyMap.tsx map ping colors
const STATUS_TAG_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  "Renovating": { label: "Renovating", bg: "#69C9E1", text: "#fff" },
  "Sold": { label: "Sold", bg: "#FF0000", text: "#fff" },
  "On Market": { label: "On Market", bg: "#22C55E", text: "#fff" },
  "Wholesale": { label: "Wholesale", bg: "#9333EA", text: "#fff" },
};

function getStatusTags(status: string): { label: string; bg: string; text: string }[] {
  const s = (status || "").toLowerCase().trim();
  if (s === "in-renovation") return [STATUS_TAG_STYLES["Renovating"]];
  if (s === "sold") return [STATUS_TAG_STYLES["Sold"]];
  if (s === "on-market") return [STATUS_TAG_STYLES["On Market"]];
  if (s === "wholesale") return [STATUS_TAG_STYLES["Wholesale"], STATUS_TAG_STYLES["Renovating"]];
  return [STATUS_TAG_STYLES["Renovating"]]; // default fallback
}

export function StatusTag({status, section}: StatusTag) {

    const sectionClass = (section: Section) => {
        switch(section) {
            case "panel":
                return "text-[10px]";
            default:
                return "text-[13px]";
        }
    }

    return (
        <>
            {getStatusTags(status).map((tag) => (
                <span
                    key={tag.label}
                    className={`${sectionClass(section)} font-semibold px-3 py-0.5 rounded shadow-sm`}
                    style={{ backgroundColor: tag.bg, color: tag.text }}
                >
                    {tag.label}
                </span>
            ))}
        </>
    )
}