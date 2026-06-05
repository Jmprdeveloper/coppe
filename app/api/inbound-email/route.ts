import { NextResponse } from "next/server";

import { getCustomerDatabaseErrorMessage } from "../../../lib/customerValidation";
import { isValidEmail } from "../../../lib/customerValidation";
import { MAX_ANALYSIS_MESSAGE_LENGTH } from "../../../lib/inquiryAnalysisLimits";
import { analyzeInquiryForCompany } from "../../../lib/inquiryAnalysisService";
import { createAdminClient } from "../../../lib/supabase/admin";

type InboundEmailRequestBody = {
  inboundEmailAddress?: string;
  externalMessageId?: string;
  fromName?: string;
  fromEmail?: string;
  subject?: string;
  textBody?: string;
};

type InboundEmailChannelRow = {
  id: string;
  company_id: string;
  inbound_email_address: string;
  local_part: string;
  enabled: boolean;
};

type InboundEmailCompany = {
  id: string;
  name: string;
  sector: string;
  description: string | null;
  tone: string | null;
  language: string | null;
};

type InboundEmailAnalysis = Awaited<ReturnType<typeof analyzeInquiryForCompany>>;

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
  status: string;
  customer_id: string | null;
  inquiry_id: string | null;
};

const MAX_INBOUND_EMAIL_ADDRESS_LENGTH = 254;
const MAX_EXTERNAL_MESSAGE_ID_LENGTH = 255;
const MAX_FROM_NAME_LENGTH = 120;
const MAX_FROM_EMAIL_LENGTH = 254;
const MAX_SUBJECT_LENGTH = 200;

function getStringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getEmailWebhookSecret() {
  return process.env.INBOUND_EMAIL_WEBHOOK_SECRET?.trim() ?? "";
}

function getBearerToken(request: Request) {
  const authorizationHeader = request.headers.get("authorization") ?? "";

  if (!authorizationHeader.toLowerCase().startsWith("bearer ")) {
    return "";
  }

  return authorizationHeader.slice(7).trim();
}

function isAuthorizedInboundEmailRequest(request: Request) {
  const expectedSecret = getEmailWebhookSecret();

  if (!expectedSecret) {
    return false;
  }

  const headerSecret =
    request.headers.get("x-coppe-inbound-email-secret")?.trim() ?? "";
  const bearerToken = getBearerToken(request);

  return headerSecret === expectedSecret || bearerToken === expectedSecret;
}

function buildFallbackSubject(subject: string, textBody: string) {
  if (subject) {
    return subject;
  }

  const firstLine = textBody
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) {
    return "Nuevo email recibido";
  }

  if (firstLine.length <= 80) {
    return firstLine;
  }

  return `${firstLine.slice(0, 77)}...`;
}

function buildMessageForAnalysis(subject: string, textBody: string) {
  if (!subject) {
    return textBody;
  }

  return `Asunto: ${subject}\n\nMensaje:\n${textBody}`;
}

function buildFallbackAnalysis(
  customerName: string,
  subject: string,
  textBody: string,
  company: InboundEmailCompany
): InboundEmailAnalysis {
  const language = company.language === "en" ? "en" : "es";
  const fallbackSubject = buildFallbackSubject(subject, textBody);

  return {
    language,
    category: "general_info",
    priority: "medium",
    summary: `${customerName} ha enviado un email a ${company.name}.`,
    intent: "Email recibido en el canal de entrada de la empresa.",
    missingInformation: [],
    recommendedAction:
      "Revisar el email y responder al cliente desde el canal adecuado.",
    suggestedResponse: `Hola ${customerName}, gracias por contactar con ${company.name}. Hemos recibido tu email y lo revisaremos lo antes posible.`,
    subject: fallbackSubject,
  };
}

function buildDuplicateResponse(inboundEvent: InboundEventRow) {
  return NextResponse.json(
    {
      ok: true,
      duplicate: true,
      inquiryId: inboundEvent.inquiry_id,
      message: "Email ya procesado anteriormente.",
    },
    { status: 200 }
  );
}

async function findInboundEmailChannel(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  inboundEmailAddress: string
) {
  const { data, error } = await supabaseAdmin
    .from("inbound_email_channels")
    .select("id, company_id, inbound_email_address, local_part, enabled")
    .eq("inbound_email_address", inboundEmailAddress.toLowerCase())
    .maybeSingle<InboundEmailChannelRow>();

  if (error) {
    throw new Error(
      `No se pudo cargar el canal de email entrante: ${
        error.message || "sin detalle del error"
      }`
    );
  }

  return data;
}

async function findInboundCompany(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  companyId: string
) {
  const { data, error } = await supabaseAdmin
    .from("companies")
    .select("id, name, sector, description, tone, language")
    .eq("id", companyId)
    .maybeSingle<InboundEmailCompany>();

  if (error) {
    throw new Error(
      `No se pudo cargar la empresa asociada al email entrante: ${
        error.message || "sin detalle del error"
      }`
    );
  }

  return data;
}

async function findDuplicateInboundEvent(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  companyId: string,
  externalMessageId: string
) {
  if (!externalMessageId) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("inbound_events")
    .select("id, status, customer_id, inquiry_id")
    .eq("company_id", companyId)
    .eq("source_channel", "Email")
    .eq("external_message_id", externalMessageId)
    .maybeSingle<InboundEventRow>();

  if (error) {
    throw new Error(
      `No se pudo comprobar si el email ya fue procesado: ${
        error.message || "sin detalle del error"
      }`
    );
  }

  return data;
}

async function createInboundEvent(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  companyId: string,
  externalMessageId: string,
  rawPayload: Record<string, unknown>
) {
  const { data, error } = await supabaseAdmin
    .from("inbound_events")
    .insert({
      company_id: companyId,
      source_channel: "Email",
      external_message_id: externalMessageId || null,
      status: "received",
      raw_payload: rawPayload,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    throw new Error(
      `No se pudo registrar el email entrante: ${
        error?.message || "sin detalle del error"
      }`
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
  }
) {
  const { error } = await supabaseAdmin
    .from("inbound_events")
    .update(values)
    .eq("id", inboundEventId);

  if (error) {
    console.error("Could not update inbound email event:", error);
  }
}

async function buildFailedResponseAfterInboundEvent(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  inboundEventId: string,
  errorMessage: string,
  status: number,
  ids: {
    customerId?: string | null;
    inquiryId?: string | null;
  } = {}
) {
  await updateInboundEvent(supabaseAdmin, inboundEventId, {
    status: "failed",
    customer_id: ids.customerId ?? null,
    inquiry_id: ids.inquiryId ?? null,
    error_message: errorMessage,
    processed_at: new Date().toISOString(),
  });

  return NextResponse.json({ error: errorMessage }, { status });
}

async function findExistingCustomer(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  companyId: string,
  fromEmail: string
) {
  const { data, error } = await supabaseAdmin
    .from("customers")
    .select(
      "id, company_id, name, email, phone, language, status, last_interaction_at, created_at"
    )
    .eq("company_id", companyId)
    .eq("email", fromEmail)
    .limit(1)
    .maybeSingle<CustomerRow>();

  if (error) {
    throw new Error(
      `No se pudo comprobar si el cliente ya existe por email: ${
        error.message || "sin detalle del error"
      }`
    );
  }

  return data;
}

function getCustomerName(fromName: string, fromEmail: string) {
  if (fromName) {
    return fromName;
  }

  const localPart = fromEmail.split("@")[0]?.trim();

  return localPart || fromEmail;
}

export async function POST(request: Request) {
  if (!isAuthorizedInboundEmailRequest(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const supabaseAdmin = createAdminClient();

  let body: InboundEmailRequestBody;

  try {
    body = (await request.json()) as InboundEmailRequestBody;
  } catch {
    return NextResponse.json(
      { error: "El cuerpo de la petición no es válido." },
      { status: 400 }
    );
  }

  const inboundEmailAddress = getStringValue(
    body.inboundEmailAddress
  ).toLowerCase();
  const externalMessageId = getStringValue(body.externalMessageId);
  const fromName = getStringValue(body.fromName);
  const fromEmail = getStringValue(body.fromEmail).toLowerCase();
  const subject = getStringValue(body.subject);
  const textBody = getStringValue(body.textBody);
  const customerName = getCustomerName(fromName, fromEmail);
  const messageForAnalysis = buildMessageForAnalysis(subject, textBody);

  if (!inboundEmailAddress) {
    return NextResponse.json(
      { error: "La dirección de entrada es obligatoria." },
      { status: 400 }
    );
  }

  if (inboundEmailAddress.length > MAX_INBOUND_EMAIL_ADDRESS_LENGTH) {
    return NextResponse.json(
      {
        error: `La dirección de entrada no puede superar los ${MAX_INBOUND_EMAIL_ADDRESS_LENGTH} caracteres.`,
      },
      { status: 400 }
    );
  }

  if (!isValidEmail(inboundEmailAddress)) {
    return NextResponse.json(
      { error: "La dirección de entrada no tiene un formato válido." },
      { status: 400 }
    );
  }

  if (externalMessageId.length > MAX_EXTERNAL_MESSAGE_ID_LENGTH) {
    return NextResponse.json(
      {
        error: `El identificador externo no puede superar los ${MAX_EXTERNAL_MESSAGE_ID_LENGTH} caracteres.`,
      },
      { status: 400 }
    );
  }

  if (fromName.length > MAX_FROM_NAME_LENGTH) {
    return NextResponse.json(
      {
        error: `El nombre del remitente no puede superar los ${MAX_FROM_NAME_LENGTH} caracteres.`,
      },
      { status: 400 }
    );
  }

  if (!fromEmail) {
    return NextResponse.json(
      { error: "El email del remitente es obligatorio." },
      { status: 400 }
    );
  }

  if (fromEmail.length > MAX_FROM_EMAIL_LENGTH) {
    return NextResponse.json(
      {
        error: `El email del remitente no puede superar los ${MAX_FROM_EMAIL_LENGTH} caracteres.`,
      },
      { status: 400 }
    );
  }

  if (!isValidEmail(fromEmail)) {
    return NextResponse.json(
      { error: "El email del remitente no tiene un formato válido." },
      { status: 400 }
    );
  }

  if (subject.length > MAX_SUBJECT_LENGTH) {
    return NextResponse.json(
      { error: `El asunto no puede superar los ${MAX_SUBJECT_LENGTH} caracteres.` },
      { status: 400 }
    );
  }

  if (!textBody) {
    return NextResponse.json(
      { error: "El cuerpo del email es obligatorio." },
      { status: 400 }
    );
  }

  if (messageForAnalysis.length > MAX_ANALYSIS_MESSAGE_LENGTH) {
    return NextResponse.json(
      {
        error: `El email no puede superar los ${MAX_ANALYSIS_MESSAGE_LENGTH} caracteres incluyendo asunto y cuerpo.`,
      },
      { status: 400 }
    );
  }

  let inboundEmailChannel: InboundEmailChannelRow | null = null;

  try {
    inboundEmailChannel = await findInboundEmailChannel(
      supabaseAdmin,
      inboundEmailAddress
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo cargar el canal de email entrante.",
      },
      { status: 500 }
    );
  }

  if (!inboundEmailChannel) {
    return NextResponse.json(
      { error: "La dirección de email entrante no está configurada." },
      { status: 404 }
    );
  }

  if (!inboundEmailChannel.enabled) {
    return NextResponse.json(
      { error: "El canal de email entrante no está activo." },
      { status: 403 }
    );
  }

  let company: InboundEmailCompany | null = null;

  try {
    company = await findInboundCompany(
      supabaseAdmin,
      inboundEmailChannel.company_id
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo cargar la empresa asociada al email entrante.",
      },
      { status: 500 }
    );
  }

  if (!company) {
    return NextResponse.json(
      { error: "No se encontró la empresa asociada al email entrante." },
      { status: 404 }
    );
  }

  try {
    const duplicateInboundEvent = await findDuplicateInboundEvent(
      supabaseAdmin,
      company.id,
      externalMessageId
    );

    if (duplicateInboundEvent) {
      return buildDuplicateResponse(duplicateInboundEvent);
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo comprobar si el email ya fue procesado.",
      },
      { status: 500 }
    );
  }

  let inboundEventId: string;

  try {
    inboundEventId = await createInboundEvent(
      supabaseAdmin,
      company.id,
      externalMessageId,
      {
        inboundEmailAddress,
        externalMessageId,
        fromName,
        fromEmail,
        subject,
        textBody,
        sourceChannel: "Email",
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo registrar el email entrante.",
      },
      { status: 500 }
    );
  }

  const now = new Date().toISOString();

  let customer: CustomerRow | null = null;

  try {
    customer = await findExistingCustomer(supabaseAdmin, company.id, fromEmail);
  } catch (error) {
    return buildFailedResponseAfterInboundEvent(
      supabaseAdmin,
      inboundEventId,
      error instanceof Error
        ? error.message
        : "No se pudo comprobar si el cliente ya existe.",
      500
    );
  }

  if (customer) {
    const { data: updatedCustomer, error: updateCustomerError } =
      await supabaseAdmin
        .from("customers")
        .update({
          last_interaction_at: now,
        })
        .eq("id", customer.id)
        .select(
          "id, company_id, name, email, phone, language, status, last_interaction_at, created_at"
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
        { customerId: customer.id }
      );
    }

    customer = updatedCustomer;
  } else {
    const { data: createdCustomer, error: createCustomerError } =
      await supabaseAdmin
        .from("customers")
        .insert({
          company_id: company.id,
          name: customerName,
          email: fromEmail,
          phone: null,
          language: company.language ?? "es",
          status: "new",
          last_interaction_at: now,
        })
        .select(
          "id, company_id, name, email, phone, language, status, last_interaction_at, created_at"
        )
        .single<CustomerRow>();

    if (createCustomerError || !createdCustomer) {
      return buildFailedResponseAfterInboundEvent(
        supabaseAdmin,
        inboundEventId,
        `No se pudo crear el cliente: ${getCustomerDatabaseErrorMessage(
          createCustomerError?.message ?? ""
        )}`,
        500
      );
    }

    customer = createdCustomer;
  }

  let analysis = buildFallbackAnalysis(customerName, subject, textBody, company);

  try {
    analysis = await analyzeInquiryForCompany({
      customerName,
      message: messageForAnalysis,
      company,
    });
  } catch (error) {
    console.error("Inbound email analysis fallback used:", error);
  }

  const { data: createdInquiry, error: createInquiryError } =
    await supabaseAdmin
      .from("inquiries")
      .insert({
        company_id: company.id,
        customer_id: customer.id,
        customer_name: customer.name || customerName,
        source_channel: "Email",
        subject: subject || analysis.subject,
        original_message: textBody,
        ai_summary: analysis.summary,
        ai_intent: analysis.intent,
        ai_category: analysis.category,
        ai_priority: analysis.priority,
        ai_language: analysis.language,
        sentiment: "neutral",
        missing_information: analysis.missingInformation,
        recommended_action: analysis.recommendedAction,
        suggested_response: analysis.suggestedResponse,
        status: "new",
      })
      .select("id")
      .single<{ id: string }>();

  if (createInquiryError || !createdInquiry) {
    return buildFailedResponseAfterInboundEvent(
      supabaseAdmin,
      inboundEventId,
      `No se pudo crear el caso: ${
        createInquiryError?.message || "sin detalle del error"
      }`,
      500,
      { customerId: customer.id }
    );
  }

  const { error: createMessageError } = await supabaseAdmin
    .from("inquiry_messages")
    .insert({
      company_id: company.id,
      inquiry_id: createdInquiry.id,
      customer_id: customer.id,
      direction: "inbound",
      author_type: "customer",
      body: textBody,
      source_channel: "Email",
    });

  if (createMessageError) {
    return buildFailedResponseAfterInboundEvent(
      supabaseAdmin,
      inboundEventId,
      `El caso se creó, pero no se pudo guardar el mensaje inicial: ${
        createMessageError.message || "sin detalle del error"
      }`,
      500,
      {
        customerId: customer.id,
        inquiryId: createdInquiry.id,
      }
    );
  }

  await updateInboundEvent(supabaseAdmin, inboundEventId, {
    status: "processed",
    customer_id: customer.id,
    inquiry_id: createdInquiry.id,
    error_message: null,
    processed_at: new Date().toISOString(),
  });

  return NextResponse.json(
    {
      ok: true,
      inquiryId: createdInquiry.id,
      message: "Email recibido correctamente.",
    },
    { status: 201 }
  );
}
