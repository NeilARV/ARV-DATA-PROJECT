  // Helper function to parse Excel serial dates
export function parseExcelDate(value: string | null): string | null {
    
    if (!value) return null;

    // Check if it's an Excel serial number (pure numeric string)
    if (/^\d+(\.\d+)?$/.test(value)) {
      const num = parseFloat(value);
      if (num > 0 && num < 100000) {
        // Excel serial date: number of days since December 30, 1899
        const excelEpoch = new Date(1899, 11, 30);
        const date = new Date(excelEpoch.getTime() + num * 24 * 60 * 60 * 1000);

        // Validate the parsed date is reasonable
        if (date.getFullYear() >= 1900 && date.getFullYear() <= 2100) {
          return date.toISOString();
        }
      }
    }

    // Try parsing as existing ISO string or return as-is
    return value;
}