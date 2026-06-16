import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import {
  buildRequestBodyTooLargeResponse,
  readRequestJsonWithLimit,
  RequestBodyTooLargeError,
} from "../../../../lib/requestBodyLimits";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { createClient } from "../../../../lib/supabase/server";

export const runtime = "nodejs";

const MAX_SEND_EMAIL_RESPONSE_REQUEST_BODY_BYTES = 32 * 1024;
const MAX_EMAIL_RESPONSE_TEXT_LENGTH = 12000;

type SendEmailResponseRequestBody = {
  inquiryId?: unknown;
  responseText?: unknown;
  nextStatus?: unknown;
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

type OutboundMessageRow = {
  id: string;
};

type InquiryMessageRow = {
  id: string;
  direction: string;
  author_type: string;
  body: string;
  source_channel: string | null;
  created_at: string;
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

function createEmailReplyToken() {
  return randomBytes(16).toString("hex");
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

function isValidNextStatus(value: string): value is "replied" | "waiting_customer" {
  return value === "replied" || value === "waiting_customer";
}

function hasBasicEmailShape(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function sanitizeDisplayName(value: string) {
  const cleanValue = value.replace(/[\r\n<>]/g, " ").replace(/\s+/g, " ").trim();

  return cleanValue || "COPPE";
}

function buildFromHeader(fromName: string, fromAddress: string) {
  return `${sanitizeDisplayName(fromName)} <${fromAddress}>`;
}

function buildEmailSubject(inquiry: InquiryForEmailResponseRow, companyName: string) {
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
}: {
  from: string;
  to: string;
  subject: string;
  text: string;
  replyTo: string;
}) {
  const apiKey = getResendApiKey();

  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY environment variable.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
      reply_to: replyTo,
    }),
  });

  const payload = (await response
    .json()
    .catch(() => null)) as ResendSendEmailResponse | null;

  if (!response.ok || !payload?.id) {
    throw new Error(getResendErrorMessage(payload));
  }

  return payload.id;
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

  const { data: emailChannel, error: emailChannelError } = await supabase
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

  const supabaseAdmin = createAdminClient();
  const subject = buildEmailSubject(inquiry, company.name);
  const fromName = company.name;
  const fromHeader = buildFromHeader(fromName, fromAddress);
  const replyToken = createEmailReplyToken();
  const replyToAddress = buildReplyToAddress(replyToken, fromAddress);
  const now = new Date().toISOString();

  const { data: outboundMessage, error: outboundMessageError } =
    await supabaseAdmin
      .from("outbound_messages")
      .insert({
        company_id: inquiry.company_id,
        inquiry_id: inquiry.id,
        customer_id: customer.id,
        channel: "email",
        provider: "resend",
        status: "pending",
        from_address: fromAddress,
        from_name: fromName,
        to_address: toAddress,
        subject,
        body: responseText,
        reply_token: replyToken,
        created_by: user.id,
      })
      .select("id")
      .single<OutboundMessageRow>();

  if (outboundMessageError || !outboundMessage) {
    console.error(
      "Could not create outbound email message log:",
      outboundMessageError
    );

    return NextResponse.json(
      { error: "No se pudo registrar el intento de envío." },
      { status: 500 }
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
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "No se pudo enviar el email.";

    console.error("Could not send email response with Resend:", error);

    await supabaseAdmin
      .from("outbound_messages")
      .update({
        status: "failed",
        error_message: errorMessage,
        failed_at: now,
      })
      .eq("id", outboundMessage.id);

    return NextResponse.json(
      {
        error:
          "No se pudo enviar el email. Revisa la configuración del canal de email.",
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
        source_channel: "Email",
      })
      .select("id, direction, author_type, body, source_channel, created_at")
      .single<InquiryMessageRow>();

  if (createInquiryMessageError || !createdInquiryMessage) {
    console.error(
      "Email sent, but could not create inquiry message:",
      createInquiryMessageError
    );

    await supabaseAdmin
      .from("outbound_messages")
      .update({
        status: "sent",
        provider_message_id: providerMessageId,
        error_message:
          "El email se envió, pero no se pudo registrar en el historial del caso.",
        sent_at: new Date().toISOString(),
      })
      .eq("id", outboundMessage.id);

    return NextResponse.json(
      {
        ok: true,
        warning:
          "El email se envió, pero no se pudo registrar en el historial del caso.",
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
    .eq("id", outboundMessage.id);

  if (updateOutboundMessageError) {
    console.error(
      "Email sent, but could not update outbound message log:",
      updateOutboundMessageError
    );
  }

  const { error: updateInquiryError } = await supabaseAdmin
    .from("inquiries")
    .update({
      status: nextStatus,
      suggested_response: responseText,
    })
    .eq("id", inquiry.id)
    .eq("company_id", inquiry.company_id);

  if (updateInquiryError) {
    console.error("Email sent, but could not update inquiry:", updateInquiryError);

    return NextResponse.json(
      {
        ok: true,
        warning:
          "El email se envió, pero no se pudo actualizar el estado del caso.",
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
