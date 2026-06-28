import { createAdminClient } from "./supabase/admin";

type SupabaseAdminClient = ReturnType<typeof createAdminClient>;

type InboundEventClaimRow = {
  event_id: string;
  claim_status: string;
  claim_token: string | null;
  customer_id: string | null;
  inquiry_id: string | null;
};

export type InboundEventClaim =
  | {
      outcome: "claimed";
      eventId: string;
      processingToken: string;
      customerId: string | null;
      inquiryId: string | null;
    }
  | {
      outcome: "processed";
      eventId: string;
      processingToken: null;
      customerId: string | null;
      inquiryId: string | null;
    }
  | {
      outcome: "in_progress";
      eventId: string;
      processingToken: null;
      customerId: string | null;
      inquiryId: string | null;
    };

export async function claimInboundEvent(
  supabaseAdmin: SupabaseAdminClient,
  values: {
    companyId: string;
    sourceChannel: "Email" | "WhatsApp";
    externalMessageId: string;
    rawPayload: Record<string, unknown>;
  }
): Promise<InboundEventClaim> {
  const { data, error } = await supabaseAdmin
    .rpc("claim_inbound_event", {
      p_company_id: values.companyId,
      p_source_channel: values.sourceChannel,
      p_external_message_id: values.externalMessageId,
      p_raw_payload: values.rawPayload,
    })
    .single<InboundEventClaimRow>();

  if (error || !data) {
    throw new Error(
      `No se pudo reclamar el evento entrante: ${
        error?.message || "sin detalle del error"
      }`
    );
  }

  if (data.claim_status === "claimed") {
    if (!data.claim_token) {
      throw new Error(
        "El evento entrante fue reclamado sin un token de procesamiento."
      );
    }

    return {
      outcome: "claimed",
      eventId: data.event_id,
      processingToken: data.claim_token,
      customerId: data.customer_id,
      inquiryId: data.inquiry_id,
    };
  }

  if (data.claim_status === "processed") {
    return {
      outcome: "processed",
      eventId: data.event_id,
      processingToken: null,
      customerId: data.customer_id,
      inquiryId: data.inquiry_id,
    };
  }

  if (data.claim_status === "in_progress") {
    return {
      outcome: "in_progress",
      eventId: data.event_id,
      processingToken: null,
      customerId: data.customer_id,
      inquiryId: data.inquiry_id,
    };
  }

  throw new Error(
    `El evento entrante devolvió un estado desconocido: ${data.claim_status}.`
  );
}

export async function markInboundEventFailed(
  supabaseAdmin: SupabaseAdminClient,
  inboundEventId: string,
  processingToken: string,
  errorMessage: string,
  ids: {
    customerId?: string | null;
    inquiryId?: string | null;
  } = {}
) {
  const values: {
    status: "failed";
    error_message: string;
    processed_at: string;
    processing_token: null;
    customer_id?: string | null;
    inquiry_id?: string | null;
  } = {
    status: "failed",
    error_message: errorMessage,
    processed_at: new Date().toISOString(),
    processing_token: null,
  };

  if (ids.customerId !== undefined) {
    values.customer_id = ids.customerId;
  }

  if (ids.inquiryId !== undefined) {
    values.inquiry_id = ids.inquiryId;
  }

  const { data, error } = await supabaseAdmin
    .from("inbound_events")
    .update(values)
    .eq("id", inboundEventId)
    .eq("status", "received")
    .eq("processing_token", processingToken)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    console.error("Could not mark inbound event as failed:", error);
    return false;
  }

  if (!data) {
    console.error(
      "Could not mark inbound event as failed because its claim is no longer active."
    );
    return false;
  }

  return true;
}
