import { notFound } from "next/navigation";

import { InvitationAcceptPage } from "../../../components/InvitationAcceptPage";

type InvitationPageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function InvitationPage({ params }: InvitationPageProps) {
  const { token } = await params;
  const cleanToken = token.trim();

  if (!cleanToken) {
    notFound();
  }

  return <InvitationAcceptPage token={cleanToken} />;
}