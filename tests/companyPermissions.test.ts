import { describe, expect, it } from "vitest";

import {
  canCancelCompanyInvitations,
  canCreateCompanyInvitations,
  canManageCompanySettings,
  canManageTeam,
  hasCompanyRole,
  isCompanyOwnerRole,
  isCompanyRegularMemberRole,
  normalizeCompanyMemberRole,
} from "../lib/companyPermissions";

type CompanyArgument = NonNullable<
  Parameters<typeof canManageCompanySettings>[0]
>;

function companyWithRole(userRole: "owner" | "member"): CompanyArgument {
  return { userRole } as CompanyArgument;
}

describe("companyPermissions", () => {
  it.each([
    ["owner", "owner"],
    ["member", "member"],
    ["admin", "member"],
    [null, "member"],
    [undefined, "member"],
  ])("normaliza el rol %s como %s", (role, expected) => {
    expect(normalizeCompanyMemberRole(role)).toBe(expected);
  });

  it.each([
    ["owner", true],
    ["member", true],
    ["admin", false],
    ["", false],
    [null, false],
    [undefined, false],
  ])("valida el rol %s", (role, expected) => {
    expect(hasCompanyRole(role)).toBe(expected);
  });

  it("distingue propietarios y miembros", () => {
    expect(isCompanyOwnerRole("owner")).toBe(true);
    expect(isCompanyOwnerRole("member")).toBe(false);
    expect(isCompanyRegularMemberRole("member")).toBe(true);
    expect(isCompanyRegularMemberRole("owner")).toBe(false);
  });

  it.each([
    canManageCompanySettings,
    canManageTeam,
    canCreateCompanyInvitations,
    canCancelCompanyInvitations,
  ])("permite la operación al propietario", (permission) => {
    expect(permission(companyWithRole("owner"))).toBe(true);
  });

  it.each([
    canManageCompanySettings,
    canManageTeam,
    canCreateCompanyInvitations,
    canCancelCompanyInvitations,
  ])("deniega la operación al miembro y sin empresa", (permission) => {
    expect(permission(companyWithRole("member"))).toBe(false);
    expect(permission(null)).toBe(false);
    expect(permission(undefined)).toBe(false);
  });
});
