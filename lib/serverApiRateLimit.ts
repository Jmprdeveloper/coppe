import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

type ServerApiRateLimitRow = {
  allowed: boolean;
  current_count: number;
  retry_after_seconds: number;
};

export async function checkServerApiRateLimit(
  supabaseAdmin: SupabaseClient,
  values: {
    bucketKey: string;
    maxRequests: number;
    windowSeconds: number;
  }
) {
  const { data, error } = await supabaseAdmin.rpc("check_server_api_rate_limit", {
    p_bucket_key: values.bucketKey,
    p_max_requests: values.maxRequests,
    p_window_seconds: values.windowSeconds,
  });

  if (error) {
    throw new Error(
      `No se pudo comprobar el límite de uso: ${
        error.message || "sin detalle del error"
      }`
    );
  }

  const rows = Array.isArray(data)
    ? (data as ServerApiRateLimitRow[])
    : data
      ? ([data] as ServerApiRateLimitRow[])
      : [];
  const rateLimit = rows[0];

  if (!rateLimit) {
    throw new Error("No se recibió respuesta al comprobar el límite de uso.");
  }

  return rateLimit;
}

export async function checkOutboundSendRateLimits(
  supabaseAdmin: SupabaseClient,
  values: {
    companyId: string;
    userId: string;
    channel: "email" | "whatsapp";
  }
) {
  const windowSeconds = 60 * 60;
  const userRateLimit = await checkServerApiRateLimit(supabaseAdmin, {
    bucketKey: [
      "outbound",
      values.channel,
      "company",
      values.companyId,
      "user",
      values.userId,
    ].join(":"),
    maxRequests: 60,
    windowSeconds,
  });

  if (!userRateLimit.allowed) {
    return userRateLimit;
  }

  return checkServerApiRateLimit(supabaseAdmin, {
    bucketKey: [
      "outbound",
      values.channel,
      "company",
      values.companyId,
    ].join(":"),
    maxRequests: 500,
    windowSeconds,
  });
}
