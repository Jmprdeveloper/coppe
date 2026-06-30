import "server-only";

import { createHash } from "node:crypto";

import { buildAutomaticAcknowledgementText } from "./automaticAcknowledgementText";
import { createAdminClient } from "./supabase/admin";

type SupabaseAdminClient = ReturnType<typeof createAdminClient>;
type AcknowledgementChannel =
  | "Formulario web"
  | "Chat web"
  | "Email"
  | "WhatsApp";

type AutomaticAcknowledgementInput = {
  company: {
    id: string;
    name: string;
    auto_acknowledgement_enabled?: boolean | null;
    auto_acknowledgement_message?: string | null;
  };
  inquiryId: string;
  customer: {
    id: string;
    email?: string | null;
    phone?: string | null;
  };
  channel: AcknowledgementChannel;
  subject?: string | null;
};

type AcknowledgementRow = {
  id: string;
  status: "processing" | "sent" | "failed" | "skipped";
  body: string;
};

type ResendResponse = {
  id?: string;
  message?: string;
};

type WhatsAppResponse = {
  messages?: Array<{ id?: string }>;
  error?: {
    message?: string;
    error_user_msg?: string;
    error_data?: { details?: string };
  };
};

export type AutomaticAcknowledgementResult = {
  status: "sent" | "failed" | "skipped" | "duplicate";
  body: string;
};

function normalizeWhatsAppPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("00") ? digits.slice(2) : digits;
}

function sanitizeDisplayName(value: string) {
  return value.replace(/[\r\n<>]/g, " ").replace(/\s+/g, " ").trim() || "COPPE";
}

function getEmailDomain(address: string) {
  return address.split("@")[1]?.trim().toLowerCase() ?? "";
}

async function insertAcknowledgementMessage(
  supabaseAdmin: SupabaseAdminClient,
  values: {
    companyId: string;
    inquiryId: string;
    customerId: string;
    channel: AcknowledgementChannel;
    body: string;
  },
) {
  const { data, error } = await supabaseAdmin
    .from("inquiry_messages")
    .insert({
      company_id: values.companyId,
      inquiry_id: values.inquiryId,
      customer_id: values.customerId,
      direction: "outbound",
      author_type: "company",
      body: values.body,
      source_channel: values.channel,
      message_kind: "automatic_acknowledgement",
      created_by: null,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    throw new Error(
      `No se pudo registrar el acuse automático: ${
        error?.message || "sin detalle del error"
      }`,
    );
  }

  return data.id;
}

async function updateAcknowledgement(
  supabaseAdmin: SupabaseAdminClient,
  id: string,
  values: Record<string, unknown>,
) {
  const { error } = await supabaseAdmin
    .from("automatic_acknowledgements")
    .update({
      ...values,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("Could not update automatic acknowledgement:", error);
  }
}

async function sendEmailAcknowledgement(
  supabaseAdmin: SupabaseAdminClient,
  input: AutomaticAcknowledgementInput,
  acknowledgement: AcknowledgementRow,
) {
  const apiKey = process.env.RESEND_API_KEY?.trim() ?? "";
  const toAddress = input.customer.email?.trim().toLowerCase() ?? "";
  const { data: channel } = await supabaseAdmin
    .from("inbound_email_channels")
    .select("inbound_email_address")
    .eq("company_id", input.company.id)
    .eq("provider", "resend")
    .eq("enabled", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ inbound_email_address: string }>();
  const fromAddress = channel?.inbound_email_address?.trim().toLowerCase() ?? "";
  const domain = getEmailDomain(fromAddress);

  if (!apiKey || !toAddress || !domain) {
    return { skipped: "Canal de email saliente no configurado." } as const;
  }

  const replyToken = createHash("sha256")
    .update(`auto-ack:${acknowledgement.id}`)
    .digest("hex")
    .slice(0, 32);
  const replyTo = `reply-${replyToken}@${domain}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `auto-ack:${acknowledgement.id}`,
      },
      body: JSON.stringify({
        from: `${sanitizeDisplayName(input.company.name)} <${fromAddress}>`,
        to: [toAddress],
        subject: `Hemos recibido tu mensaje · ${sanitizeDisplayName(
          input.company.name,
        )}`.slice(0, 200),
        text: acknowledgement.body,
        reply_to: replyTo,
      }),
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => null)) as
      | ResendResponse
      | null;

    if (!response.ok || !payload?.id) {
      throw new Error(payload?.message || "Resend no confirmó el envío.");
    }

    return {
      provider: "resend",
      providerMessageId: payload.id,
      recipient: toAddress,
      fromAddress,
      replyToken,
      replyTo,
    } as const;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function sendWhatsAppAcknowledgement(
  supabaseAdmin: SupabaseAdminClient,
  input: AutomaticAcknowledgementInput,
  acknowledgement: AcknowledgementRow,
) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim() ?? "";
  const toPhone = normalizeWhatsAppPhone(input.customer.phone ?? "");
  const { data: channel } = await supabaseAdmin
    .from("inbound_whatsapp_channels")
    .select("phone_number_id, display_phone_number")
    .eq("company_id", input.company.id)
    .eq("provider", "meta")
    .eq("enabled", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      phone_number_id: string;
      display_phone_number: string | null;
    }>();

  if (
    !accessToken ||
    !channel?.phone_number_id ||
    !/^[1-9][0-9]{7,14}$/.test(toPhone)
  ) {
    return { skipped: "Canal de WhatsApp saliente no configurado." } as const;
  }

  const graphVersion =
    process.env.WHATSAPP_GRAPH_API_VERSION?.trim() || "v23.0";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(
      `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(
        channel.phone_number_id,
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
          text: { preview_url: false, body: acknowledgement.body },
        }),
        signal: controller.signal,
      },
    );
    const payload = (await response.json().catch(() => null)) as
      | WhatsAppResponse
      | null;
    const providerMessageId = payload?.messages?.[0]?.id?.trim() ?? "";

    if (!response.ok || !providerMessageId) {
      throw new Error(
        payload?.error?.error_user_msg ||
          payload?.error?.error_data?.details ||
          payload?.error?.message ||
          "Meta no confirmó el envío.",
      );
    }

    return {
      provider: "meta",
      providerMessageId,
      recipient: `+${toPhone}`,
      fromAddress:
        channel.display_phone_number?.trim() ||
        `phone_number_id:${channel.phone_number_id}`,
    } as const;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function sendAutomaticAcknowledgement(
  supabaseAdmin: SupabaseAdminClient,
  input: AutomaticAcknowledgementInput,
): Promise<AutomaticAcknowledgementResult> {
  const body = buildAutomaticAcknowledgementText({
    companyName: input.company.name,
    customMessage: input.company.auto_acknowledgement_message,
  });

  const recipient =
    input.channel === "Email"
      ? input.customer.email?.trim().toLowerCase()
      : input.channel === "WhatsApp"
        ? input.customer.phone?.trim()
        : null;
  const { data, error } = await supabaseAdmin
    .from("automatic_acknowledgements")
    .insert({
      company_id: input.company.id,
      inquiry_id: input.inquiryId,
      customer_id: input.customer.id,
      channel: input.channel,
      recipient: recipient || null,
      body,
      status: "processing",
    })
    .select("id, status, body")
    .single<AcknowledgementRow>();

  if (error || !data) {
    if (error?.code === "23505") {
      return { status: "duplicate", body };
    }

    console.error("Could not claim automatic acknowledgement:", error);
    return { status: "failed", body };
  }

  if (input.company.auto_acknowledgement_enabled === false) {
    await updateAcknowledgement(supabaseAdmin, data.id, {
      status: "skipped",
      error_message: "Acuse automático desactivado por la empresa.",
    });
    return { status: "skipped", body };
  }

  try {
    if (input.channel === "Formulario web" || input.channel === "Chat web") {
      await insertAcknowledgementMessage(supabaseAdmin, {
        companyId: input.company.id,
        inquiryId: input.inquiryId,
        customerId: input.customer.id,
        channel: input.channel,
        body,
      });
      await updateAcknowledgement(supabaseAdmin, data.id, {
        provider: "coppe",
        status: "sent",
        sent_at: new Date().toISOString(),
      });
      return { status: "sent", body };
    }

    const delivery =
      input.channel === "Email"
        ? await sendEmailAcknowledgement(supabaseAdmin, input, data)
        : await sendWhatsAppAcknowledgement(supabaseAdmin, input, data);

    if ("skipped" in delivery) {
      await updateAcknowledgement(supabaseAdmin, data.id, {
        status: "skipped",
        error_message: delivery.skipped,
      });
      return { status: "skipped", body };
    }

    const inquiryMessageId = await insertAcknowledgementMessage(
      supabaseAdmin,
      {
        companyId: input.company.id,
        inquiryId: input.inquiryId,
        customerId: input.customer.id,
        channel: input.channel,
        body,
      },
    );

    const outboundChannel = input.channel === "Email" ? "email" : "whatsapp";
    const { error: outboundError } = await supabaseAdmin
      .from("outbound_messages")
      .insert({
        company_id: input.company.id,
        inquiry_id: input.inquiryId,
        customer_id: input.customer.id,
        inquiry_message_id: inquiryMessageId,
        channel: outboundChannel,
        provider: delivery.provider,
        status: "sent",
        from_address: delivery.fromAddress,
        from_name: input.company.name,
        to_address: delivery.recipient,
        subject:
          input.channel === "Email"
            ? `Hemos recibido tu mensaje · ${input.company.name}`.slice(0, 200)
            : null,
        body,
        provider_message_id: delivery.providerMessageId,
        reply_token:
          "replyToken" in delivery ? delivery.replyToken : null,
        deduplication_key: `auto_ack:${data.id}`,
        attempt_count: 1,
        sent_at: new Date().toISOString(),
        created_by: null,
      });

    if (outboundError) {
      console.error(
        "Automatic acknowledgement was sent, but outbound log failed:",
        outboundError,
      );
    }

    await updateAcknowledgement(supabaseAdmin, data.id, {
      provider: delivery.provider,
      provider_message_id: delivery.providerMessageId,
      recipient: delivery.recipient,
      status: "sent",
      sent_at: new Date().toISOString(),
      error_message: outboundError
        ? "El proveedor aceptó el envío, pero falló el registro de entrega."
        : null,
    });

    return { status: "sent", body };
  } catch (acknowledgementError) {
    console.error("Could not send automatic acknowledgement:", acknowledgementError);
    await updateAcknowledgement(supabaseAdmin, data.id, {
      status: "failed",
      error_message:
        acknowledgementError instanceof Error
          ? acknowledgementError.message.slice(0, 1000)
          : "No se pudo enviar el acuse automático.",
    });
    return { status: "failed", body };
  }
}
