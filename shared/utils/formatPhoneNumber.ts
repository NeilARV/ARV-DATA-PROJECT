/** Format phone number as (XXX) XXX-XXXX */
export function formatPhoneNumber(value: string | null | undefined): string | null {
  if (value == null || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  const phoneNumber = trimmed.replace(/\D/g, "");
  const digits = phoneNumber.slice(0, 10);

  if (digits.length === 0) return null;
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
