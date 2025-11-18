export function parseDate(dateValue: string | null | undefined): Date | null {
  if (!dateValue) return null;

  // Check if the entire string is a numeric value (Excel serial number)
  // Must match only digits with optional decimal point
  if (/^\d+(\.\d+)?$/.test(dateValue)) {
    const num = parseFloat(dateValue);
    if (num > 0 && num < 100000) {
      // Excel serial date: number of days since December 30, 1899
      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(excelEpoch.getTime() + num * 24 * 60 * 60 * 1000);
      
      // Validate the parsed date is reasonable (between 1900 and 2100)
      if (date.getFullYear() >= 1900 && date.getFullYear() <= 2100) {
        return date;
      }
    }
  }

  // Try parsing as ISO date string or other standard formats
  const isoDate = new Date(dateValue);
  if (!isNaN(isoDate.getTime())) {
    return isoDate;
  }

  // Unable to parse
  return null;
}

export function formatDate(dateValue: string | null | undefined): string | null {
  const date = parseDate(dateValue);
  if (!date) return null;

  return date.toLocaleDateString('en-US', { 
    month: '2-digit', 
    day: '2-digit', 
    year: 'numeric' 
  });
}

export function calculateDaysOwned(dateSoldValue: string | null | undefined): number | null {
  const soldDate = parseDate(dateSoldValue);
  if (!soldDate) return null;

  const today = new Date();
  const diffTime = today.getTime() - soldDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  // Only return positive values (date in the past)
  return diffDays >= 0 ? diffDays : null;
}
