export function formatCompanyName(name: string | null | undefined): string | null {
  if (!name || typeof name !== "string") return null;

  const titleCase = name
    .trim()
    .split(/\s+/)
    .map((word) => {
      if (word.length === 0) return word;

      const cleanWord = word.replace(/[,.;]+$/, "");
      const upperWord = cleanWord.toUpperCase();
      if (upperWord === "LLC") return "LLC";
      if (upperWord === "LLP") return "LLP";
      if (upperWord === "PLLC") return "PLLC";
      if (upperWord === "LC") return "LC";
      if (upperWord === "PC" || upperWord === "P.C.") return "PC";
      if (upperWord === "LP") return "LP";
      if (upperWord === "GP") return "GP";
      if (upperWord === "INC" || upperWord === "INCORPORATED") return "Inc";
      if (upperWord === "CORP" || upperWord === "CORPORATION") return "Corp";

      return cleanWord.charAt(0).toUpperCase() + cleanWord.slice(1).toLowerCase();
    })
    .join(" ");

  return titleCase.replace(/[,.;]+$/, "").trim();
}
