import type { CompanyContactWithCounts } from "@/types/companies";

export async function fetchCompanyContacts(county?: string): Promise<CompanyContactWithCounts[] | null> {
  const query = county ? `?county=${encodeURIComponent(county)}` : "";
  const response = await fetch(`/api/companies/contacts${query}`, {
    credentials: "include",
  });

  if (response.ok) {
    return response.json();
  }

  return null;
}