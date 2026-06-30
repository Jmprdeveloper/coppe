import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import {
  getCustomerDatabaseErrorMessage,
  isValidEmail,
  isValidPhone,
  normalizePhoneForComparison,
} from "../../../lib/customerValidation";
import { inferSentiment } from "../../../lib/inquiryAnalysis";
import { MAX_ANALYSIS_MESSAGE_LENGTH } from "../../../lib/inquiryAnalysisLimits";
import { analyzeInquiryForCompany } from "../../../lib/inquiryAnalysisService";
import { sendAutomaticAcknowledgement } from "../../../lib/automaticAcknowledgement";
import { screenAndQuarantineInboundMessage } from "../../../lib/inboundMessageSafety";
import { createAdminClient } from "../../../lib/supabase/admin";
import {
  buildRequestBodyTooLargeResponse,
  readRequestJsonWithLimit,
  RequestBodyTooLargeError,
} from "../../../lib/requestBodyLimits";

type PublicSourceChannel = "Formulario web" | "Chat web";

type PublicIntakeRequestBody = {
  publicIntakeToken?: string;
  token?: string;
  customerName?: string;
  email?: string;
  phone?: string;
  message?: string;
  companyWebsite?: string;
  sourceChannel?: string;
};

type PublicIntakeCompany = {
  id: string;
  name: string;
  sector: string;
  description: string | null;
  tone: string | null;
  language: string | null;
  public_intake_enabled: boolean;
  public_chat_enabled: boolean;
  auto_acknowledgement_enabled: boolean;
  auto_acknowledgement_message: string | null;
  inbound_filter_enabled: boolean;
};

type PublicIntakeAnalysis = Awaited<
  ReturnType<typeof analyzeInquiryForCompany>
>;

type CustomerRow = {
  id: string;
  company_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  language: string | null;
  status: string;
  last_interaction_at: string | null;
  created_at: string;
};

type InboundEventRow = {
  id: string;
};

type PublicIntakeRateLimitRow = {
  allowed: boolean;
  current_count: number;
  retry_after_seconds: number;
};

type PublicIntakeAuditAction =
  | "create_public_intake"
  | "create_customer_from_public_intake"
  | "update_customer_from_public_intake"
  | "create_inquiry_from_public_intake"
  | "fail_public_intake";

type PublicIntakeAuditEntityType = "inbound_event" | "customer" | "inquiry";

type PublicIntakeAuditMetadata = Record<
  string,
  string | number | boolean | null | string[]
>;

const MAX_CUSTOMER_NAME_LENGTH = 120;
const MAX_EMAIL_LENGTH = 254;
const MAX_PHONE_LENGTH = 40;
const PUBLIC_INTAKE_RATE_LIMIT_MAX_REQUESTS = 5;
const PUBLIC_INTAKE_RATE_LIMIT_WINDOW_SECONDS = 10 * 60;
const MAX_PUBLIC_INTAKE_REQUEST_BODY_BYTES = 32 * 1024;
const GENERIC_PUBLIC_INTAKE_ERROR_MESSAGE =
  "No se pudo registrar el mensaje. Inténtalo de nuevo en unos minutos.";

function getStringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    const firstForwardedIp = forwardedFor
      .split(",")
      .map((value) => value.trim())
      .find(Boolean);

    if (firstForwardedIp) {
      return firstForwardedIp;
    }
  }

  return (
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-vercel-forwarded-for") ||
    "unknown"
  );
}

function hashRateLimitPart(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function createPublicChatConversationToken() {
  return randomBytes(32).toString("base64url");
}

function hashPublicChatConversationToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function getPublicChatSessionDays() {
  const value = Number(process.env.PUBLIC_CHAT_SESSION_DAYS);

  if (!Number.isFinite(value) || value <= 0) {
    return 30;
  }

  return Math.min(Math.round(value), 365);
}

async function createPublicIntakeAuditLog(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  values: {
    companyId: string;
    action: PublicIntakeAuditAction;
    entityType: PublicIntakeAuditEntityType;
    entityId: string;
    metadata: PublicIntakeAuditMetadata;
  },
) {
  try {
    const { error } = await supabaseAdmin.from("audit_logs").insert({
      company_id: values.companyId,
      actor_user_id: null,
      actor_email: null,
      actor_role: "public",
      action: values.action,
      entity_type: values.entityType,
      entity_id: values.entityId,
      metadata: values.metadata,
    });

    if (error) {
      console.error(
        "Public intake action completed, but audit log failed:",
        error,
      );
    }
  } catch (error) {
    console.error(
      "Public intake action completed, but audit log failed:",
      error,
    );
  }
}

function buildPublicIntakeRateLimitBucketKey(
  request: Request,
  publicIntakeToken: string,
  sourceChannel: PublicSourceChannel,
) {
  const clientIp = getClientIp(request);

  return [
    "public-intake",
    sourceChannel === "Chat web" ? "chat" : "form",
    hashRateLimitPart(publicIntakeToken),
    hashRateLimitPart(clientIp),
  ].join(":");
}

async function checkPublicIntakeRateLimit(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  request: Request,
  publicIntakeToken: string,
  sourceChannel: PublicSourceChannel,
) {
  const bucketKey = buildPublicIntakeRateLimitBucketKey(
    request,
    publicIntakeToken,
    sourceChannel,
  );

  const { data, error } = await supabaseAdmin.rpc(
    "check_public_intake_rate_limit",
    {
      p_bucket_key: bucketKey,
      p_max_requests: PUBLIC_INTAKE_RATE_LIMIT_MAX_REQUESTS,
      p_window_seconds: PUBLIC_INTAKE_RATE_LIMIT_WINDOW_SECONDS,
    },
  );

  if (error) {
    throw new Error(
      `No se pudo comprobar el límite de envíos: ${
        error.message || "sin detalle del error"
      }`,
    );
  }

  const rows = Array.isArray(data)
    ? (data as PublicIntakeRateLimitRow[])
    : data
      ? ([data] as PublicIntakeRateLimitRow[])
      : [];

  const rateLimit = rows[0];

  if (!rateLimit) {
    throw new Error(
      "No se recibió respuesta al comprobar el límite de envíos.",
    );
  }

  return rateLimit;
}

function buildRateLimitedResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    {
      error:
        "Has enviado demasiados mensajes en poco tiempo. Inténtalo de nuevo dentro de unos minutos.",
      retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}

function normalizePublicSourceChannel(
  value: string | null | undefined,
): PublicSourceChannel {
  if (value === "Chat web") {
    return "Chat web";
  }

  return "Formulario web";
}

function getPublicSourceChannelText(sourceChannel: PublicSourceChannel) {
  if (sourceChannel === "Chat web") {
    return {
      shortLabel: "chat web",
      subjectFallback: "Nuevo mensaje recibido desde chat web",
      summarySuffix: "a través del chat web.",
      intent: "Mensaje recibido desde el chat web público.",
    };
  }

  return {
    shortLabel: "formulario web",
    subjectFallback: "Nuevo mensaje recibido desde formulario web",
    summarySuffix: "a través del formulario web.",
    intent: "Mensaje recibido desde el formulario web público.",
  };
}

function buildFallbackSubject(
  message: string,
  sourceChannel: PublicSourceChannel,
) {
  const firstLine = message
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) {
    return getPublicSourceChannelText(sourceChannel).subjectFallback;
  }

  if (firstLine.length <= 80) {
    return firstLine;
  }

  return `${firstLine.slice(0, 77)}...`;
}

function buildFallbackAnalysis(
  customerName: string,
  message: string,
  company: PublicIntakeCompany,
  sourceChannel: PublicSourceChannel,
): PublicIntakeAnalysis {
  const language = company.language === "en" ? "en" : "es";
  const sourceChannelText = getPublicSourceChannelText(sourceChannel);
  const subject = buildFallbackSubject(message, sourceChannel);
  const sentiment = inferSentiment("general_info", message);

  return {
    language,
    category: "general_info",
    priority: "medium",
    sentiment,
    summary: `${customerName} ha enviado un mensaje ${sourceChannelText.summarySuffix}`,
    intent: sourceChannelText.intent,
    missingInformation: [],
    recommendedAction:
      "Revisar el mensaje y responder al cliente desde el canal adecuado.",
    suggestedResponse: `Hola ${customerName}, gracias por contactar con ${company.name}. Hemos recibido tu mensaje y lo revisaremos lo antes posible.`,
    subject,
  };
}

function buildAcceptedHoneypotResponse() {
  return NextResponse.json(
    {
      ok: true,
      message: "Mensaje recibido correctamente.",
    },
    { status: 201 },
  );
}

async function createInboundEvent(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  companyId: string,
  sourceChannel: PublicSourceChannel,
  rawPayload: Record<string, unknown>,
) {
  const { data, error } = await supabaseAdmin
    .from("inbound_events")
    .insert({
      company_id: companyId,
      source_channel: sourceChannel,
      status: "received",
      raw_payload: rawPayload,
    })
    .select("id")
    .single<InboundEventRow>();

  if (error || !data) {
    throw new Error(
      `No se pudo registrar la entrada recibida: ${
        error?.message || "sin detalle del error"
      }`,
    );
  }

  return data.id;
}

async function updateInboundEvent(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  inboundEventId: string,
  values: {
    status: "processed" | "failed";
    customer_id?: string | null;
    inquiry_id?: string | null;
    error_message?: string | null;
    processed_at: string;
  },
) {
  const { error } = await supabaseAdmin
    .from("inbound_events")
    .update(values)
    .eq("id", inboundEventId);

  if (error) {
    console.error("Could not update inbound event:", error);
  }
}

async function buildFailedResponseAfterInboundEvent(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  inboundEventId: string,
  internalErrorMessage: string,
  status: number,
  ids: {
    customerId?: string | null;
    inquiryId?: string | null;
  } = {},
  publicErrorMessage = GENERIC_PUBLIC_INTAKE_ERROR_MESSAGE,
  auditContext?: {
    companyId: string;
    sourceChannel: PublicSourceChannel;
    failureStage: string;
    hadEmail: boolean;
    hadPhone: boolean;
    messageLength: number;
  },
) {
  console.error("Public intake processing failed:", internalErrorMessage);

  await updateInboundEvent(supabaseAdmin, inboundEventId, {
    status: "failed",
    customer_id: ids.customerId ?? null,
    inquiry_id: ids.inquiryId ?? null,
    error_message: internalErrorMessage,
    processed_at: new Date().toISOString(),
  });

  if (auditContext) {
    await createPublicIntakeAuditLog(supabaseAdmin, {
      companyId: auditContext.companyId,
      action: "fail_public_intake",
      entityType: "inbound_event",
      entityId: inboundEventId,
      metadata: {
        inbound_event_id: inboundEventId,
        customer_id: ids.customerId ?? null,
        inquiry_id: ids.inquiryId ?? null,
        source_channel: auditContext.sourceChannel,
        failure_stage: auditContext.failureStage,
        response_status: status,
        had_email: auditContext.hadEmail,
        had_phone: auditContext.hadPhone,
        message_length: auditContext.messageLength,
      },
    });
  }

  return NextResponse.json({ error: publicErrorMessage }, { status });
}

async function findExistingCustomer(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  companyId: string,
  email: string,
  phone: string,
) {
  if (email) {
    const { data, error } = await supabaseAdmin
      .from("customers")
      .select(
        "id, company_id, name, email, phone, language, status, last_interaction_at, created_at",
      )
      .eq("company_id", companyId)
      .eq("email", email)
      .limit(1)
      .maybeSingle<CustomerRow>();

    if (error) {
      throw new Error(
        `No se pudo comprobar si el cliente ya existe por email: ${
          error.message || "sin detalle del error"
        }`,
      );
    }

    if (data) {
      return data;
    }
  }

  if (!phone) {
    return null;
  }

  const normalizedPhone = normalizePhoneForComparison(phone);

  const { data, error } = await supabaseAdmin
    .from("customers")
    .select(
      "id, company_id, name, email, phone, language, status, last_interaction_at, created_at",
    )
    .eq("company_id", companyId);

  if (error) {
    throw new Error(
      `No se pudo comprobar si el cliente ya existe por teléfono: ${
        error.message || "sin detalle del error"
      }`,
    );
  }

  return (
    ((data ?? []) as CustomerRow[]).find((customer) => {
      return normalizePhoneForComparison(customer.phone) === normalizedPhone;
    }) ?? null
  );
}

export async function POST(request: Request) {
  const supabaseAdmin = createAdminClient();

  let body: PublicIntakeRequestBody;

  try {
    body = await readRequestJsonWithLimit<PublicIntakeRequestBody>(
      request,
      MAX_PUBLIC_INTAKE_REQUEST_BODY_BYTES,
    );
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return buildRequestBodyTooLargeResponse(error.maxBytes);
    }

    return NextResponse.json(
      { error: "El cuerpo de la petición no es válido." },
      { status: 400 },
    );
  }

  const honeypotValue = getStringValue(body.companyWebsite);

  if (honeypotValue) {
    return buildAcceptedHoneypotResponse();
  }

  const publicIntakeToken =
    getStringValue(body.publicIntakeToken) || getStringValue(body.token);
  const customerName = getStringValue(body.customerName);
  const email = getStringValue(body.email).toLowerCase();
  const phone = getStringValue(body.phone);
  const message = getStringValue(body.message);
  const sourceChannel = normalizePublicSourceChannel(
    getStringValue(body.sourceChannel),
  );

  if (!publicIntakeToken) {
    return NextResponse.json(
      { error: "Falta el identificador público." },
      { status: 400 },
    );
  }

  if (!customerName) {
    return NextResponse.json(
      { error: "El nombre del cliente es obligatorio." },
      { status: 400 },
    );
  }

  if (customerName.length > MAX_CUSTOMER_NAME_LENGTH) {
    return NextResponse.json(
      {
        error: `El nombre no puede superar los ${MAX_CUSTOMER_NAME_LENGTH} caracteres.`,
      },
      { status: 400 },
    );
  }

  if (!email && !phone) {
    return NextResponse.json(
      {
        error:
          "Introduce al menos un email o un teléfono para poder contactar con el cliente.",
      },
      { status: 400 },
    );
  }

  if (email.length > MAX_EMAIL_LENGTH) {
    return NextResponse.json(
      {
        error: `El email no puede superar los ${MAX_EMAIL_LENGTH} caracteres.`,
      },
      { status: 400 },
    );
  }

  if (phone.length > MAX_PHONE_LENGTH) {
    return NextResponse.json(
      {
        error: `El teléfono no puede superar los ${MAX_PHONE_LENGTH} caracteres.`,
      },
      { status: 400 },
    );
  }

  if (email && !isValidEmail(email)) {
    return NextResponse.json(
      { error: "El email no tiene un formato válido." },
      { status: 400 },
    );
  }

  if (phone && !isValidPhone(phone)) {
    return NextResponse.json(
      { error: "El teléfono no tiene un formato válido." },
      { status: 400 },
    );
  }

  if (!message) {
    return NextResponse.json(
      { error: "El mensaje es obligatorio." },
      { status: 400 },
    );
  }

  if (message.length > MAX_ANALYSIS_MESSAGE_LENGTH) {
    return NextResponse.json(
      {
        error: `El mensaje no puede superar los ${MAX_ANALYSIS_MESSAGE_LENGTH} caracteres.`,
      },
      { status: 400 },
    );
  }

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select(
      "id, name, sector, description, tone, language, public_intake_enabled, public_chat_enabled, auto_acknowledgement_enabled, auto_acknowledgement_message, inbound_filter_enabled",
    )
    .eq("public_intake_token", publicIntakeToken)
    .maybeSingle<PublicIntakeCompany>();

  if (companyError) {
    console.error("Could not load public intake company:", companyError);

    return NextResponse.json(
      {
        error:
          "No se pudo cargar el enlace público. Inténtalo de nuevo en unos minutos.",
      },
      { status: 500 },
    );
  }

  if (!company) {
    return NextResponse.json(
      { error: "El enlace público no existe o ya no está disponible." },
      { status: 404 },
    );
  }

  if (sourceChannel === "Formulario web" && !company.public_intake_enabled) {
    return NextResponse.json(
      { error: "El formulario web público no está activo en este momento." },
      { status: 403 },
    );
  }

  if (sourceChannel === "Chat web" && !company.public_chat_enabled) {
    return NextResponse.json(
      { error: "El chat web público no está activo en este momento." },
      { status: 403 },
    );
  }

  try {
    const rateLimit = await checkPublicIntakeRateLimit(
      supabaseAdmin,
      request,
      publicIntakeToken,
      sourceChannel,
    );

    if (!rateLimit.allowed) {
      return buildRateLimitedResponse(rateLimit.retry_after_seconds);
    }
  } catch (error) {
    console.error("Could not check public intake rate limit:", error);

    return NextResponse.json(
      {
        error:
          "No se pudo comprobar el límite de envíos. Inténtalo de nuevo en unos minutos.",
      },
      { status: 500 },
    );
  }

  let inboundEventId: string;

  try {
    inboundEventId = await createInboundEvent(
      supabaseAdmin,
      company.id,
      sourceChannel,
      {
        publicIntakeToken,
        customerName,
        email,
        phone,
        message,
        sourceChannel,
      },
    );
  } catch (error) {
    console.error("Could not create public intake inbound event:", error);

    return NextResponse.json(
      { error: GENERIC_PUBLIC_INTAKE_ERROR_MESSAGE },
      { status: 500 },
    );
  }

  const auditBaseMetadata = {
    inbound_event_id: inboundEventId,
    source_channel: sourceChannel,
    had_email: Boolean(email),
    had_phone: Boolean(phone),
    message_length: message.length,
  };

  await createPublicIntakeAuditLog(supabaseAdmin, {
    companyId: company.id,
    action: "create_public_intake",
    entityType: "inbound_event",
    entityId: inboundEventId,
    metadata: {
      ...auditBaseMetadata,
      name_length: customerName.length,
    },
  });

  try {
    const safetyDecision = await screenAndQuarantineInboundMessage(
      supabaseAdmin,
      {
        companyId: company.id,
        inboundEventId,
        sourceChannel,
        senderName: customerName,
        senderEmail: email || null,
        senderPhone: phone || null,
        senderKey: email || normalizePhoneForComparison(phone),
        body: message,
        filterEnabled: company.inbound_filter_enabled,
      },
    );

    if (safetyDecision.quarantined) {
      return NextResponse.json(
        { ok: true, message: "Mensaje recibido correctamente." },
        { status: 201 },
      );
    }
  } catch (error) {
    return buildFailedResponseAfterInboundEvent(
      supabaseAdmin,
      inboundEventId,
      error instanceof Error
        ? error.message
        : "No se pudo comprobar la seguridad del mensaje.",
      500,
      {},
      GENERIC_PUBLIC_INTAKE_ERROR_MESSAGE,
      {
        companyId: company.id,
        sourceChannel,
        failureStage: "screen_inbound_message",
        hadEmail: Boolean(email),
        hadPhone: Boolean(phone),
        messageLength: message.length,
      },
    );
  }

  const now = new Date().toISOString();

  let createdCustomerFromPublicIntake = false;
  let customer: CustomerRow | null = null;

  try {
    customer = await findExistingCustomer(
      supabaseAdmin,
      company.id,
      email,
      phone,
    );
  } catch (error) {
    return buildFailedResponseAfterInboundEvent(
      supabaseAdmin,
      inboundEventId,
      error instanceof Error
        ? error.message
        : "No se pudo comprobar si el cliente ya existe.",
      500,
      {},
      GENERIC_PUBLIC_INTAKE_ERROR_MESSAGE,
      {
        companyId: company.id,
        sourceChannel,
        failureStage: "find_existing_customer",
        hadEmail: Boolean(email),
        hadPhone: Boolean(phone),
        messageLength: message.length,
      },
    );
  }

  if (customer) {
    const customerUpdates: Partial<CustomerRow> = {
      last_interaction_at: now,
    };

    if (!customer.email && email) {
      customerUpdates.email = email;
    }

    if (!customer.phone && phone) {
      customerUpdates.phone = phone;
    }

    if (!customer.language) {
      customerUpdates.language = company.language ?? "es";
    }

    const { data: updatedCustomer, error: updateCustomerError } =
      await supabaseAdmin
        .from("customers")
        .update(customerUpdates)
        .eq("id", customer.id)
        .select(
          "id, company_id, name, email, phone, language, status, last_interaction_at, created_at",
        )
        .single<CustomerRow>();

    if (updateCustomerError || !updatedCustomer) {
      return buildFailedResponseAfterInboundEvent(
        supabaseAdmin,
        inboundEventId,
        `No se pudo actualizar el cliente existente: ${
          updateCustomerError?.message || "sin detalle del error"
        }`,
        500,
        { customerId: customer.id },
        GENERIC_PUBLIC_INTAKE_ERROR_MESSAGE,
        {
          companyId: company.id,
          sourceChannel,
          failureStage: "update_customer",
          hadEmail: Boolean(email),
          hadPhone: Boolean(phone),
          messageLength: message.length,
        },
      );
    }

    await createPublicIntakeAuditLog(supabaseAdmin, {
      companyId: company.id,
      action: "update_customer_from_public_intake",
      entityType: "customer",
      entityId: updatedCustomer.id,
      metadata: {
        ...auditBaseMetadata,
        customer_id: updatedCustomer.id,
        previous_status: customer.status,
        next_status: updatedCustomer.status,
        previous_language: customer.language,
        next_language: updatedCustomer.language,
        changed_fields: Object.keys(customerUpdates).sort(),
      },
    });

    customer = updatedCustomer;
  } else {
    const { data: createdCustomer, error: createCustomerError } =
      await supabaseAdmin
        .from("customers")
        .insert({
          company_id: company.id,
          name: customerName,
          email: email || null,
          phone: phone || null,
          language: company.language ?? "es",
          status: "active",
          last_interaction_at: now,
        })
        .select(
          "id, company_id, name, email, phone, language, status, last_interaction_at, created_at",
        )
        .single<CustomerRow>();

    if (createCustomerError || !createdCustomer) {
      return buildFailedResponseAfterInboundEvent(
        supabaseAdmin,
        inboundEventId,
        `No se pudo crear el cliente: ${getCustomerDatabaseErrorMessage(
          createCustomerError?.message ?? "",
        )}`,
        500,
        {},
        GENERIC_PUBLIC_INTAKE_ERROR_MESSAGE,
        {
          companyId: company.id,
          sourceChannel,
          failureStage: "create_customer",
          hadEmail: Boolean(email),
          hadPhone: Boolean(phone),
          messageLength: message.length,
        },
      );
    }

    await createPublicIntakeAuditLog(supabaseAdmin, {
      companyId: company.id,
      action: "create_customer_from_public_intake",
      entityType: "customer",
      entityId: createdCustomer.id,
      metadata: {
        ...auditBaseMetadata,
        customer_id: createdCustomer.id,
        status: createdCustomer.status,
        language: createdCustomer.language,
        name_length: customerName.length,
      },
    });

    createdCustomerFromPublicIntake = true;
    customer = createdCustomer;
  }

  let analysis = buildFallbackAnalysis(
    customerName,
    message,
    company,
    sourceChannel,
  );

  try {
    analysis = await analyzeInquiryForCompany({
      customerName,
      message,
      company,
    });
  } catch (error) {
    console.error("Public intake analysis fallback used:", error);
  }

  const { data: createdInquiryIdFromRpc, error: createInquiryError } =
    await supabaseAdmin.rpc("create_inquiry_with_initial_message", {
      p_company_id: company.id,
      p_customer_id: customer.id,
      p_customer_name: customer.name || customerName,
      p_source_channel: sourceChannel,
      p_subject: analysis.subject,
      p_original_message: message,
      p_ai_summary: analysis.summary,
      p_ai_intent: analysis.intent,
      p_ai_category: analysis.category,
      p_ai_priority: analysis.priority,
      p_ai_language: analysis.language,
      p_sentiment: analysis.sentiment,
      p_missing_information: analysis.missingInformation,
      p_recommended_action: analysis.recommendedAction,
      p_suggested_response: analysis.suggestedResponse,
      p_status: "new",
      p_message_direction: "inbound",
      p_message_author_type: "customer",
    });

  if (createInquiryError || !createdInquiryIdFromRpc) {
    return buildFailedResponseAfterInboundEvent(
      supabaseAdmin,
      inboundEventId,
      `No se pudo crear el caso con su mensaje inicial: ${
        createInquiryError?.message || "sin detalle del error"
      }`,
      500,
      { customerId: customer.id },
      GENERIC_PUBLIC_INTAKE_ERROR_MESSAGE,
      {
        companyId: company.id,
        sourceChannel,
        failureStage: "create_inquiry",
        hadEmail: Boolean(email),
        hadPhone: Boolean(phone),
        messageLength: message.length,
      },
    );
  }

  const createdInquiryId = String(createdInquiryIdFromRpc);
  let conversationToken = "";

  if (sourceChannel === "Chat web") {
    conversationToken = createPublicChatConversationToken();
    const expiresAt = new Date(
      Date.now() + getPublicChatSessionDays() * 24 * 60 * 60 * 1000
    ).toISOString();
    const { error: chatSessionError } = await supabaseAdmin
      .from("public_chat_sessions")
      .insert({
        company_id: company.id,
        inquiry_id: createdInquiryId,
        customer_id: customer.id,
        token_hash: hashPublicChatConversationToken(conversationToken),
        expires_at: expiresAt,
      });

    if (chatSessionError) {
      return buildFailedResponseAfterInboundEvent(
        supabaseAdmin,
        inboundEventId,
        `El caso se creó, pero no se pudo iniciar la conversación pública: ${
          chatSessionError.message || "sin detalle del error"
        }`,
        500,
        {
          customerId: customer.id,
          inquiryId: createdInquiryId,
        },
        GENERIC_PUBLIC_INTAKE_ERROR_MESSAGE,
        {
          companyId: company.id,
          sourceChannel,
          failureStage: "create_public_chat_session",
          hadEmail: Boolean(email),
          hadPhone: Boolean(phone),
          messageLength: message.length,
        }
      );
    }
  }

  await createPublicIntakeAuditLog(supabaseAdmin, {
    companyId: company.id,
    action: "create_inquiry_from_public_intake",
    entityType: "inquiry",
    entityId: createdInquiryId,
    metadata: {
      ...auditBaseMetadata,
      customer_id: customer.id,
      inquiry_id: createdInquiryId,
      language: analysis.language,
      ai_category: analysis.category,
      ai_priority: analysis.priority,
      sentiment: analysis.sentiment,
      subject_length: analysis.subject.length,
      created_customer: createdCustomerFromPublicIntake,
    },
  });

  await updateInboundEvent(supabaseAdmin, inboundEventId, {
    status: "processed",
    customer_id: customer.id,
    inquiry_id: createdInquiryId,
    error_message: null,
    processed_at: new Date().toISOString(),
  });

  const acknowledgement = await sendAutomaticAcknowledgement(supabaseAdmin, {
    company,
    inquiryId: createdInquiryId,
    customer,
    channel: sourceChannel,
    subject: analysis.subject,
  });

  return NextResponse.json(
    {
      ok: true,
      inquiryId: createdInquiryId,
      conversationToken: conversationToken || undefined,
      message:
        acknowledgement.status === "sent"
          ? acknowledgement.body
          : "Mensaje recibido correctamente.",
    },
    { status: 201 },
  );
}
