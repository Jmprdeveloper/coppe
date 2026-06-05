import { NextResponse } from "next/server";
import { Webhook } from "svix";

import { processInboundEmail } from "../../../../lib/inboundEmailProcessing";

type ResendReceivedWebhookPayload = {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    from?: string;
    to?: string[];
    cc?: string[];
    bcc?: string[];
    message_id?: string;
    subject?: string;
  };
};

type ResendReceivedEmail = {
  id?: string;
  to?: string[];
  from?: string;
  subject?: string | null;
  text?: string | null;
  html?: string | null;
  headers?: {
    from?: string;
    [key: string]: string | undefined;
  } | null;
  message_id?: string | null;
};

function getResendWebhookSecret() {
  return process.env.RESEND_WEBHOOK_SECRET?.trim() ?? "";
}

function getResendApiKey() {
  return process.env.RESEND_API_KEY?.trim() ?? "";
}

function getHeaderValue(request: Request, name: string) {
  return request.headers.get(name) ?? "";
}

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractEmailAddress(value: string | null | undefined) {
  const cleanValue = (value ?? "").trim();

  if (!cleanValue) {
    return "";
  }

  const angleMatch = cleanValue.match(/<([^>]+)>/);

  if (angleMatch?.[1]) {
    return angleMatch[1].trim().toLowerCase();
  }

  return cleanValue.trim().toLowerCase();
}

function extractDisplayName(value: string | null | undefined) {
  const cleanValue = (value ?? "").trim();

  if (!cleanValue) {
    return "";
  }

  const angleIndex = cleanValue.indexOf("<");

  if (angleIndex > 0) {
    return cleanValue
      .slice(0, angleIndex)
      .trim()
      .replace(/^"|"$/g, "");
  }

  return "";
}

function getFirstRecipient(email: ResendReceivedEmail) {
  return email.to?.find(Boolean)?.trim().toLowerCase() ?? "";
}

function getTextBody(email: ResendReceivedEmail) {
  const text = (email.text ?? "").trim();

  if (text) {
    return text;
  }

  const html = (email.html ?? "").trim();

  if (html) {
    return stripHtml(html);
  }

  return "";
}

function verifyResendWebhook(
  rawPayload: string,
  request: Request
): ResendReceivedWebhookPayload {
  const webhookSecret = getResendWebhookSecret();

  if (!webhookSecret) {
    throw new Error("Missing RESEND_WEBHOOK_SECRET environment variable.");
  }

  const webhook = new Webhook(webhookSecret);

  return webhook.verify(rawPayload, {
    "svix-id": getHeaderValue(request, "svix-id"),
    "svix-timestamp": getHeaderValue(request, "svix-timestamp"),
    "svix-signature": getHeaderValue(request, "svix-signature"),
  }) as ResendReceivedWebhookPayload;
}

async function retrieveReceivedEmail(emailId: string) {
  const apiKey = getResendApiKey();

  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY environment variable.");
  }

  const response = await fetch(
    `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    }
  );

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMessage =
      typeof payload?.message === "string"
        ? payload.message
        : "No se pudo recuperar el email recibido desde Resend.";

    throw new Error(errorMessage);
  }

  return payload as ResendReceivedEmail;
}

export async function POST(request: Request) {
  let event: ResendReceivedWebhookPayload;

  try {
    const rawPayload = await request.text();
    event = verifyResendWebhook(rawPayload, request);
  } catch (error) {
    console.error("Invalid Resend webhook:", error);

    return NextResponse.json(
      { error: "Webhook de Resend no válido." },
      { status: 400 }
    );
  }

  if (event.type !== "email.received") {
    return NextResponse.json(
      {
        ok: true,
        ignored: true,
        message: "Evento ignorado.",
      },
      { status: 200 }
    );
  }

  const emailId = event.data?.email_id?.trim() ?? "";

  if (!emailId) {
    return NextResponse.json(
      { error: "El evento de Resend no incluye email_id." },
      { status: 400 }
    );
  }

  let receivedEmail: ResendReceivedEmail;

  try {
    receivedEmail = await retrieveReceivedEmail(emailId);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo recuperar el email recibido desde Resend.",
      },
      { status: 500 }
    );
  }

  const headerFrom = receivedEmail.headers?.from ?? "";
  const fallbackFrom = event.data?.from ?? receivedEmail.from ?? "";

  const fromEmail = extractEmailAddress(headerFrom || fallbackFrom);
  const fromName = extractDisplayName(headerFrom || fallbackFrom);
  const inboundEmailAddress =
    getFirstRecipient(receivedEmail) ||
    event.data?.to?.find(Boolean)?.trim().toLowerCase() ||
    "";
  const subject = receivedEmail.subject ?? event.data?.subject ?? "";
  const textBody = getTextBody(receivedEmail);
  const externalMessageId = `resend:${emailId}`;

  const result = await processInboundEmail({
    inboundEmailAddress,
    externalMessageId,
    fromName,
    fromEmail,
    subject,
    textBody,
  });

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