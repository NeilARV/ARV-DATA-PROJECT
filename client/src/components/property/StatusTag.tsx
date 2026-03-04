import { PROPERTY_STATUS } from "@/constants/propertyStatus.constants";
import { Section } from "@/types/options";
import type { StatusTag } from "@/types/property";

const STATUS_TAG_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  Renovating: { label: "Renovating", bg: "#69C9E1", text: "#fff" },
  Sold: { label: "Sold", bg: "#FF0000", text: "#fff" },
  "On Market": { label: "On Market", bg: "#22C55E", text: "#fff" },
  Wholesale: { label: "Wholesale", bg: "#9333EA", text: "#fff" },
};

function getStatusTags(status: string): { label: string; bg: string; text: string }[] {
  const s = (status || "").toLowerCase().trim();
  if (s === PROPERTY_STATUS.IN_RENOVATION) return [STATUS_TAG_STYLES.Renovating];
  if (s === PROPERTY_STATUS.SOLD) return [STATUS_TAG_STYLES.Sold];
  if (s === PROPERTY_STATUS.ON_MARKET) return [STATUS_TAG_STYLES["On Market"]];
  if (s === PROPERTY_STATUS.WHOLESALE) return [STATUS_TAG_STYLES.Wholesale, STATUS_TAG_STYLES.Renovating];
  return [STATUS_TAG_STYLES.Renovating];
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