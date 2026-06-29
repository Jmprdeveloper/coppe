import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { OutboundResponseChannel } from "./outboundResponseReliability";

export type OutboundMessageClaim =
  | {
      outcome: "claimed";
      outboundMessageId: string;
      processingToken: string;
      inquiryMessageId: string | null;
      providerMessageId: string | null;
    }
  | {
      outcome: "already_sent";
      outboundMessageId: string;
      processingToken: null;
      inquiryMessageId: string | null;
      providerMessageId: string | null;
    }
  | {
      outcome: "in_progress";
      outboundMessageId: string;
      processingToken: null;
      inquiryMessageId: string | null;
      providerMessageId: string | null;
    }
  | {
      outcome: "delivery_unknown";
      outboundMessageId: string;
      processingToken: null;
      inquiryMessageId: string | null;
      providerMessageId: string | null;
    };

type OutboundMessageClaimRow = {
  outbound_message_id: string;
  claim_status: string;
  claim_token: string | null;
  inquiry_message_id: string | null;
  provider_message_id: string | null;
};

export type FinalizedInquiryMessage = {
  id: string;
  direction: string;
  author_type: string;
  body: string;
  source_channel: string | null;
  created_by: string | null;
  created_at: string;
};

export async function claimOutboundMessage(
  supabaseAdmin: SupabaseClient,
  values: {
    companyId: string;
    inquiryId: string;
    customerId: string;
    channel: OutboundResponseChannel;
    provider: string;
    fromAddress: string;
    fromName?: string | null;
    toAddress: string;
    subject?: string | null;
    body: string;
    deduplicationKey: string;
    replyToken?: string | null;
    nextStatus: "replied" | "waiting_customer";
    userId: string;
  }
): Promise<OutboundMessageClaim> {
  const { data, error } = await supabaseAdmin
    .rpc("claim_outbound_message", {
      p_company_id: values.companyId,
      p_inquiry_id: values.inquiryId,
      p_customer_id: values.customerId,
      p_channel: values.channel,
      p_provider: values.provider,
      p_from_address: values.fromAddress,
      p_from_name: values.fromName ?? null,
      p_to_address: values.toAddress,
      p_subject: values.subject ?? null,
      p_body: values.body,
      p_deduplication_key: values.deduplicationKey,
      p_reply_token: values.replyToken ?? null,
      p_requested_inquiry_status: values.nextStatus,
      p_created_by: values.userId,
    })
    .single<OutboundMessageClaimRow>();

  if (error || !data) {
    throw new Error(
      `No se pudo reclamar el envío saliente: ${
        error?.message || "sin detalle del error"
      }`
    );
  }

  if (data.claim_status === "claimed") {
    if (!data.claim_token) {
      throw new Error(
        "El envío saliente fue reclamado sin token de procesamiento."
      );
    }

    return {
      outcome: "claimed",
      outboundMessageId: data.outbound_message_id,
      processingToken: data.claim_token,
      inquiryMessageId: data.inquiry_message_id,
      providerMessageId: data.provider_message_id,
    };
  }

  if (
    data.claim_status === "already_sent" ||
    data.claim_status === "in_progress" ||
    data.claim_status === "delivery_unknown"
  ) {
    return {
      outcome: data.claim_status,
      outboundMessageId: data.outbound_message_id,
      processingToken: null,
      inquiryMessageId: data.inquiry_message_id,
      providerMessageId: data.provider_message_id,
    };
  }

  throw new Error(
    `El envío saliente devolvió un estado desconocido: ${data.claim_status}.`
  );
}

export async function getInquiryMessageById(
  supabaseAdmin: SupabaseClient,
  inquiryMessageId: string | null
) {
  if (!inquiryMessageId) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("inquiry_messages")
    .select(
      "id, direction, author_type, body, source_channel, created_by, created_at"
    )
    .eq("id", inquiryMessageId)
    .maybeSingle<FinalizedInquiryMessage>();

  if (error) {
    throw new Error(
      `No se pudo cargar el mensaje ya enviado: ${
        error.message || "sin detalle del error"
      }`
    );
  }

  return data;
}

export async function finalizeOutboundMessageDelivery(
  supabaseAdmin: SupabaseClient,
  values: {
    outboundMessageId: string;
    processingToken: string;
    companyId: string;
    providerMessageId: string;
    nextStatus: "replied" | "waiting_customer";
  }
) {
  const { data, error } = await supabaseAdmin
    .rpc("finalize_outbound_message_delivery", {
      p_outbound_message_id: values.outboundMessageId,
      p_processing_token: values.processingToken,
      p_company_id: values.companyId,
      p_provider_message_id: values.providerMessageId,
      p_next_status: values.nextStatus,
    })
    .single<FinalizedInquiryMessage>();

  if (error || !data) {
    throw new Error(
      `El proveedor aceptó el envío, pero COPPE no pudo finalizar su registro: ${
        error?.message || "sin detalle del error"
      }`
    );
  }

  return data;
}

export async function markOutboundMessageDeliveryFailure(
  supabaseAdmin: SupabaseClient,
  values: {
    outboundMessageId: string;
    processingToken: string;
    deliveryStatus: "failed" | "unknown";
    errorMessage: string;
    providerMessageId?: string | null;
  }
) {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("outbound_messages")
    .update({
      status: values.deliveryStatus,
      provider_message_id: values.providerMessageId ?? null,
      error_message: values.errorMessage.slice(0, 2000),
      failed_at: values.deliveryStatus === "failed" ? now : null,
      processing_token: null,
    })
    .eq("id", values.outboundMessageId)
    .eq("status", "pending")
    .eq("processing_token", values.processingToken)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !data) {
    console.error(
      "Could not persist outbound delivery failure state:",
      error ?? "claim no longer active"
    );
    return false;
  }

  return true;
}
