const fetchCompanyContacts = async () => {
    const response = await fetch(`/api/companies/contacts`, {
        credentials: "include",
    });

    if (response.ok) {
        return response.json();
    }

    return null;
}