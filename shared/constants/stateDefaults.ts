/**
 * Maps each supported state abbreviation to the default county shown in
 * county dropdowns when a user selects that state (signup, profile editing).
 * Single source of truth — imported by Signup.tsx and Profile.tsx.
 */
export const STATE_DEFAULT_COUNTY: Record<string, string> = {
    CA: 'San Diego',
    CO: 'Denver',
    FL: 'Miami-Dade',
    WA: 'King',
};
