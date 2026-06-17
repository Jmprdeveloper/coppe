import type { CompanyMemberRole, CurrentCompany } from "./currentCompany";

export function normalizeCompanyMemberRole(
  role: string | null | undefined
): CompanyMemberRole {
  if (role === "owner") {
    return "owner";
  }

  return "member";
}

export function hasCompanyRole(
  role: CompanyMemberRole | string | null | undefined
): role is CompanyMemberRole {
  return role === "owner" || role === "member";
}

export function isCompanyOwnerRole(
  role: CompanyMemberRole | string | null | undefined
) {
  return role === "owner";
}

export function isCompanyRegularMemberRole(
  role: CompanyMemberRole | string | null | undefined
) {
  return role === "member";
}

export function canManageCompanySettings(
  company: CurrentCompany | null | undefined
) {
  return isCompanyOwnerRole(company?.userRole);
}

export function canManageTeam(company: CurrentCompany | null | undefined) {
  return isCompanyOwnerRole(company?.userRole);
}

export function canCreateCompanyInvitations(
  company: CurrentCompany | null | undefined
) {
  return isCompanyOwnerRole(company?.userRole);
}

export function canCancelCompanyInvitations(
  company: CurrentCompany | null | undefined
) {
  return isCompanyOwnerRole(company?.userRole);
}