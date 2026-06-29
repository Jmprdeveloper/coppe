import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import {
  buildRequestBodyTooLargeResponse,
  readRequestJsonWithLimit,
  RequestBodyTooLargeError,
} from "../../../../lib/requestBodyLimits";
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
import { checkOutboundSendRateLimits } from "../../../../lib/serverApiRateLimit";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { createClient } from "../../../../lib/supabase/server";

export const runtime = "nodejs";

const MAX_SEND_EMAIL_RESPONSE_REQUEST_BODY_BYTES = 32 * 1024;
const MAX_EMAIL_RESPONSE_TEXT_LENGTH = 12000;
const DEFAULT_RESEND_REQUEST_TIMEOUT_MS = 15000;
const MAX_RESEND_REQUEST_TIMEOUT_MS = 30000;

type SendEmailResponseNextStatus = "replied" | "waiting_customer";

type SendEmailResponseRequestBody = {
  inquiryId?: unknown;
  responseText?: unknown;
  nextStatus?: unknown;
  requestId?: unknown;
};

type InquiryForEmailResponseRow = {
  id: string;
  company_id: string;
  customer_id: string | null;
  customer_name: string;
  source_channel: string;
  subject: string | null;
  status: string;
};

type CustomerForEmailResponseRow = {
  id: string;
  company_id: string;
  name: string;
  email: string | null;
};

type CompanyForEmailResponseRow = {
  id: string;
  name: string;
};

type EmailChannelRow = {
  id: string;
  company_id: string;
  inbound_email_address: string;
  provider: string;
  enabled: boolean;
};

type ResendSendEmailResponse = {
  id?: string;
  name?: string;
  message?: string;
  error?: string;
};

function getResendApiKey() {
  return process.env.RESEND_API_KEY?.trim() ?? "";
}

function getResendRequestTimeoutMs() {
  const value = Number(process.env.RESEND_REQUEST_TIMEOUT_MS);

  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_RESEND_REQUEST_TIMEOUT_MS;
  }

  return Math.min(Math.round(value), MAX_RESEND_REQUEST_TIMEOUT_MS);
}

function createEmailReplyToken(deduplicationKey: string) {
  return createHash("sha256")
    .update("coppe-email-reply")
    .update("\n")
    .update(deduplicationKey)
    .digest("hex")
    .slice(0, 32);
}

function getEmailDomain(address: string) {
  const domain = address.split("@")[1]?.trim().toLowerCase() ?? "";

  return domain;
}

function buildReplyToAddress(replyToken: string, fromAddress: string) {
  const domain = getEmailDomain(fromAddress);

  if (!domain) {
    throw new Error("The outbound email channel does not have a valid domain.");
  }

  return `reply-${replyToken}@${domain}`;
}

function isValidNextStatus(
  value: string
): value is SendEmailResponseNextStatus {
  return value === "replied" || value === "waiting_customer";
}

function hasBasicEmailShape(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function sanitizeDisplayName(value: string) {
  const cleanValue = value
    .replace(/[\r\n<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleanValue || "COPPE";
}

function buildFromHeader(fromName: string, fromAddress: string) {
  return `${sanitizeDisplayName(fromName)} <${fromAddress}>`;
}

function buildEmailSubject(
  inquiry: InquiryForEmailResponseRow,
  companyName: string
) {
  const cleanSubject = inquiry.subject?.trim();

  if (cleanSubject) {
    if (/^re:/i.test(cleanSubject)) {
      return cleanSubject.slice(0, 200);
    }

    return `Re: ${cleanSubject}`.slice(0, 200);
  }

  return `Respuesta de ${sanitizeDisplayName(companyName)}`.slice(0, 200);
}

function getResendErrorMessage(payload: ResendSendEmailResponse | null) {
  const message =
    typeof payload?.message === "string" && payload.message.trim()
      ? payload.message.trim()
      : "";

  if (message) {
    return message;
  }

  const error =
    typeof payload?.error === "string" && payload.error.trim()
      ? payload.error.trim()
      : "";

  if (error) {
    return error;
  }

  return "Resend no pudo enviar el email.";
}

async function sendEmailWithResend({
  from,
  to,
  subject,
  text,
  replyTo,
  idempotencyKey,
}: {
  from: string;
  to: string;
  subject: string;
  text: string;
  replyTo: string;
  idempotencyKey: string;
}) {
  const apiKey = getResendApiKey();

  if (!apiKey) {
    throw new OutboundProviderError(
      "Missing RESEND_API_KEY environment variable.",
      "failed"
    );
  }

  let lastUncertainError: OutboundProviderError | null = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, getResendRequestTimeoutMs());

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject,
          text,
          reply_to: replyTo,
        }),
        signal: controller.signal,
      });

      const payload = (await response
        .json()
        .catch(() => null)) as ResendSendEmailResponse | null;

      if (!response.ok) {
        const providerError = new OutboundProviderError(
          getResendErrorMessage(payload),
          getHttpProviderDeliveryFailureStatus(response.status)
        );

        if ((response.status === 429 || response.status >= 500) && attempt < 2) {
          lastUncertainError = providerError;
          continue;
        }

        throw providerError;
      }

      if (!payload?.id) {
        throw new OutboundProviderError(
          "Resend aceptó la petición sin devolver un identificador de mensaje.",
          "unknown"
        );
      }

      return payload.id;
    } catch (error) {
      const providerError = getOutboundProviderError(
        error,
        "No se pudo enviar el email con Resend."
      );

      if (providerError.deliveryStatus === "unknown" && attempt < 2) {
        lastUncertainError = providerError;
        continue;
      }

      throw providerError;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw (
    lastUncertainError ??
    new OutboundProviderError(
      "No se pudo confirmar el envío del email con Resend.",
      "unknown"
    )
  );
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

  let body: SendEmailResponseRequestBody;

  try {
    body = await readRequestJsonWithLimit<SendEmailResponseRequestBody>(
      request,
      MAX_SEND_EMAIL_RESPONSE_REQUEST_BODY_BYTES
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

  if (responseText.length > MAX_EMAIL_RESPONSE_TEXT_LENGTH) {
    return NextResponse.json(
      {
        error: `La respuesta no puede superar los ${MAX_EMAIL_RESPONSE_TEXT_LENGTH} caracteres.`,
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
    .maybeSingle<InquiryForEmailResponseRow>();

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
    .select("id, company_id, name, email")
    .eq("id", inquiry.customer_id)
    .maybeSingle<CustomerForEmailResponseRow>();

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

  const toAddress = customer.email?.trim().toLowerCase() ?? "";

  if (!toAddress || !hasBasicEmailShape(toAddress)) {
    return NextResponse.json(
      { error: "El cliente no tiene un email válido para responder desde COPPE." },
      { status: 400 }
    );
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, name")
    .eq("id", inquiry.company_id)
    .maybeSingle<CompanyForEmailResponseRow>();

  if (companyError) {
    return NextResponse.json(
      { error: "No se pudo cargar la empresa del caso." },
      { status: 500 }
    );
  }

  if (!company) {
    return NextResponse.json(
      { error: "No se encontró la empresa del caso." },
      { status: 404 }
    );
  }

  const supabaseAdmin = createAdminClient();

  const { data: emailChannel, error: emailChannelError } = await supabaseAdmin
    .from("inbound_email_channels")
    .select("id, company_id, inbound_email_address, provider, enabled")
    .eq("company_id", inquiry.company_id)
    .eq("provider", "resend")
    .eq("enabled", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<EmailChannelRow>();

  if (emailChannelError) {
    return NextResponse.json(
      { error: "No se pudo cargar el canal de email de la empresa." },
      { status: 500 }
    );
  }

  if (!emailChannel || emailChannel.company_id !== inquiry.company_id) {
    return NextResponse.json(
      {
        error:
          "Esta empresa no tiene un canal de email entrante activo para enviar respuestas.",
      },
      { status: 400 }
    );
  }

  const fromAddress = emailChannel.inbound_email_address.trim().toLowerCase();

  if (!fromAddress || !hasBasicEmailShape(fromAddress)) {
    return NextResponse.json(
      { error: "El canal de email de la empresa no tiene una dirección válida." },
      { status: 400 }
    );
  }

  const subject = buildEmailSubject(inquiry, company.name);
  const fromName = company.name;
  const fromHeader = buildFromHeader(fromName, fromAddress);
  const deduplicationKey = buildOutboundResponseDeduplicationKey({
    channel: "email",
    requestId,
    inquiryId: inquiry.id,
    customerId: customer.id,
    destination: toAddress,
    responseText,
  });
  const replyToken = createEmailReplyToken(deduplicationKey);
  const replyToAddress = buildReplyToAddress(replyToken, fromAddress);
  let outboundMessageClaim: Awaited<ReturnType<typeof claimOutboundMessage>>;

  try {
    outboundMessageClaim = await claimOutboundMessage(supabaseAdmin, {
      companyId: inquiry.company_id,
      inquiryId: inquiry.id,
      customerId: customer.id,
      channel: "email",
      provider: "resend",
      fromAddress,
      fromName,
      toAddress,
      subject,
      body: responseText,
      deduplicationKey,
      replyToken,
      nextStatus,
      userId: user.id,
    });
  } catch (error) {
    console.error("Could not claim outbound email message:", error);

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
      console.error("Could not load already sent email message:", error);
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
          "Este envío de email ya se está procesando. Espera unos segundos antes de intentarlo de nuevo.",
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
      channel: "email",
    });
  } catch (error) {
    console.error("Could not check outbound email rate limit:", error);

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
      errorMessage: "Límite temporal de envíos de email alcanzado.",
    });

    return NextResponse.json(
      {
        error:
          "Se ha alcanzado el límite temporal de envíos de email. Inténtalo de nuevo más tarde.",
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
    providerMessageId = await sendEmailWithResend({
      from: fromHeader,
      to: toAddress,
      subject,
      text: responseText,
      replyTo: replyToAddress,
      idempotencyKey: deduplicationKey,
    });
  } catch (error) {
    const providerError = getOutboundProviderError(
      error,
      "No se pudo enviar el email."
    );

    console.error("Could not send email response with Resend:", error);

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
            : "No se pudo enviar el email. Revisa la configuración del canal de email.",
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
    console.error("Email accepted, but finalization failed:", error);

    await markOutboundMessageDeliveryFailure(supabaseAdmin, {
      outboundMessageId: outboundMessageClaim.outboundMessageId,
      processingToken: outboundMessageClaim.processingToken,
      deliveryStatus: "unknown",
      errorMessage:
        error instanceof Error
          ? error.message
          : "El proveedor aceptó el email, pero no se pudo finalizar su registro.",
      providerMessageId,
    });

    return NextResponse.json(
      {
        error:
          "El proveedor aceptó el email, pero COPPE no pudo finalizar el historial. No vuelvas a enviarlo hasta revisar el intento.",
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
