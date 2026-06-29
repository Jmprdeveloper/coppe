import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import {
  buildRequestBodyTooLargeResponse,
  readRequestJsonWithLimit,
  RequestBodyTooLargeError,
} from "../../../../lib/requestBodyLimits";
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

type OutboundMessageRow = {
  id: string;
  status: string;
  inquiry_message_id: string | null;
  provider_message_id: string | null;
  error_message: string | null;
};

type InquiryMessageRow = {
  id: string;
  direction: string;
  author_type: string;
  body: string;
  source_channel: string | null;
  created_at: string;
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

function canSendResponseForInquiryStatus(status: string) {
  return status === "new" || status === "pending" || status === "waiting_customer";
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

function stripLeadingGreetingForDuplicateCheck(value: string) {
  return value
    .replace(/^(hola|hello|hi)\s*[,.:;!\-–—]\s*/u, "")
    .replace(
      /^(hola|hello|hi)\s+[\p{L}\p{M}'’ .-]{1,80}\s*[,.:;!\-–—]\s*/u,
      ""
    )
    .replace(
      /^(estimado\/a|estimado|estimada|dear)\s+[\p{L}\p{M}'’ .-]{1,80}\s*[,.:;!\-–—]\s*/u,
      ""
    )
    .replace(
      /^(buenos dias|buenos días|buenas tardes|buenas noches|good morning|good afternoon|good evening)\s*[,.:;!\-–—]?\s*/u,
      ""
    )
    .trim();
}

function normalizeWhatsAppResponseTextForDuplicateCheck(value: string) {
  return stripLeadingGreetingForDuplicateCheck(
    value
      .normalize("NFKC")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[.!?¡¿…;:]+$/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
  )
    .replace(/[.!?¡¿…;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildDeduplicationKey(values: {
  inquiryId: string;
  customerId: string;
  toPhone: string;
  responseText: string;
}) {
  const normalizedResponseText = normalizeWhatsAppResponseTextForDuplicateCheck(
    values.responseText
  );
  const digest = createHash("sha256")
    .update(values.inquiryId)
    .update("\n")
    .update(values.customerId)
    .update("\n")
    .update(values.toPhone)
    .update("\n")
    .update(normalizedResponseText)
    .digest("hex");

  return `whatsapp_response:${digest}`;
}

function isUniqueViolation(error: { code?: string; message?: string } | null) {
  return (
    error?.code === "23505" ||
    (typeof error?.message === "string" &&
      error.message.toLowerCase().includes("duplicate key"))
  );
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
    throw new Error("Missing WHATSAPP_ACCESS_TOKEN environment variable.");
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

    if (!response.ok || !providerMessageId) {
      throw new Error(getMetaWhatsAppErrorMessage(payload));
    }

    return providerMessageId;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Meta tardó demasiado en responder al envío de WhatsApp.");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function createWhatsAppResponseAuditLog(
  supabase: Awaited<ReturnType<typeof createClient>>,
  values: {
    companyId: string;
    inquiryId: string;
    customerId: string;
    customerPhone: string;
    whatsAppChannelId: string;
    phoneNumberId: string;
    outboundMessageId: string;
    inquiryMessageId: string | null;
    providerMessageId: string;
    nextStatus: SendWhatsAppResponseNextStatus;
    warning?: string;
  }
) {
  const metadata: Record<string, string | null> = {
    customer_id: values.customerId,
    customer_phone: values.customerPhone,
    whatsapp_channel_id: values.whatsAppChannelId,
    phone_number_id: values.phoneNumberId,
    outbound_message_id: values.outboundMessageId,
    inquiry_message_id: values.inquiryMessageId,
    provider: "meta",
    provider_message_id: values.providerMessageId,
    requested_next_status: values.nextStatus,
  };

  if (values.warning) {
    metadata.warning = values.warning;
  }

  const { error } = await supabase.rpc("create_audit_log", {
    target_company_id: values.companyId,
    audit_action: "send_whatsapp_response",
    audit_entity_type: "inquiry",
    audit_entity_id: values.inquiryId,
    audit_metadata: metadata,
  });

  if (error) {
    console.error("WhatsApp sent, but could not create audit log:", error);
  }
}

async function getExistingOutboundMessageByDeduplicationKey(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  values: {
    companyId: string;
    channel: "whatsapp";
    deduplicationKey: string;
  }
) {
  const { data, error } = await supabaseAdmin
    .from("outbound_messages")
    .select("id, status, inquiry_message_id, provider_message_id, error_message")
    .eq("company_id", values.companyId)
    .eq("channel", values.channel)
    .eq("deduplication_key", values.deduplicationKey)
    .maybeSingle<OutboundMessageRow>();

  if (error) {
    throw new Error(
      `No se pudo comprobar si esta respuesta ya existe: ${
        error.message || "sin detalle del error"
      }`
    );
  }

  return data;
}

async function createOrClaimPendingOutboundWhatsAppMessage(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  values: {
    companyId: string;
    inquiryId: string;
    customerId: string;
    fromAddress: string;
    toAddress: string;
    body: string;
    deduplicationKey: string;
    userId: string;
  }
): Promise<
  | {
      outcome: "ready";
      outboundMessage: OutboundMessageRow;
    }
  | {
      outcome: "duplicate_sent";
      outboundMessage: OutboundMessageRow | null;
    }
  | {
      outcome: "duplicate_pending";
      outboundMessage: OutboundMessageRow | null;
    }
> {
  const insertResult = await supabaseAdmin
    .from("outbound_messages")
    .insert({
      company_id: values.companyId,
      inquiry_id: values.inquiryId,
      customer_id: values.customerId,
      channel: "whatsapp",
      provider: "meta",
      status: "pending",
      from_address: values.fromAddress,
      to_address: values.toAddress,
      body: values.body,
      deduplication_key: values.deduplicationKey,
      created_by: values.userId,
    })
    .select("id, status, inquiry_message_id, provider_message_id, error_message")
    .single<OutboundMessageRow>();

  if (!insertResult.error && insertResult.data) {
    return {
      outcome: "ready",
      outboundMessage: insertResult.data,
    };
  }

  if (!isUniqueViolation(insertResult.error)) {
    throw new Error(
      `No se pudo registrar el intento de envío: ${
        insertResult.error?.message || "sin detalle del error"
      }`
    );
  }

  const existingOutboundMessage = await getExistingOutboundMessageByDeduplicationKey(
    supabaseAdmin,
    {
      companyId: values.companyId,
      channel: "whatsapp",
      deduplicationKey: values.deduplicationKey,
    }
  );

  if (!existingOutboundMessage) {
    return {
      outcome: "duplicate_pending",
      outboundMessage: null,
    };
  }

  if (existingOutboundMessage.status === "sent") {
    return {
      outcome: "duplicate_sent",
      outboundMessage: existingOutboundMessage,
    };
  }

  if (existingOutboundMessage.status === "pending") {
    return {
      outcome: "duplicate_pending",
      outboundMessage: existingOutboundMessage,
    };
  }

  if (existingOutboundMessage.status !== "failed") {
    return {
      outcome: "duplicate_pending",
      outboundMessage: existingOutboundMessage,
    };
  }

  const { data: claimedOutboundMessage, error: claimError } = await supabaseAdmin
    .from("outbound_messages")
    .update({
      status: "pending",
      from_address: values.fromAddress,
      to_address: values.toAddress,
      body: values.body,
      provider_message_id: null,
      inquiry_message_id: null,
      error_message: null,
      sent_at: null,
      failed_at: null,
      created_by: values.userId,
    })
    .eq("id", existingOutboundMessage.id)
    .eq("status", "failed")
    .select("id, status, inquiry_message_id, provider_message_id, error_message")
    .maybeSingle<OutboundMessageRow>();

  if (claimError || !claimedOutboundMessage) {
    return {
      outcome: "duplicate_pending",
      outboundMessage: existingOutboundMessage,
    };
  }

  return {
    outcome: "ready",
    outboundMessage: claimedOutboundMessage,
  };
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
  const deduplicationKey = buildDeduplicationKey({
    inquiryId: inquiry.id,
    customerId: customer.id,
    toPhone,
    responseText,
  });

  let outboundMessage: OutboundMessageRow;

  try {
    const outboundMessageClaim = await createOrClaimPendingOutboundWhatsAppMessage(
      supabaseAdmin,
      {
        companyId: inquiry.company_id,
        inquiryId: inquiry.id,
        customerId: customer.id,
        fromAddress,
        toAddress,
        body: responseText,
        deduplicationKey,
        userId: user.id,
      }
    );

    if (outboundMessageClaim.outcome === "duplicate_sent") {
      return NextResponse.json(
        {
          error:
            "Esta respuesta ya fue enviada por WhatsApp en este caso. Edita el texto si necesitas enviar una nueva respuesta.",
        },
        { status: 409 }
      );
    }

    if (outboundMessageClaim.outcome === "duplicate_pending") {
      return NextResponse.json(
        {
          error:
            "Esta respuesta ya se está enviando por WhatsApp en este caso. Espera unos segundos antes de intentarlo de nuevo.",
        },
        { status: 409 }
      );
    }

    outboundMessage = outboundMessageClaim.outboundMessage;
  } catch (error) {
    console.error("Could not create outbound WhatsApp message log:", error);

    return NextResponse.json(
      { error: "No se pudo registrar el intento de envío." },
      { status: 500 }
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
    const errorMessage =
      error instanceof Error ? error.message : "No se pudo enviar el WhatsApp.";

    console.error("Could not send WhatsApp response with Meta:", error);

    await supabaseAdmin
      .from("outbound_messages")
      .update({
        status: "failed",
        error_message: errorMessage,
        failed_at: new Date().toISOString(),
      })
      .eq("id", outboundMessage.id)
      .eq("status", "pending");

    return NextResponse.json(
      {
        error:
          "No se pudo enviar el WhatsApp. Revisa la configuración del canal de WhatsApp.",
      },
      { status: 502 }
    );
  }

  const { data: createdInquiryMessage, error: createInquiryMessageError } =
    await supabaseAdmin
      .from("inquiry_messages")
      .insert({
        company_id: inquiry.company_id,
        inquiry_id: inquiry.id,
        customer_id: customer.id,
        direction: "outbound",
        author_type: "company",
        body: responseText,
        source_channel: "WhatsApp",
      })
      .select("id, direction, author_type, body, source_channel, created_at")
      .single<InquiryMessageRow>();

  if (createInquiryMessageError || !createdInquiryMessage) {
    console.error(
      "WhatsApp sent, but could not create inquiry message:",
      createInquiryMessageError
    );

    await supabaseAdmin
      .from("outbound_messages")
      .update({
        status: "sent",
        provider_message_id: providerMessageId,
        error_message:
          "El WhatsApp se envió, pero no se pudo registrar en el historial del caso.",
        sent_at: new Date().toISOString(),
      })
      .eq("id", outboundMessage.id);

    await createWhatsAppResponseAuditLog(supabase, {
      companyId: inquiry.company_id,
      inquiryId: inquiry.id,
      customerId: customer.id,
      customerPhone: toAddress,
      whatsAppChannelId: whatsAppChannel.id,
      phoneNumberId,
      outboundMessageId: outboundMessage.id,
      inquiryMessageId: null,
      providerMessageId,
      nextStatus,
      warning: "inquiry_message_creation_failed",
    });

    return NextResponse.json(
      {
        ok: true,
        warning:
          "El WhatsApp se envió, pero no se pudo registrar en el historial del caso.",
        providerMessageId,
      },
      { status: 200 }
    );
  }

  const { error: updateOutboundMessageError } = await supabaseAdmin
    .from("outbound_messages")
    .update({
      status: "sent",
      provider_message_id: providerMessageId,
      inquiry_message_id: createdInquiryMessage.id,
      sent_at: new Date().toISOString(),
    })
    .eq("id", outboundMessage.id)
    .eq("status", "pending");

  if (updateOutboundMessageError) {
    console.error(
      "WhatsApp sent, but could not update outbound message log:",
      updateOutboundMessageError
    );
  }

  await createWhatsAppResponseAuditLog(supabase, {
    companyId: inquiry.company_id,
    inquiryId: inquiry.id,
    customerId: customer.id,
    customerPhone: toAddress,
    whatsAppChannelId: whatsAppChannel.id,
    phoneNumberId,
    outboundMessageId: outboundMessage.id,
    inquiryMessageId: createdInquiryMessage.id,
    providerMessageId,
    nextStatus,
  });

  const { error: updateInquiryError } = await supabaseAdmin
    .from("inquiries")
    .update({
      status: nextStatus,
      suggested_response: responseText,
    })
    .eq("id", inquiry.id)
    .eq("company_id", inquiry.company_id);

  if (updateInquiryError) {
    console.error(
      "WhatsApp sent, but could not update inquiry:",
      updateInquiryError
    );

    return NextResponse.json(
      {
        ok: true,
        warning:
          "El WhatsApp se envió, pero no se pudo actualizar el estado del caso.",
        providerMessageId,
        inquiryMessage: createdInquiryMessage,
      },
      { status: 200 }
    );
  }

  return NextResponse.json({
    ok: true,
    providerMessageId,
    inquiryMessage: createdInquiryMessage,
    nextStatus,
  });
}
