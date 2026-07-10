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
