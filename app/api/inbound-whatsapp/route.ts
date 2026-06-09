import { NextResponse } from "next/server";

import {
  processInboundWhatsAppWebhook,
  type WhatsAppWebhookPayload,
} from "../../../lib/inboundWhatsAppProcessing";

function getWhatsAppVerifyToken() {
  return process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim() ?? "";
}

function getSearchParam(request: Request, name: string) {
  const url = new URL(request.url);

  return url.searchParams.get(name)?.trim() ?? "";
}

export async function GET(request: Request) {
  const mode = getSearchParam(request, "hub.mode");
  const verifyToken = getSearchParam(request, "hub.verify_token");
  const challenge = getSearchParam(request, "hub.challenge");
  const expectedVerifyToken = getWhatsAppVerifyToken();

  if (
    mode === "subscribe" &&
    expectedVerifyToken &&
    verifyToken === expectedVerifyToken &&
    challenge
  ) {
    return new Response(challenge, {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
      },
    });
  }

  return NextResponse.json(
    { error: "Verificación de WhatsApp no autorizada." },
    { status: 403 }
  );
}

export async function POST(request: Request) {
  let payload: WhatsAppWebhookPayload;

  try {
    payload = (await request.json()) as WhatsAppWebhookPayload;
  } catch {
    return NextResponse.json(
      { error: "El cuerpo de la petición no es válido." },
      { status: 400 }
    );
  }

  const result = await processInboundWhatsAppWebhook(payload);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      processed: result.processed,
      ignored: result.ignored,
      duplicates: result.duplicates,
      inquiryIds: result.inquiryIds,
      message: result.message,
    },
    { status: result.status }
  );
}