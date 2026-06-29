import { NextResponse } from "next/server";

import {
  claimOutboundMessage,
  finalizeOutboundMessageDelivery,
  getInquiryMessageById,
  markOutboundMessageDeliveryFailure,
} from "../../../../lib/outboundMessageProcessing";
import {
  buildOutboundResponseDeduplicationKey,
  canSendResponseForInquiryStatus,
  getHttpProviderDeliveryFailureStatus,
  getOutboundProviderError,
  isValidOutboundRequestId,
  OutboundProviderError,
} from "../../../../lib/outboundResponseReliability";
import {
  buildRequestBodyTooLargeResponse,
  readRequestJsonWithLimit,
  RequestBodyTooLargeError,
} from "../../../../lib/requestBodyLimits";
import { checkOutboundSendRateLimits } from "../../../../lib/serverApiRateLimit";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { createClient } from "../../../../lib/supabase/server";

export const runtime = "nodejs";

const MAX_SEND_WHATSAPP_RESPONSE_REQUEST_BODY_BYTES = 32 * 1024;
const MAX_WHATSAPP_RESPONSE_TEXT_LENGTH = 4096;
const DEFAULT_WHATSAPP_GRAPH_API_VERSION = "v23.0";
const DEFAULT_WHATSAPP_REQUEST_TIMEOUT_MS = 15000;
const MAX_WHATSAPP_REQUEST_TIMEOUT_MS = 30000;

type SendWhatsAppResponseNextStatus = "replied" | "waiting_customer";

type SendWhatsAppResponseRequestBody = {
  inquiryId?: unknown;
  responseText?: unknown;
  nextStatus?: unknown;
  requestId?: unknown;
};

type InquiryForWhatsAppResponseRow = {
  id: string;
  company_id: string;
  customer_id: string | null;
  customer_name: string;
  source_channel: string;
  subject: string | null;
  status: string;
};

type CustomerForWhatsAppResponseRow = {
  id: string;
  company_id: string;
  name: string;
  phone: string | null;
};

type WhatsAppChannelRow = {
  id: string;
  company_id: string;
  phone_number_id: string;
  display_phone_number: string | null;
  provider: string | null;
  enabled: boolean;
};

type MetaWhatsAppSendMessageResponse = {
  messages?: Array<{
    id?: string;
  }>;
  error?: {
    message?: string;
    error_user_msg?: string;
    error_data?: {
      details?: string;
    };
  };
};

function getWhatsAppAccessToken() {
  return process.env.WHATSAPP_ACCESS_TOKEN?.trim() ?? "";
}

function getWhatsAppGraphApiVersion() {
  const cleanVersion = process.env.WHATSAPP_GRAPH_API_VERSION?.trim() ?? "";

  return cleanVersion || DEFAULT_WHATSAPP_GRAPH_API_VERSION;
}

function getWhatsAppRequestTimeoutMs() {
  const value = Number(process.env.WHATSAPP_REQUEST_TIMEOUT_MS);

  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_WHATSAPP_REQUEST_TIMEOUT_MS;
  }

  return Math.min(Math.round(value), MAX_WHATSAPP_REQUEST_TIMEOUT_MS);
}

function isValidNextStatus(
  value: string
): value is SendWhatsAppResponseNextStatus {
  return value === "replied" || value === "waiting_customer";
}

function normalizeWhatsAppRecipientPhone(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.startsWith("00")) {
    return digits.slice(2);
  }

  return digits;
}

function formatWhatsAppRecipientPhoneForStorage(value: string) {
  return `+${value}`;
}

function hasValidWhatsAppRecipientPhone(value: string) {
  return /^[1-9][0-9]{7,14}$/.test(value);
}

function getMetaWhatsAppErrorMessage(
  payload: MetaWhatsAppSendMessageResponse | null
) {
  const userMessage = payload?.error?.error_user_msg?.trim();

  if (userMessage) {
    return userMessage;
  }

  const details = payload?.error?.error_data?.details?.trim();

  if (details) {
    return details;
  }

  const message = payload?.error?.message?.trim();

  if (message) {
    return message;
  }

  return "Meta no pudo enviar el WhatsApp.";
}

async function sendWhatsAppTextWithMeta({
  phoneNumberId,
  toPhone,
  text,
}: {
  phoneNumberId: string;
  toPhone: string;
  text: string;
}) {
  const accessToken = getWhatsAppAccessToken();

  if (!accessToken) {
    throw new OutboundProviderError(
      "Missing WHATSAPP_ACCESS_TOKEN environment variable.",
      "failed"
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, getWhatsAppRequestTimeoutMs());

  try {
    const response = await fetch(
      `https://graph.facebook.com/${getWhatsAppGraphApiVersion()}/${encodeURIComponent(
        phoneNumberId
      )}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: toPhone,
          type: "text",
          text: {
            preview_url: false,
            body: text,
          },
        }),
        signal: controller.signal,
      }
    );

    const payload = (await response
      .json()
      .catch(() => null)) as MetaWhatsAppSendMessageResponse | null;
    const providerMessageId = payload?.messages?.[0]?.id?.trim() ?? "";

    if (!response.ok) {
      throw new OutboundProviderError(
        getMetaWhatsAppErrorMessage(payload),
        getHttpProviderDeliveryFailureStatus(response.status)
      );
    }

    if (!providerMessageId) {
      throw new OutboundProviderError(
        "Meta aceptó la petición sin devolver un identificador de mensaje.",
        "unknown"
      );
    }

    return providerMessageId;
  } catch (error) {
    throw getOutboundProviderError(
      error,
      "No se pudo enviar el WhatsApp con Meta."
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  let body: SendWhatsAppResponseRequestBody;

  try {
    body = await readRequestJsonWithLimit<SendWhatsAppResponseRequestBody>(
      request,
      MAX_SEND_WHATSAPP_RESPONSE_REQUEST_BODY_BYTES
    );
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return buildRequestBodyTooLargeResponse(error.maxBytes);
    }

    return NextResponse.json(
      { error: "El cuerpo de la petición no es válido." },
      { status: 400 }
    );
  }

  const inquiryId = typeof body.inquiryId === "string" ? body.inquiryId.trim() : "";
  const responseText =
    typeof body.responseText === "string" ? body.responseText.trim() : "";
  const nextStatus =
    typeof body.nextStatus === "string" ? body.nextStatus.trim() : "";
  const requestId =
    typeof body.requestId === "string" ? body.requestId.trim() : "";

  if (!inquiryId) {
    return NextResponse.json(
      { error: "El identificador del caso es obligatorio." },
      { status: 400 }
    );
  }

  if (!responseText) {
    return NextResponse.json(
      { error: "La respuesta no puede quedar vacía." },
      { status: 400 }
    );
  }

  if (responseText.length > MAX_WHATSAPP_RESPONSE_TEXT_LENGTH) {
    return NextResponse.json(
      {
        error: `La respuesta de WhatsApp no puede superar los ${MAX_WHATSAPP_RESPONSE_TEXT_LENGTH} caracteres.`,
      },
      { status: 400 }
    );
  }

  if (!isValidNextStatus(nextStatus)) {
    return NextResponse.json(
      { error: "El estado final solicitado no es válido." },
      { status: 400 }
    );
  }

  if (!requestId || !isValidOutboundRequestId(requestId)) {
    return NextResponse.json(
      { error: "El identificador idempotente del envío no es válido." },
      { status: 400 }
    );
  }

  const { data: inquiry, error: inquiryError } = await supabase
    .from("inquiries")
    .select("id, company_id, customer_id, customer_name, source_channel, subject, status")
    .eq("id", inquiryId)
    .maybeSingle<InquiryForWhatsAppResponseRow>();

  if (inquiryError) {
    return NextResponse.json(
      { error: "No se pudo cargar el caso." },
      { status: 500 }
    );
  }

  if (!inquiry) {
    return NextResponse.json(
      { error: "No se encontró este caso o no pertenece a tu empresa." },
      { status: 404 }
    );
  }

  if (!canSendResponseForInquiryStatus(inquiry.status)) {
    return NextResponse.json(
      { error: "Este caso no admite nuevas respuestas salientes." },
      { status: 400 }
    );
  }

  if (!inquiry.customer_id) {
    return NextResponse.json(
      { error: "Este caso no tiene un cliente asociado." },
      { status: 400 }
    );
  }

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, company_id, name, phone")
    .eq("id", inquiry.customer_id)
    .maybeSingle<CustomerForWhatsAppResponseRow>();

  if (customerError) {
    return NextResponse.json(
      { error: "No se pudo cargar el cliente asociado al caso." },
      { status: 500 }
    );
  }

  if (!customer || customer.company_id !== inquiry.company_id) {
    return NextResponse.json(
      { error: "No se encontró el cliente asociado al caso." },
      { status: 404 }
    );
  }

  const toPhone = normalizeWhatsAppRecipientPhone(customer.phone ?? "");

  if (!toPhone || !hasValidWhatsAppRecipientPhone(toPhone)) {
    return NextResponse.json(
      {
        error:
          "El cliente no tiene un teléfono internacional válido para responder por WhatsApp desde COPPE.",
      },
      { status: 400 }
    );
  }

  const supabaseAdmin = createAdminClient();

  const { data: whatsAppChannel, error: whatsAppChannelError } =
    await supabaseAdmin
      .from("inbound_whatsapp_channels")
      .select("id, company_id, phone_number_id, display_phone_number, provider, enabled")
      .eq("company_id", inquiry.company_id)
      .eq("provider", "meta")
      .eq("enabled", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<WhatsAppChannelRow>();

  if (whatsAppChannelError) {
    return NextResponse.json(
      { error: "No se pudo cargar el canal de WhatsApp de la empresa." },
      { status: 500 }
    );
  }

  if (!whatsAppChannel || whatsAppChannel.company_id !== inquiry.company_id) {
    return NextResponse.json(
      {
        error:
          "Esta empresa no tiene un canal de WhatsApp activo para enviar respuestas.",
      },
      { status: 400 }
    );
  }

  const phoneNumberId = whatsAppChannel.phone_number_id.trim();

  if (!phoneNumberId) {
    return NextResponse.json(
      { error: "El canal de WhatsApp no tiene phone_number_id configurado." },
      { status: 400 }
    );
  }

  const toAddress = formatWhatsAppRecipientPhoneForStorage(toPhone);
  const fromAddress =
    whatsAppChannel.display_phone_number?.trim() || `phone_number_id:${phoneNumberId}`;
  const deduplicationKey = buildOutboundResponseDeduplicationKey({
    channel: "whatsapp",
    requestId,
    inquiryId: inquiry.id,
    customerId: customer.id,
    destination: toPhone,
    responseText,
  });
  let outboundMessageClaim: Awaited<ReturnType<typeof claimOutboundMessage>>;

  try {
    outboundMessageClaim = await claimOutboundMessage(supabaseAdmin, {
      companyId: inquiry.company_id,
      inquiryId: inquiry.id,
      customerId: customer.id,
      channel: "whatsapp",
      provider: "meta",
      fromAddress,
      toAddress,
      body: responseText,
      deduplicationKey,
      nextStatus,
      userId: user.id,
    });
  } catch (error) {
    console.error("Could not claim outbound WhatsApp message:", error);

    return NextResponse.json(
      { error: "No se pudo registrar el intento de envío." },
      { status: 500 }
    );
  }

  if (outboundMessageClaim.outcome === "already_sent") {
    const inquiryMessage = await getInquiryMessageById(
      supabaseAdmin,
      outboundMessageClaim.inquiryMessageId
    ).catch((error) => {
      console.error("Could not load already sent WhatsApp message:", error);
      return null;
    });

    return NextResponse.json({
      ok: true,
      duplicate: true,
      providerMessageId: outboundMessageClaim.providerMessageId,
      inquiryMessage,
      nextStatus,
    });
  }

  if (outboundMessageClaim.outcome === "in_progress") {
    return NextResponse.json(
      {
        error:
          "Este envío de WhatsApp ya se está procesando. Espera unos segundos antes de intentarlo de nuevo.",
      },
      { status: 409 }
    );
  }

  if (outboundMessageClaim.outcome === "delivery_unknown") {
    return NextResponse.json(
      {
        error:
          "COPPE no puede confirmar el resultado de un intento anterior. No se reenviará automáticamente para evitar duplicados.",
      },
      { status: 409 }
    );
  }

  let rateLimit: Awaited<ReturnType<typeof checkOutboundSendRateLimits>>;

  try {
    rateLimit = await checkOutboundSendRateLimits(supabaseAdmin, {
      companyId: inquiry.company_id,
      userId: user.id,
      channel: "whatsapp",
    });
  } catch (error) {
    console.error("Could not check outbound WhatsApp rate limit:", error);

    await markOutboundMessageDeliveryFailure(supabaseAdmin, {
      outboundMessageId: outboundMessageClaim.outboundMessageId,
      processingToken: outboundMessageClaim.processingToken,
      deliveryStatus: "failed",
      errorMessage: "No se pudo comprobar el límite de envíos.",
    });

    return NextResponse.json(
      { error: "No se pudo comprobar el límite de envíos." },
      { status: 500 }
    );
  }

  if (!rateLimit.allowed) {
    await markOutboundMessageDeliveryFailure(supabaseAdmin, {
      outboundMessageId: outboundMessageClaim.outboundMessageId,
      processingToken: outboundMessageClaim.processingToken,
      deliveryStatus: "failed",
      errorMessage: "Límite temporal de envíos de WhatsApp alcanzado.",
    });

    return NextResponse.json(
      {
        error:
          "Se ha alcanzado el límite temporal de envíos de WhatsApp. Inténtalo de nuevo más tarde.",
        retryAfterSeconds: rateLimit.retry_after_seconds,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retry_after_seconds),
        },
      }
    );
  }

  let providerMessageId = "";

  try {
    providerMessageId = await sendWhatsAppTextWithMeta({
      phoneNumberId,
      toPhone,
      text: responseText,
    });
  } catch (error) {
    const providerError = getOutboundProviderError(
      error,
      "No se pudo enviar el WhatsApp."
    );

    console.error("Could not send WhatsApp response with Meta:", error);

    await markOutboundMessageDeliveryFailure(supabaseAdmin, {
      outboundMessageId: outboundMessageClaim.outboundMessageId,
      processingToken: outboundMessageClaim.processingToken,
      deliveryStatus: providerError.deliveryStatus,
      errorMessage: providerError.message,
    });

    return NextResponse.json(
      {
        error:
          providerError.deliveryStatus === "unknown"
            ? "No se pudo confirmar el resultado del envío. COPPE no lo repetirá automáticamente para evitar duplicados."
            : "No se pudo enviar el WhatsApp. Revisa la configuración del canal de WhatsApp.",
      },
      { status: 502 }
    );
  }

  let createdInquiryMessage;

  try {
    createdInquiryMessage = await finalizeOutboundMessageDelivery(
      supabaseAdmin,
      {
        outboundMessageId: outboundMessageClaim.outboundMessageId,
        processingToken: outboundMessageClaim.processingToken,
        companyId: inquiry.company_id,
        providerMessageId,
        nextStatus,
      }
    );
  } catch (error) {
    console.error("WhatsApp accepted, but finalization failed:", error);

    await markOutboundMessageDeliveryFailure(supabaseAdmin, {
      outboundMessageId: outboundMessageClaim.outboundMessageId,
      processingToken: outboundMessageClaim.processingToken,
      deliveryStatus: "unknown",
      errorMessage:
        error instanceof Error
          ? error.message
          : "Meta aceptó el WhatsApp, pero no se pudo finalizar su registro.",
      providerMessageId,
    });

    return NextResponse.json(
      {
        error:
          "Meta aceptó el WhatsApp, pero COPPE no pudo finalizar el historial. No vuelvas a enviarlo hasta revisar el intento.",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    providerMessageId,
    inquiryMessage: createdInquiryMessage,
    nextStatus,
  });
}
