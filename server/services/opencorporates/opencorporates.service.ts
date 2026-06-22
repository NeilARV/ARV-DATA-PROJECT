interface OcAddress {
    street_address: string | null;
    locality: string | null;
    region: string | null;
    postal_code: string | null;
    country: string | null;
}

interface OcOfficer {
    officer: {
        id: number;
        name: string;
        position: string | null;
        address: string | null;
        inactive: boolean | null;
        current_status: string | null;
        start_date: string | null;
        end_date: string | null;
    };
}

interface OcDataDatum {
    datum: {
        id: number;
        title: string;
        data_type: string;
        description: string;
    };
}

interface OcSearchCompany {
    company: {
        name: string;
        company_number: string;
        jurisdiction_code: string;
    };
}

interface OcCompanyDetail {
    name: string;
    company_number: string;
    jurisdiction_code: string;
    incorporation_date: string | null;
    dissolution_date: string | null;
    company_type: string | null;
    registry_url: string | null;
    branch: string | null;
    branch_status: string | null;
    inactive: boolean;
    current_status: string;
    registered_address: OcAddress | null;
    registered_address_in_full: string | null;
    source: { publisher: string; url: string } | null;
    agent_name: string | null;
    agent_address: OcAddress | null;
    alternative_names: unknown[];
    previous_names: unknown[];
    number_of_employees: number | null;
    native_company_number: string | null;
    alternate_registration_entities: unknown[];
    previous_registration_entities: unknown[];
    subsequent_registration_entities: unknown[];
    industry_codes: unknown[];
    identifiers: unknown[];
    trademark_registrations: unknown[];
    corporate_groupings: unknown[];
    financial_summary: unknown | null;
    home_company: unknown | null;
    controlling_entity: unknown | null;
    ultimate_beneficial_owners: unknown[];
    ultimate_controlling_company: unknown | null;
    filings: unknown[];
    officers: OcOfficer[];
    data: {
        most_recent: OcDataDatum[];
        total_count: number;
    } | null;
}

interface OcSearchResponse {
    results: {
        companies: OcSearchCompany[];
        total_count: number;
        page: number;
        per_page: number;
        total_pages: number;
    };
}

interface OcCompanyResponse {
    results: {
        company: OcCompanyDetail;
    };
}

function getConfig(): { baseUrl: string; apiKey: string } {
    const baseUrl = process.env.OPEN_CORPORATE_URL;
    const apiKey = process.env.OPEN_CORPORATE_API_KEY;
    if (!baseUrl || !apiKey) {
        throw new Error(
            'OPEN_CORPORATE_URL and OPEN_CORPORATE_API_KEY environment variables must be set',
        );
    }
    return { baseUrl, apiKey };
}

export async function searchCompany(
    name: string,
    jurisdictionCode: string,
): Promise<{ companies: OcSearchCompany[]; totalCount: number }> {
    const { baseUrl, apiKey } = getConfig();
    const params = new URLSearchParams({
        api_token: apiKey,
        q: name,
        jurisdiction_code: jurisdictionCode,
        order: 'score',
    });
    const response = await fetch(`${baseUrl}/companies/search?${params}`);
    if (!response.ok) {
        throw new Error(`OpenCorporates search failed: ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as OcSearchResponse;
    return {
        companies: data.results.companies,
        totalCount: data.results.total_count,
    };
}

export async function getCompanyByNumber(
    jurisdictionCode: string,
    companyNumber: string,
): Promise<OcCompanyDetail> {
    const { baseUrl, apiKey } = getConfig();
    const params = new URLSearchParams({ api_token: apiKey });
    const response = await fetch(
        `${baseUrl}/companies/${jurisdictionCode}/${companyNumber}?${params}`,
    );
    if (!response.ok) {
        throw new Error(
            `OpenCorporates company lookup failed: ${response.status} ${response.statusText}`,
        );
    }
    const data = (await response.json()) as OcCompanyResponse;
    return data.results.company;
}

interface OcAccountStatus {
    calls_remaining: {
        this_month: number;
        today: number;
    };
    usage: {
        this_month: number;
        today: number;
    };
}

interface OcAccountStatusResponse {
    results: {
        account_status: OcAccountStatus;
    };
}

export async function getAccountStatus(): Promise<OcAccountStatus> {
    const { baseUrl, apiKey } = getConfig();
    const params = new URLSearchParams({ api_token: apiKey });
    const response = await fetch(`${baseUrl}/account_status?${params}`);
    if (!response.ok) {
        throw new Error(
            `OpenCorporates account status failed: ${response.status} ${response.statusText}`,
        );
    }
    const data = (await response.json()) as OcAccountStatusResponse;
    return data.results.account_status;
}
