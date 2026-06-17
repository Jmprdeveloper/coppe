import { getCustomerDatabaseErrorMessage } from "./customerValidation";
import { isValidEmail } from "./customerValidation";
import { inferSentiment } from "./inquiryAnalysis";
import { MAX_ANALYSIS_MESSAGE_LENGTH } from "./inquiryAnalysisLimits";
import { analyzeInquiryForCompany } from "./inquiryAnalysisService";
import { createAdminClient } from "./supabase/admin";

export type InboundEmailRequestBody = {
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

type OutboundEmailReplyRow = {
  id: string;
  company_id: string;
  inquiry_id: string;
  customer_id: string | null;
  from_address: string | null;
  to_address: string | null;
  reply_token: string | null;
};

type InquiryForEmailReplyRow = {
  id: string;
  company_id: string;
  customer_id: string | null;
  status: string;
};

type InquiryMessageRow = {
  id: string;
  direction: string;
  author_type: string;
  body: string;
  source_channel: string | null;
  created_at: string;
};

export type InboundEmailProcessingResult =
  | {
      ok: true;
      status: number;
      duplicate?: boolean;
      inquiryId: string | null;
      message: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

const MAX_INBOUND_EMAIL_ADDRESS_LENGTH = 254;
const MAX_EXTERNAL_MESSAGE_ID_LENGTH = 255;
const MAX_FROM_NAME_LENGTH = 120;
const MAX_FROM_EMAIL_LENGTH = 254;
const MAX_SUBJECT_LENGTH = 200;
const GENERIC_INBOUND_EMAIL_ERROR_MESSAGE =
  "No se pudo procesar el email entrante.";

function getStringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildErrorResult(
  error: string,
  status: number
): InboundEmailProcessingResult {
  return {
    ok: false,
    status,
    error,
  };
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
  const sentiment = inferSentiment(
    "general_info",
    buildMessageForAnalysis(subject, textBody)
  );

  return {
    language,
    category: "general_info",
    priority: "medium",
    sentiment,
    summary: `${customerName} ha enviado un email a ${company.name}.`,
    intent: "Email recibido en el canal de entrada de la empresa.",
    missingInformation: [],
    recommendedAction:
      "Revisar el email y responder al cliente desde el canal adecuado.",
    suggestedResponse: `Hola ${customerName}, gracias por contactar con ${company.name}. Hemos recibido tu email y lo revisaremos lo antes posible.`,
    subject: fallbackSubject,
  };
}

function buildDuplicateResult(
  inboundEvent: InboundEventRow
): InboundEmailProcessingResult {
  return {
    ok: true,
    status: 200,
    duplicate: true,
    inquiryId: inboundEvent.inquiry_id,
    message: "Email ya procesado anteriormente.",
  };
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

async function buildFailedResultAfterInboundEvent(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  inboundEventId: string,
  errorMessage: string,
  status: number,
  ids: {
    customerId?: string | null;
    inquiryId?: string | null;
  } = {}
): Promise<InboundEmailProcessingResult> {
  await updateInboundEvent(supabaseAdmin, inboundEventId, {
    status: "failed",
    customer_id: ids.customerId ?? null,
    inquiry_id: ids.inquiryId ?? null,
    error_message: errorMessage,
    processed_at: new Date().toISOString(),
  });

  return buildErrorResult(
    status >= 500 ? GENERIC_INBOUND_EMAIL_ERROR_MESSAGE : errorMessage,
    status
  );
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


function getEmailLocalPart(emailAddress: string) {
  return emailAddress.split("@")[0]?.trim().toLowerCase() ?? "";
}

function getReplyTokenFromInboundEmailAddress(inboundEmailAddress: string) {
  const localPart = getEmailLocalPart(inboundEmailAddress);
  const replyTokenMatch = localPart.match(/^reply-([a-f0-9]{32})$/i);

  return replyTokenMatch?.[1]?.toLowerCase() ?? "";
}

function stripQuotedEmailText(textBody: string) {
  const lines = textBody.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const keptLines: string[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith(">")) {
      break;
    }

    if (/^On .+ wrote:$/i.test(trimmedLine)) {
      break;
    }

    if (/^El\s+(lun|mar|mi[ée]|jue|vie|s[áa]b|dom)\.?[,]?\s+.+\s+a\s+las\s+.+/i.test(trimmedLine)) {
      break;
    }

    if (/^El\s+.+\s+escribi[oó]:$/i.test(trimmedLine)) {
      break;
    }

    if (/^-{2,}\s*Original Message\s*-{2,}$/i.test(trimmedLine)) {
      break;
    }

    if (/^De:\s+/i.test(trimmedLine) || /^From:\s+/i.test(trimmedLine)) {
      break;
    }

    keptLines.push(line);
  }

  return keptLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function findOutboundEmailReplyByToken(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  replyToken: string
) {
  const { data, error } = await supabaseAdmin
    .from("outbound_messages")
    .select(
      "id, company_id, inquiry_id, customer_id, from_address, to_address, reply_token"
    )
    .eq("channel", "email")
    .eq("provider", "resend")
    .eq("reply_token", replyToken)
    .maybeSingle<OutboundEmailReplyRow>();

  if (error) {
    throw new Error(
      `No se pudo cargar el email saliente asociado a la respuesta: ${
        error.message || "sin detalle del error"
      }`
    );
  }

  return data;
}

async function findInquiryForEmailReply(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  inquiryId: string
) {
  const { data, error } = await supabaseAdmin
    .from("inquiries")
    .select("id, company_id, customer_id, status")
    .eq("id", inquiryId)
    .maybeSingle<InquiryForEmailReplyRow>();

  if (error) {
    throw new Error(
      `No se pudo cargar el caso asociado a la respuesta: ${
        error.message || "sin detalle del error"
      }`
    );
  }

  return data;
}

async function findCustomerById(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  companyId: string,
  customerId: string
) {
  const { data, error } = await supabaseAdmin
    .from("customers")
    .select(
      "id, company_id, name, email, phone, language, status, last_interaction_at, created_at"
    )
    .eq("company_id", companyId)
    .eq("id", customerId)
    .maybeSingle<CustomerRow>();

  if (error) {
    throw new Error(
      `No se pudo cargar el cliente asociado a la respuesta: ${
        error.message || "sin detalle del error"
      }`
    );
  }

  return data;
}

function getNextStatusForEmailReply(currentStatus: string) {
  if (currentStatus === "new" || currentStatus === "pending") {
    return currentStatus;
  }

  return "pending";
}

function getMessageAnalysisAuthorLabel(message: InquiryMessageRow) {
  if (message.author_type === "customer") {
    return "Cliente";
  }

  if (message.author_type === "company") {
    return "Empresa";
  }

  if (message.author_type === "ai") {
    return "COPPE";
  }

  return "Mensaje";
}

function getMessageAnalysisDirectionLabel(message: InquiryMessageRow) {
  if (message.direction === "inbound") {
    return "recibido";
  }

  if (message.direction === "outbound") {
    return "enviado";
  }

  return "registrado";
}

function buildEmailReplyAnalysisContext(
  subject: string,
  messages: InquiryMessageRow[],
  latestReplyBody: string
) {
  const subjectBlock = subject.trim() ? `Asunto del hilo:\n${subject.trim()}` : "";
  const messageBlocks = messages
    .filter((message) => message.body.trim())
    .map((message) => {
      const authorLabel = getMessageAnalysisAuthorLabel(message);
      const directionLabel = getMessageAnalysisDirectionLabel(message);

      return `${authorLabel} (${directionLabel}):\n${message.body.trim()}`;
    });

  for (let startIndex = 0; startIndex < messageBlocks.length; startIndex += 1) {
    const candidate = [
      subjectBlock,
      "Historial reciente del caso:",
      messageBlocks.slice(startIndex).join("\n\n"),
    ]
      .filter(Boolean)
      .join("\n\n")
      .trim();

    if (candidate.length <= MAX_ANALYSIS_MESSAGE_LENGTH) {
      return candidate;
    }
  }

  const fallbackContext = [subjectBlock, `Cliente (recibido):\n${latestReplyBody}`]
    .filter(Boolean)
    .join("\n\n")
    .trim();

  if (fallbackContext.length <= MAX_ANALYSIS_MESSAGE_LENGTH) {
    return fallbackContext;
  }

  return latestReplyBody.slice(0, MAX_ANALYSIS_MESSAGE_LENGTH);
}

async function findInquiryMessagesForAnalysis(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  inquiryId: string
) {
  const { data, error } = await supabaseAdmin
    .from("inquiry_messages")
    .select("id, direction, author_type, body, source_channel, created_at")
    .eq("inquiry_id", inquiryId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(
      `No se pudieron cargar los mensajes del caso para reanalizarlo: ${
        error.message || "sin detalle del error"
      }`
    );
  }

  return (data ?? []) as InquiryMessageRow[];
}

function buildInquiryUpdateValuesForEmailReply(
  status: string,
  analysis: InboundEmailAnalysis | null
) {
  const updateValues: Record<string, unknown> = {
    status,
  };

  if (!analysis) {
    return updateValues;
  }

  return {
    ...updateValues,
    ai_summary: analysis.summary,
    ai_intent: analysis.intent,
    ai_category: analysis.category,
    ai_priority: analysis.priority,
    ai_language: analysis.language,
    sentiment: analysis.sentiment,
    missing_information: analysis.missingInformation,
    recommended_action: analysis.recommendedAction,
    suggested_response: analysis.suggestedResponse,
  };
}

async function processInboundEmailReply(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  values: {
    replyToken: string;
    inboundEmailAddress: string;
    externalMessageId: string;
    fromName: string;
    fromEmail: string;
    subject: string;
    textBody: string;
  }
): Promise<InboundEmailProcessingResult> {
  let outboundEmailReply: OutboundEmailReplyRow | null = null;

  try {
    outboundEmailReply = await findOutboundEmailReplyByToken(
      supabaseAdmin,
      values.replyToken
    );
  } catch (error) {
    console.error("Could not load outbound email reply token:", error);

    return buildErrorResult(GENERIC_INBOUND_EMAIL_ERROR_MESSAGE, 500);
  }

  if (!outboundEmailReply) {
    return buildErrorResult(
      "No se encontró el caso asociado a esta respuesta por email.",
      404
    );
  }

  let company: InboundEmailCompany | null = null;

  try {
    company = await findInboundCompany(
      supabaseAdmin,
      outboundEmailReply.company_id
    );
  } catch (error) {
    console.error("Could not load inbound email reply company:", error);

    return buildErrorResult(GENERIC_INBOUND_EMAIL_ERROR_MESSAGE, 500);
  }

  if (!company) {
    return buildErrorResult(
      "No se encontró la empresa asociada a esta respuesta por email.",
      404
    );
  }

  const originalFromAddress =
    outboundEmailReply.from_address?.trim().toLowerCase() ?? "";

  if (!originalFromAddress) {
    return buildErrorResult(
      "El email saliente original no tiene una dirección de respuesta válida.",
      400
    );
  }

  let originalEmailChannel: InboundEmailChannelRow | null = null;

  try {
    originalEmailChannel = await findInboundEmailChannel(
      supabaseAdmin,
      originalFromAddress
    );
  } catch (error) {
    console.error("Could not load original inbound email channel:", error);

    return buildErrorResult(GENERIC_INBOUND_EMAIL_ERROR_MESSAGE, 500);
  }

  if (!originalEmailChannel || originalEmailChannel.company_id !== company.id) {
    return buildErrorResult(
      "No se encontró el canal de email asociado al envío original.",
      404
    );
  }

  if (!originalEmailChannel.enabled) {
    return buildErrorResult(
      "El canal de email asociado al envío original no está activo.",
      403
    );
  }

  try {
    const duplicateInboundEvent = await findDuplicateInboundEvent(
      supabaseAdmin,
      company.id,
      values.externalMessageId
    );

    if (duplicateInboundEvent) {
      return buildDuplicateResult(duplicateInboundEvent);
    }
  } catch (error) {
    console.error("Could not check duplicate inbound email reply event:", error);

    return buildErrorResult(GENERIC_INBOUND_EMAIL_ERROR_MESSAGE, 500);
  }

  let inboundEventId: string;

  try {
    inboundEventId = await createInboundEvent(
      supabaseAdmin,
      company.id,
      values.externalMessageId,
      {
        inboundEmailAddress: values.inboundEmailAddress,
        externalMessageId: values.externalMessageId,
        fromName: values.fromName,
        fromEmail: values.fromEmail,
        subject: values.subject,
        textBody: values.textBody,
        replyToken: values.replyToken,
        outboundMessageId: outboundEmailReply.id,
        linkedInquiryId: outboundEmailReply.inquiry_id,
        sourceChannel: "Email",
      }
    );
  } catch (error) {
    console.error("Could not create inbound email reply event:", error);

    return buildErrorResult(GENERIC_INBOUND_EMAIL_ERROR_MESSAGE, 500);
  }

  const expectedFromEmail =
    outboundEmailReply.to_address?.trim().toLowerCase() ?? "";

  if (!expectedFromEmail || expectedFromEmail !== values.fromEmail) {
    return buildFailedResultAfterInboundEvent(
      supabaseAdmin,
      inboundEventId,
      "El remitente de la respuesta no coincide con el destinatario original del email saliente.",
      403
    );
  }

  let inquiry: InquiryForEmailReplyRow | null = null;

  try {
    inquiry = await findInquiryForEmailReply(
      supabaseAdmin,
      outboundEmailReply.inquiry_id
    );
  } catch (error) {
    return buildFailedResultAfterInboundEvent(
      supabaseAdmin,
      inboundEventId,
      error instanceof Error
        ? error.message
        : "No se pudo cargar el caso asociado a la respuesta.",
      500
    );
  }

  if (!inquiry || inquiry.company_id !== company.id) {
    return buildFailedResultAfterInboundEvent(
      supabaseAdmin,
      inboundEventId,
      "No se encontró el caso asociado a esta respuesta por email.",
      404
    );
  }

  let customer: CustomerRow | null = null;

  try {
    if (outboundEmailReply.customer_id) {
      customer = await findCustomerById(
        supabaseAdmin,
        company.id,
        outboundEmailReply.customer_id
      );
    }

    if (!customer) {
      customer = await findExistingCustomer(
        supabaseAdmin,
        company.id,
        values.fromEmail
      );
    }
  } catch (error) {
    return buildFailedResultAfterInboundEvent(
      supabaseAdmin,
      inboundEventId,
      error instanceof Error
        ? error.message
        : "No se pudo cargar el cliente asociado a la respuesta.",
      500,
      { inquiryId: inquiry.id }
    );
  }

  if (!customer || customer.company_id !== company.id) {
    return buildFailedResultAfterInboundEvent(
      supabaseAdmin,
      inboundEventId,
      "No se encontró el cliente asociado a esta respuesta por email.",
      404,
      { inquiryId: inquiry.id }
    );
  }

  const cleanReplyBody =
    stripQuotedEmailText(values.textBody) || values.textBody.trim();

  if (!cleanReplyBody) {
    return buildFailedResultAfterInboundEvent(
      supabaseAdmin,
      inboundEventId,
      "El cuerpo limpio de la respuesta por email está vacío.",
      400,
      { customerId: customer.id, inquiryId: inquiry.id }
    );
  }

  if (cleanReplyBody.length > MAX_ANALYSIS_MESSAGE_LENGTH) {
    return buildFailedResultAfterInboundEvent(
      supabaseAdmin,
      inboundEventId,
      `La respuesta por email no puede superar los ${MAX_ANALYSIS_MESSAGE_LENGTH} caracteres después de limpiar el texto citado.`,
      400,
      { customerId: customer.id, inquiryId: inquiry.id }
    );
  }

  const now = new Date().toISOString();

  const { error: updateCustomerError } = await supabaseAdmin
    .from("customers")
    .update({
      last_interaction_at: now,
    })
    .eq("id", customer.id)
    .eq("company_id", company.id);

  if (updateCustomerError) {
    return buildFailedResultAfterInboundEvent(
      supabaseAdmin,
      inboundEventId,
      `No se pudo actualizar el cliente asociado a la respuesta: ${
        updateCustomerError.message || "sin detalle del error"
      }`,
      500,
      { customerId: customer.id, inquiryId: inquiry.id }
    );
  }

  const { data: createdMessage, error: createMessageError } =
    await supabaseAdmin
      .from("inquiry_messages")
      .insert({
        company_id: company.id,
        inquiry_id: inquiry.id,
        customer_id: customer.id,
        direction: "inbound",
        author_type: "customer",
        body: cleanReplyBody,
        source_channel: "Email",
      })
      .select("id, direction, author_type, body, source_channel, created_at")
      .single<InquiryMessageRow>();

  if (createMessageError || !createdMessage) {
    return buildFailedResultAfterInboundEvent(
      supabaseAdmin,
      inboundEventId,
      `No se pudo guardar la respuesta en el historial del caso: ${
        createMessageError?.message || "sin detalle del error"
      }`,
      500,
      { customerId: customer.id, inquiryId: inquiry.id }
    );
  }

  let analysis: InboundEmailAnalysis | null = null;

  try {
    const messagesForAnalysis = await findInquiryMessagesForAnalysis(
      supabaseAdmin,
      inquiry.id
    );
    const analysisContext = buildEmailReplyAnalysisContext(
      values.subject,
      messagesForAnalysis,
      cleanReplyBody
    );

    analysis = await analyzeInquiryForCompany({
      customerName: customer.name || getCustomerName(values.fromName, values.fromEmail),
      message: analysisContext,
      company,
    });
  } catch (error) {
    console.error("Inbound email reply analysis fallback used:", error);
  }

  const nextStatus = getNextStatusForEmailReply(inquiry.status);
  const inquiryUpdateValues = buildInquiryUpdateValuesForEmailReply(
    nextStatus,
    analysis
  );

  const { error: updateInquiryError } = await supabaseAdmin
    .from("inquiries")
    .update(inquiryUpdateValues)
    .eq("id", inquiry.id)
    .eq("company_id", company.id);

  if (updateInquiryError) {
    return buildFailedResultAfterInboundEvent(
      supabaseAdmin,
      inboundEventId,
      `La respuesta se guardó, pero no se pudo actualizar el estado del caso: ${
        updateInquiryError.message || "sin detalle del error"
      }`,
      500,
      { customerId: customer.id, inquiryId: inquiry.id }
    );
  }

  await updateInboundEvent(supabaseAdmin, inboundEventId, {
    status: "processed",
    customer_id: customer.id,
    inquiry_id: inquiry.id,
    error_message: null,
    processed_at: new Date().toISOString(),
  });

  return {
    ok: true,
    status: 200,
    inquiryId: inquiry.id,
    message: "Respuesta por email añadida al caso existente.",
  };
}

export async function processInboundEmail(
  body: InboundEmailRequestBody
): Promise<InboundEmailProcessingResult> {
  const supabaseAdmin = createAdminClient();

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
    return buildErrorResult("La dirección de entrada es obligatoria.", 400);
  }

  if (inboundEmailAddress.length > MAX_INBOUND_EMAIL_ADDRESS_LENGTH) {
    return buildErrorResult(
      `La dirección de entrada no puede superar los ${MAX_INBOUND_EMAIL_ADDRESS_LENGTH} caracteres.`,
      400
    );
  }

  if (!isValidEmail(inboundEmailAddress)) {
    return buildErrorResult(
      "La dirección de entrada no tiene un formato válido.",
      400
    );
  }

  if (externalMessageId.length > MAX_EXTERNAL_MESSAGE_ID_LENGTH) {
    return buildErrorResult(
      `El identificador externo no puede superar los ${MAX_EXTERNAL_MESSAGE_ID_LENGTH} caracteres.`,
      400
    );
  }

  if (fromName.length > MAX_FROM_NAME_LENGTH) {
    return buildErrorResult(
      `El nombre del remitente no puede superar los ${MAX_FROM_NAME_LENGTH} caracteres.`,
      400
    );
  }

  if (!fromEmail) {
    return buildErrorResult("El email del remitente es obligatorio.", 400);
  }

  if (fromEmail.length > MAX_FROM_EMAIL_LENGTH) {
    return buildErrorResult(
      `El email del remitente no puede superar los ${MAX_FROM_EMAIL_LENGTH} caracteres.`,
      400
    );
  }

  if (!isValidEmail(fromEmail)) {
    return buildErrorResult(
      "El email del remitente no tiene un formato válido.",
      400
    );
  }

  if (subject.length > MAX_SUBJECT_LENGTH) {
    return buildErrorResult(
      `El asunto no puede superar los ${MAX_SUBJECT_LENGTH} caracteres.`,
      400
    );
  }

  if (!textBody) {
    return buildErrorResult("El cuerpo del email es obligatorio.", 400);
  }

  const replyToken = getReplyTokenFromInboundEmailAddress(inboundEmailAddress);

  if (replyToken) {
    return processInboundEmailReply(supabaseAdmin, {
      replyToken,
      inboundEmailAddress,
      externalMessageId,
      fromName,
      fromEmail,
      subject,
      textBody,
    });
  }

  if (messageForAnalysis.length > MAX_ANALYSIS_MESSAGE_LENGTH) {
    return buildErrorResult(
      `El email no puede superar los ${MAX_ANALYSIS_MESSAGE_LENGTH} caracteres incluyendo asunto y cuerpo.`,
      400
    );
  }

  let inboundEmailChannel: InboundEmailChannelRow | null = null;

  try {
    inboundEmailChannel = await findInboundEmailChannel(
      supabaseAdmin,
      inboundEmailAddress
    );
  } catch (error) {
    console.error("Could not load inbound email channel:", error);

    return buildErrorResult(GENERIC_INBOUND_EMAIL_ERROR_MESSAGE, 500);
  }

  if (!inboundEmailChannel) {
    return buildErrorResult(
      "La dirección de email entrante no está configurada.",
      404
    );
  }

  if (!inboundEmailChannel.enabled) {
    return buildErrorResult("El canal de email entrante no está activo.", 403);
  }

  let company: InboundEmailCompany | null = null;

  try {
    company = await findInboundCompany(
      supabaseAdmin,
      inboundEmailChannel.company_id
    );
  } catch (error) {
    console.error("Could not load inbound email company:", error);

    return buildErrorResult(GENERIC_INBOUND_EMAIL_ERROR_MESSAGE, 500);
  }

  if (!company) {
    return buildErrorResult(
      "No se encontró la empresa asociada al email entrante.",
      404
    );
  }

  try {
    const duplicateInboundEvent = await findDuplicateInboundEvent(
      supabaseAdmin,
      company.id,
      externalMessageId
    );

    if (duplicateInboundEvent) {
      return buildDuplicateResult(duplicateInboundEvent);
    }
  } catch (error) {
    console.error("Could not check duplicate inbound email event:", error);

    return buildErrorResult(GENERIC_INBOUND_EMAIL_ERROR_MESSAGE, 500);
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
    console.error("Could not create inbound email event:", error);

    return buildErrorResult(GENERIC_INBOUND_EMAIL_ERROR_MESSAGE, 500);
  }

  const now = new Date().toISOString();

  let customer: CustomerRow | null = null;

  try {
    customer = await findExistingCustomer(supabaseAdmin, company.id, fromEmail);
  } catch (error) {
    return buildFailedResultAfterInboundEvent(
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
      return buildFailedResultAfterInboundEvent(
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
      return buildFailedResultAfterInboundEvent(
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

  const { data: createdInquiryIdFromRpc, error: createInquiryError } =
    await supabaseAdmin.rpc("create_inquiry_with_initial_message", {
      p_company_id: company.id,
      p_customer_id: customer.id,
      p_customer_name: customer.name || customerName,
      p_source_channel: "Email",
      p_subject: subject || analysis.subject,
      p_original_message: textBody,
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
    return buildFailedResultAfterInboundEvent(
      supabaseAdmin,
      inboundEventId,
      `No se pudo crear el caso con su mensaje inicial: ${
        createInquiryError?.message || "sin detalle del error"
      }`,
      500,
      { customerId: customer.id }
    );
  }

  const createdInquiryId = String(createdInquiryIdFromRpc);

  await updateInboundEvent(supabaseAdmin, inboundEventId, {
    status: "processed",
    customer_id: customer.id,
    inquiry_id: createdInquiryId,
    error_message: null,
    processed_at: new Date().toISOString(),
  });

  return {
    ok: true,
    status: 201,
    inquiryId: createdInquiryId,
    message: "Email recibido correctamente.",
  };
}
