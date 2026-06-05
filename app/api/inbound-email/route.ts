import { NextResponse } from "next/server";

import {
  processInboundEmail,
  type InboundEmailRequestBody,
} from "../../../lib/inboundEmailProcessing";

function getEmailWebhookSecret() {
  return process.env.INBOUND_EMAIL_WEBHOOK_SECRET?.trim() ?? "";
}

function getBearerToken(request: Request) {
  const authorizationHeader = request.headers.get("authorization") ?? "";

  if (!authorizationHeader.toLowerCase().startsWith("bearer ")) {
    return "";
  }

  return authorizationHeader.slice(7).trim();
}

function isAuthorizedInboundEmailRequest(request: Request) {
  const expectedSecret = getEmailWebhookSecret();

  if (!expectedSecret) {
    return false;
  }

  const headerSecret =
    request.headers.get("x-coppe-inbound-email-secret")?.trim() ?? "";
  const bearerToken = getBearerToken(request);

  return headerSecret === expectedSecret || bearerToken === expectedSecret;
}

export async function POST(request: Request) {
  if (!isAuthorizedInboundEmailRequest(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  let body: InboundEmailRequestBody;

  try {
    body = (await request.json()) as InboundEmailRequestBody;
  } catch {
    return NextResponse.json(
      { error: "El cuerpo de la petición no es válido." },
      { status: 400 }
    );
  }

  const result = await processInboundEmail(body);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      duplicate: result.duplicate,
      inquiryId: result.inquiryId,
      message: result.message,
    },
    { status: result.status }
  );
}
