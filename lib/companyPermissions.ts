import type { CompanyMemberRole, CurrentCompany } from "./currentCompany";

export function normalizeCompanyMemberRole(
  role: string | null | undefined
): CompanyMemberRole {
  if (role === "member") {
    return "member";
  }

  return "owner";
}

export function isCompanyOwner(
  role: CompanyMemberRole | string | null | undefined
) {
  return normalizeCompanyMemberRole(role) === "owner";
}

export function isCompanyMember(
  role: CompanyMemberRole | string | null | undefined
) {
  return normalizeCompanyMemberRole(role) === "member";
}

export function canManageCompanySettings(
  company: CurrentCompany | null | undefined
) {
  return isCompanyOwner(company?.userRole);
}

export function canManageTeam(company: CurrentCompany | null | undefined) {
  return isCompanyOwner(company?.userRole);
}

export function canCreateCompanyInvitations(
  company: CurrentCompany | null | undefined
) {
  return isCompanyOwner(company?.userRole);
}

export function canCancelCompanyInvitations(
  company: CurrentCompany | null | undefined
) {
  return isCompanyOwner(company?.userRole);
}