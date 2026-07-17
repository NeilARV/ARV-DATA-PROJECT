// Wire shapes for the Groups admin API (GET /api/groups, GET /api/groups/:id).
// Dates are ISO strings over the wire; company/group names are RAW (format with formatCompanyName
// at the render edge — ARV.RAW-COMPANY-NAME).

// A company group's core fields as returned to the admin UI.
export type Group = {
    id: string;
    name: string;
    description: string | null;
    createdAt: string;
    updatedAt: string | null;
};

// A group row in the admin list, with its company + member counts.
export type GroupSummary = Group & {
    companyCount: number;
    memberCount: number;
};

// A company belonging to a group (raw name).
export type GroupCompany = {
    id: string;
    companyName: string;
};

// Reuses the DB `member_role` enum values; a member's role may be unset (null).
export type GroupMemberRole = 'owner' | 'member';

// A group member with the user's identity and role.
export type GroupMemberDetail = {
    userId: string;
    firstName: string;
    lastName: string;
    email: string;
    role: GroupMemberRole | null;
    createdAt: string;
};

// Full detail for a single group: the group plus its companies and members.
export type GroupDetail = {
    group: Group;
    companies: GroupCompany[];
    members: GroupMemberDetail[];
};

// A row in the public Groups directory (the Data-app Groups tab). Multi-company groups only.
// Exactly one count is populated per active sort, mirroring CompanyContactWithCounts; the rest are
// 0. Name is RAW (format with formatCompanyName at the render edge — ARV.RAW-COMPANY-NAME).
export type GroupDirectoryRow = {
    id: string;
    name: string;
    companyCount: number;
    propertyCount: number;
    propertiesSoldCount: number;
    propertiesSoldCountAllTime: number;
    propertiesBoughtCount: number;
    propertiesBoughtCountAllTime: number;
    wholesaleBuyCount: number;
    wholesalerCount: number;
};

// One page of the Groups directory, mirroring the company directory's envelope (no hasMore — the
// client derives it from total).
export type GroupDirectoryResponse = {
    groups: GroupDirectoryRow[];
    total: number;
    page: number;
    limit: number;
};

// One member company of an operator group with its count for the active directory sort — a row in
// the See Companies roster. Name is RAW (format with formatCompanyName at the render edge —
// ARV.RAW-COMPANY-NAME).
export type GroupMemberCount = {
    companyId: string;
    companyName: string;
    count: number;
};

// Aggregate profile for one operator group (the expanded group card): the company-profile stats
// summed across member companies. No contact rows or purchase-to-ARV — those are company-level
// concepts. Name is RAW (format with formatCompanyName at the render edge — ARV.RAW-COMPANY-NAME).
export type GroupProfile = {
    id: string;
    name: string;
    companyCount: number;
    propertyCount: number;
    propertiesSoldCount: number;
    propertiesAssignedCount: number;
    acquisition90DayTotal: number;
    acquisition90DayByMonth: { key: string; count: number }[];
    // The See Companies roster: member companies with per-member counts for the requested sort,
    // most-active first. Present only when the profile is requested with a `sort` param.
    roster?: GroupMemberCount[];
};

// A company a user is associated with through one of their groups — the "My Companies" surface.
// A user's reach is every company across every group they belong to.
export type UserGroupCompany = {
    companyId: string;
    companyName: string;
    groupId: string;
    groupName: string;
    joinedAt: string;
};

// A group a user is a member of — the admin "add user to group(s)" editor surface.
export type UserGroupMembership = {
    groupId: string;
    groupName: string;
    role: GroupMemberRole | null;
    joinedAt: string;
};
