import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeCompanyMemberRole } from "./companyPermissions";

export type CompanyMemberRole = "owner" | "member";

export type CurrentCompany = {
  id: string;
  name: string;
  sector: string;
  description: string | null;
  tone: string | null;
  language: string | null;
  userRole?: CompanyMemberRole;
};

type CurrentCompanyMembershipRow = {
  company_id: string;
  company_name: string;
  role: string;
};

export async function getCurrentCompany(supabase: SupabaseClient) {
  const { data: membership, error: membershipError } = await supabase
    .rpc("get_current_company_membership")
    .maybeSingle<CurrentCompanyMembershipRow>();

  if (membershipError) {
    return {
      data: null,
      error: membershipError,
    };
  }

  if (!membership) {
    return {
      data: null,
      error: null,
    };
  }

  const { data, error } = await supabase
    .from("companies")
    .select("id, name, sector, description, tone, language")
    .eq("id", membership.company_id)
    .maybeSingle<Omit<CurrentCompany, "userRole">>();

  if (error || !data) {
    return {
      data,
      error,
    };
  }

  return {
    data: {
      ...data,
      userRole: normalizeCompanyMemberRole(membership.role),
    },
    error: null,
  };
}