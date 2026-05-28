import type { SupabaseClient } from "@supabase/supabase-js";

export type CurrentCompany = {
  id: string;
  name: string;
  sector: string;
  description: string | null;
  tone: string | null;
  language: string | null;
};

export async function getCurrentCompany(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("companies")
    .select("id, name, sector, description, tone, language")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<CurrentCompany>();

  return { data, error };
}