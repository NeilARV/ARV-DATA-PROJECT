import { PROPERTY_STATUS } from "@/constants/propertyStatus.constants";
import { Section } from "@/types/options";
import type { StatusTag } from "@/types/property";

const STATUS_TAG_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  Renovating: { label: "Renovating", bg: "#69C9E1", text: "#fff" },
  Sold: { label: "Sold", bg: "#FF0000", text: "#fff" },
  "On Market": { label: "On Market", bg: "#22C55E", text: "#fff" },
  Wholesale: { label: "Wholesale", bg: "#9333EA", text: "#fff" },
};

function statusToTag(s: string): { label: string; bg: string; text: string } | null {
  const normalized = (s || "").toLowerCase().trim();
  if (normalized === PROPERTY_STATUS.IN_RENOVATION) return STATUS_TAG_STYLES.Renovating;
  if (normalized === PROPERTY_STATUS.SOLD) return STATUS_TAG_STYLES.Sold;
  if (normalized === PROPERTY_STATUS.ON_MARKET) return STATUS_TAG_STYLES["On Market"];
  if (normalized === PROPERTY_STATUS.WHOLESALE) return STATUS_TAG_STYLES.Wholesale;
  return null;
}

function getStatusTags(statuses?: string[], status?: string): { label: string; bg: string; text: string }[] {
  const list = statuses && statuses.length > 0 ? statuses : status ? [status] : [];
  if (list.length === 0) return [STATUS_TAG_STYLES.Renovating];
  const tags = list.map(statusToTag).filter((t): t is NonNullable<typeof t> => t !== null);
  return tags.length > 0 ? tags : [STATUS_TAG_STYLES.Renovating];
}

export function StatusTag({status, statuses, section}: StatusTag) {

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
            {getStatusTags(statuses, status).map((tag) => (
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