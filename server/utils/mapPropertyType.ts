import { normalizeToTitleCase } from "./normalizeToTitleCase";

// Map varying property type strings (from SFR or other sources) to canonical app types
export function mapPropertyType(raw?: string | null) {
  if (!raw || typeof raw !== 'string') return 'Single Family';
  const s = raw.trim().toLowerCase();

  // Common mappings
  if (s.includes('single') && s.includes('family')) return 'Single Family';
  if (s.includes('condo') || s.includes('condominium')) return 'Condo';
  if (s.includes('town') && s.includes('house')) return 'Townhouse';
  if (s.includes('townhouse')) return 'Townhouse';
  //if (s.includes('duplex') || s.includes('triplex') || s.includes('multi') || s.includes('multi-family')) return 'Multi Family';
  //if (s.includes('mobile') || s.includes('manufactured')) return 'Mobile Home';
  //if (s.includes('lot') || s.includes('land')) return 'Land';

  // Fallback to a normalized title-case value
  const title = normalizeToTitleCase(raw) || raw;
  return title;
}