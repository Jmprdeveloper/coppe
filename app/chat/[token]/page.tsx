import { notFound } from "next/navigation";

import { PublicIntakeForm } from "../../../components/PublicIntakeForm";
import { createAdminClient } from "../../../lib/supabase/admin";

type PublicChatPageProps = {
  params: Promise<{
    token: string;
  }>;
};

type PublicChatCompany = {
  id: string;
  name: string;
  public_intake_enabled: boolean;
};

export default async function PublicChatPage({ params }: PublicChatPageProps) {
  const { token } = await params;
  const cleanToken = token.trim();

  if (!cleanToken) {
    notFound();
  }

  const supabaseAdmin = createAdminClient();

  const { data: company, error } = await supabaseAdmin
    .from("companies")
    .select("id, name, public_intake_enabled")
    .eq("public_intake_token", cleanToken)
    .maybeSingle<PublicChatCompany>();

  if (error || !company || !company.public_intake_enabled) {
    notFound();
  }

  return (
    <PublicIntakeForm
      publicIntakeToken={cleanToken}
      companyName={company.name}
      sourceChannel="Chat web"
    />
  );
}