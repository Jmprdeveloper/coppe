import { createHmac, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import {
  processInboundWhatsAppWebhook,
  type WhatsAppWebhookPayload,
} from "../../../lib/inboundWhatsAppProcessing";

export const runtime = "nodejs";

type WhatsAppPayloadSummaryValue = {
  metadata?: {
    phone_number_id?: string | null;
  } | null;
  messages?: Array<{
    type?: string | null;
  }> | null;
  statuses?: Array<{
    status?: string | null;
  }> | null;
};

function getWhatsAppVerifyToken() {
  return process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim() ?? "";
}

function getWhatsAppAppSecret() {
  return process.env.WHATSAPP_APP_SECRET?.trim() ?? "";
}

function getSearchParam(request: Request, name: string) {
  const url = new URL(request.url);

  return url.searchParams.get(name)?.trim() ?? "";
}

function getInboundWhatsAppPayloadSummary(payload: WhatsAppWebhookPayload) {
  return {
    object: payload.object,
    entries:
      payload.entry?.map((entry) => ({
        id: entry.id,
        changes:
          entry.changes?.map((change) => {
            const value = change.value as WhatsAppPayloadSummaryValue;
            const messages = Array.isArray(value?.messages)
              ? value.messages
              : [];
            const statuses = Array.isArray(value?.statuses)
              ? value.statuses
              : [];

            return {
              field: change.field,
              phoneNumberId: value?.metadata?.phone_number_id ?? null,
              hasMessages: messages.length > 0,
              messageCount: messages.length,
              messageTypes: messages.map((message) => message.type ?? null),
              hasStatuses: statuses.length > 0,
              statusCount: statuses.length,
              statuses: statuses.map((status) => status.status ?? null),
            };
          }) ?? [],
      })) ?? [],
  };
}

function verifyWhatsAppSignature(rawPayload: string, request: Request) {
  const appSecret = getWhatsAppAppSecret();

  if (!appSecret) {
    return process.env.NODE_ENV !== "production";
  }

  const receivedSignature =
    request.headers.get("x-hub-signature-256")?.trim() ?? "";

  if (!receivedSignature.startsWith("sha256=")) {
    return false;
  }

  const expectedSignature = `sha256=${createHmac("sha256", appSecret)
    .update(rawPayload, "utf8")
    .digest("hex")}`;

  const receivedBuffer = Buffer.from(receivedSignature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(receivedBuffer, expectedBuffer);
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
  try {
    let rawPayload = "";

    try {
      rawPayload = await request.text();
    } catch (error) {
      console.error("Could not read inbound WhatsApp request body:", error);

      return NextResponse.json(
        { error: "No se pudo leer el cuerpo de la petición." },
        { status: 400 }
      );
    }

    if (!verifyWhatsAppSignature(rawPayload, request)) {
      return NextResponse.json(
        { error: "Firma de WhatsApp no válida." },
        { status: 401 }
      );
    }

    let payload: WhatsAppWebhookPayload;

    try {
      payload = JSON.parse(rawPayload) as WhatsAppWebhookPayload;

      console.info(
        "Inbound WhatsApp webhook payload summary:",
        JSON.stringify(getInboundWhatsAppPayloadSummary(payload))
      );
    } catch (error) {
      console.error("Invalid inbound WhatsApp JSON body:", error);

      return NextResponse.json(
        { error: "El cuerpo de la petición no es válido." },
        { status: 400 }
      );
    }

    let result: Awaited<ReturnType<typeof processInboundWhatsAppWebhook>>;

    try {
      result = await processInboundWhatsAppWebhook(payload);
    } catch (error) {
      console.error("Inbound WhatsApp webhook processing failed:", error);

      return NextResponse.json(
        {
          error: "No se pudo procesar el webhook de WhatsApp.",
          detail:
            error instanceof Error
              ? error.message
              : "Error desconocido al procesar WhatsApp.",
        },
        { status: 500 }
      );
    }

    if (!result.ok) {
      if (result.status >= 500) {
        console.error("Inbound WhatsApp processing returned error:", result);
      }

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
  } catch (error) {
    console.error("Unexpected inbound WhatsApp route error:", error);

    return NextResponse.json(
      {
        error: "Error inesperado en el webhook de WhatsApp.",
        detail:
          error instanceof Error
            ? error.message
            : "Error inesperado sin detalle disponible.",
      },
      { status: 500 }
    );
  }
}