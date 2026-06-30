import "server-only";

import { createHash } from "node:crypto";

import {
  screenInboundMessage,
  type InboundScreeningResult,
} from "./inboundMessageScreening";
import { createAdminClient } from "./supabase/admin";

type SupabaseAdminClient = ReturnType<typeof createAdminClient>;

type InboundSourceChannel =
  | "Email"
  | "WhatsApp"
  | "Formulario web"
  | "Chat web";

type InboundSafetyInput = {
  companyId: string;
  inboundEventId: string;
  processingToken?: string | null;
  sourceChannel: InboundSourceChannel;
  senderName?: string | null;
  senderEmail?: string | null;
  senderPhone?: string | null;
  senderKey?: string | null;
  subject?: string | null;
  body: string;
  filterEnabled: boolean;
  applySenderRateLimit?: boolean;
};

export type InboundSafetyDecision =
  | {
      quarantined: false;
      screening: InboundScreeningResult;
    }
  | {
      quarantined: true;
      quarantineId: string;
      screening: InboundScreeningResult;
    };

type SenderRuleRow = {
  action: "allow" | "block";
};

type RateLimitRow = {
  allowed: boolean;
};

function normalizeSenderKey(value: string | null | undefined) {
  return value?.trim().toLowerCase().slice(0, 320) ?? "";
}

async function getSenderRule(
  supabaseAdmin: SupabaseAdminClient,
  input: Pick<InboundSafetyInput, "companyId" | "sourceChannel" | "senderKey">,
) {
  const senderKey = normalizeSenderKey(input.senderKey);

  if (senderKey.length < 3) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("inbound_sender_rules")
    .select("action")
    .eq("company_id", input.companyId)
    .eq("source_channel", input.sourceChannel)
    .eq("sender_key", senderKey)
    .maybeSingle<SenderRuleRow>();

  if (error) {
    throw new Error(
      `No se pudo consultar la regla del remitente: ${
        error.message || "sin detalle del error"
      }`,
    );
  }

  return data?.action ?? null;
}

async function isSenderRateLimited(
  supabaseAdmin: SupabaseAdminClient,
  input: Pick<InboundSafetyInput, "companyId" | "sourceChannel" | "senderKey">,
) {
  const senderKey = normalizeSenderKey(input.senderKey);

  if (senderKey.length < 3) {
    return false;
  }

  const senderHash = createHash("sha256")
    .update(senderKey)
    .digest("hex")
    .slice(0, 32);
  const { data, error } = await supabaseAdmin.rpc(
    "check_server_api_rate_limit",
    {
      p_bucket_key: `inbound:${input.companyId}:${input.sourceChannel.toLowerCase()}:${senderHash}`,
      p_max_requests: 12,
      p_window_seconds: 600,
    },
  );

  if (error) {
    throw new Error(
      `No se pudo comprobar el volumen del remitente: ${
        error.message || "sin detalle del error"
      }`,
    );
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | RateLimitRow
    | undefined;

  return row ? !row.allowed : false;
}

async function markInboundEventQuarantined(
  supabaseAdmin: SupabaseAdminClient,
  inboundEventId: string,
  processingToken?: string | null,
) {
  let query = supabaseAdmin
    .from("inbound_events")
    .update({
      status: "processed",
      processing_token: null,
      error_message: null,
      processed_at: new Date().toISOString(),
    })
    .eq("id", inboundEventId);

  if (processingToken) {
    query = query
      .eq("status", "received")
      .eq("processing_token", processingToken);
  }

  const { error } = await query;

  if (error) {
    throw new Error(
      `El mensaje se aisló, pero no se pudo finalizar el evento: ${
        error.message || "sin detalle del error"
      }`,
    );
  }
}

export async function screenAndQuarantineInboundMessage(
  supabaseAdmin: SupabaseAdminClient,
  input: InboundSafetyInput,
): Promise<InboundSafetyDecision> {
  if (!input.filterEnabled) {
    return {
      quarantined: false,
      screening: {
        classification: "legitimate",
        score: 0,
        reasons: ["Filtro desactivado por la empresa"],
        shouldQuarantine: false,
      },
    };
  }

  const senderRule = await getSenderRule(supabaseAdmin, input);
  const rateLimited =
    input.applySenderRateLimit && senderRule !== "allow"
      ? await isSenderRateLimited(supabaseAdmin, input)
      : false;
  const screening = screenInboundMessage({
    senderKey: input.senderKey,
    subject: input.subject,
    body: input.body,
    senderRule,
    rateLimited,
  });

  if (!screening.shouldQuarantine || screening.classification === "legitimate") {
    return { quarantined: false, screening };
  }

  const senderKey = normalizeSenderKey(input.senderKey);
  const { data, error } = await supabaseAdmin
    .from("inbound_message_quarantine")
    .insert({
      company_id: input.companyId,
      inbound_event_id: input.inboundEventId,
      source_channel: input.sourceChannel,
      sender_name: input.senderName?.trim().slice(0, 120) || null,
      sender_email: input.senderEmail?.trim().toLowerCase().slice(0, 254) || null,
      sender_phone: input.senderPhone?.trim().slice(0, 40) || null,
      sender_key: senderKey.length >= 3 ? senderKey : null,
      subject: input.subject?.trim().slice(0, 200) || null,
      body: input.body.trim().slice(0, 12000),
      classification: screening.classification,
      score: screening.score,
      reasons: screening.reasons,
      status: "quarantined",
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    throw new Error(
      `No se pudo poner el mensaje sospechoso en cuarentena: ${
        error?.message || "sin detalle del error"
      }`,
    );
  }

  await markInboundEventQuarantined(
    supabaseAdmin,
    input.inboundEventId,
    input.processingToken,
  );

  return {
    quarantined: true,
    quarantineId: data.id,
    screening,
  };
}
