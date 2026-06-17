import { NextResponse } from "next/server";

import { type AnalyzeInquiryRequestBody } from "../../../../lib/inquiryAnalysisApi";
import { MAX_ANALYSIS_MESSAGE_LENGTH } from "../../../../lib/inquiryAnalysisLimits";
import { analyzeInquiryForCompany } from "../../../../lib/inquiryAnalysisService";
import { getCurrentCompany } from "../../../../lib/currentCompany";
import {
  buildRequestBodyTooLargeResponse,
  readRequestJsonWithLimit,
  RequestBodyTooLargeError,
} from "../../../../lib/requestBodyLimits";
import { createClient } from "../../../../lib/supabase/server";

const MAX_ANALYZE_REQUEST_BODY_BYTES = 32 * 1024;
const ANALYZE_RATE_LIMIT_MAX_REQUESTS = 60;
const ANALYZE_RATE_LIMIT_WINDOW_SECONDS = 60 * 60;

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function checkAuthenticatedApiRateLimit(
  supabase: ServerSupabaseClient,
  values: {
    bucketKey: string;
    maxRequests: number;
    windowSeconds: number;
  }
) {
  const { data, error } = await supabase.rpc(
    "check_authenticated_api_rate_limit",
    {
      bucket_key: values.bucketKey,
      max_requests: values.maxRequests,
      window_seconds: values.windowSeconds,
    }
  );

  if (error) {
    throw new Error(
      `No se pudo comprobar el límite de uso: ${
        error.message || "sin detalle del error"
      }`
    );
  }

  return Boolean(data);
}

function buildAnalyzeRateLimitBucketKey(values: {
  companyId: string;
  userId: string;
}) {
  return `inquiries:analyze:${values.companyId}:${values.userId}`;
}

function buildAnalyzeRateLimitExceededResponse() {
  return NextResponse.json(
    {
      error:
        "Has alcanzado el límite temporal de análisis de casos. Espera unos minutos antes de volver a intentarlo.",
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(ANALYZE_RATE_LIMIT_WINDOW_SECONDS),
      },
    }
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

  let body: AnalyzeInquiryRequestBody;

  try {
    body = await readRequestJsonWithLimit<AnalyzeInquiryRequestBody>(
      request,
      MAX_ANALYZE_REQUEST_BODY_BYTES
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

  const customerName =
    typeof body.customerName === "string" ? body.customerName.trim() : "";

  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!customerName) {
    return NextResponse.json(
      { error: "El nombre del cliente es obligatorio." },
      { status: 400 }
    );
  }

  if (!message) {
    return NextResponse.json(
      { error: "El mensaje del caso es obligatorio." },
      { status: 400 }
    );
  }

  if (message.length > MAX_ANALYSIS_MESSAGE_LENGTH) {
    return NextResponse.json(
      {
        error: `El mensaje del caso no puede superar los ${MAX_ANALYSIS_MESSAGE_LENGTH} caracteres.`,
      },
      { status: 400 }
    );
  }

  const { data: company, error: companyError } = await getCurrentCompany(
    supabase
  );

  if (companyError) {
    return NextResponse.json(
      {
        error: `No se pudo cargar la empresa asociada al usuario: ${
          companyError.message || "sin detalle del error"
        }`,
      },
      { status: 500 }
    );
  }

  if (!company) {
    return NextResponse.json(
      { error: "No hay ninguna empresa asociada al usuario." },
      { status: 404 }
    );
  }

  let canAnalyze = false;

  try {
    canAnalyze = await checkAuthenticatedApiRateLimit(supabase, {
      bucketKey: buildAnalyzeRateLimitBucketKey({
        companyId: company.id,
        userId: user.id,
      }),
      maxRequests: ANALYZE_RATE_LIMIT_MAX_REQUESTS,
      windowSeconds: ANALYZE_RATE_LIMIT_WINDOW_SECONDS,
    });
  } catch (error) {
    console.error("Could not check inquiry analysis rate limit:", error);

    return NextResponse.json(
      {
        error:
          "No se pudo comprobar el límite de uso del análisis. Inténtalo de nuevo en unos segundos.",
      },
      { status: 500 }
    );
  }

  if (!canAnalyze) {
    return buildAnalyzeRateLimitExceededResponse();
  }

  try {
    const analysis = await analyzeInquiryForCompany({
      customerName,
      message,
      company,
    });

    return NextResponse.json({ analysis });
  } catch (error) {
    console.error("Unexpected inquiry analysis error:", error);

    return NextResponse.json(
      {
        error:
          "No se pudo preparar el análisis del caso. Inténtalo de nuevo en unos segundos.",
      },
      { status: 500 }
    );
  }
}
