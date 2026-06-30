import { getCustomerDatabaseErrorMessage } from "./customerValidation";
import { isValidEmail } from "./customerValidation";
import {
  claimInboundEvent,
  markInboundEventFailed,
} from "./inboundEventProcessing";
import { inferSentiment } from "./inquiryAnalysis";
import { MAX_ANALYSIS_MESSAGE_LENGTH } from "./inquiryAnalysisLimits";
import { analyzeInquiryForCompany } from "./inquiryAnalysisService";
import { sendAutomaticAcknowledgement } from "./automaticAcknowledgement";
import { screenAndQuarantineInboundMessage } from "./inboundMessageSafety";
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
  auto_acknowledgement_enabled: boolean;
  auto_acknowledgement_message: string | null;
  inbound_filter_enabled: boolean;
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
  subject: string | null;
  ai_category: string | null;
  ai_priority: string | null;
  sentiment: string | null;
  ai_language: string | null;
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
  inquiryId: string | null
): InboundEmailProcessingResult {
  return {
    ok: true,
    status: 200,
    duplicate: true,
    inquiryId,
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
    .select(
      "id, name, sector, description, tone, language, auto_acknowledgement_enabled, auto_acknowledgement_message, inbound_filter_enabled"
    )
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

async function buildFailedResultAfterInboundEvent(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  inboundEventId: string,
  processingToken: string,
  errorMessage: string,
  status: number,
  ids: {
    customerId?: string | null;
    inquiryId?: string | null;
  } = {}
): Promise<InboundEmailProcessingResult> {
  await markInboundEventFailed(
    supabaseAdmin,
    inboundEventId,
    processingToken,
    errorMessage,
    ids
  );

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
    .select(
      "id, company_id, customer_id, status, subject, ai_category, ai_priority, sentiment, ai_language"
    )
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
  latestReplyBody: string,
  currentCategory: string | null
) {
  const subjectBlock = subject.trim() ? `Asunto del hilo:
${subject.trim()}` : "";
  const currentCategoryBlock = currentCategory
    ? `Categoría actual del caso:
${currentCategory}`
    : "";
  const latestReplyBlock = `Último mensaje del cliente (información más reciente, máxima prioridad):
${latestReplyBody.trim()}`;
  const instructionBlock = [
    "Estás actualizando un caso existente de COPPE, no creando un caso nuevo.",
    "El último mensaje del cliente es información nueva dentro del mismo caso y tiene prioridad sobre el historial anterior.",
    "Actualiza resumen, intención, información faltante, acción recomendada y respuesta sugerida teniendo en cuenta especialmente el último mensaje.",
    "No repitas una respuesta anterior si el cliente ya ha aportado datos nuevos.",
    "No cambies la categoría principal del caso salvo que el último mensaje cambie explícitamente la necesidad principal.",
    "No clasifiques como presupuesto si el cliente no pide precio, coste, tarifa, presupuesto o propuesta económica.",
  ].join("\n");
  const messageBlocks = messages
    .filter((message) => message.body.trim())
    .map((message) => {
      const authorLabel = getMessageAnalysisAuthorLabel(message);
      const directionLabel = getMessageAnalysisDirectionLabel(message);

      return `${authorLabel} (${directionLabel}):\n${message.body.trim()}`;
    });

  for (let startIndex = 0; startIndex < messageBlocks.length; startIndex += 1) {
    const candidate = [
      instructionBlock,
      subjectBlock,
      currentCategoryBlock,
      latestReplyBlock,
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

  const fallbackContext = [
    instructionBlock,
    subjectBlock,
    currentCategoryBlock,
    latestReplyBlock,
  ]
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

function normalizeAnalysisLanguage(
  inquiry: InquiryForEmailReplyRow,
  analysis: InboundEmailAnalysis | null,
  company: InboundEmailCompany
) {
  if (analysis?.language === "en" || analysis?.language === "es") {
    return analysis.language;
  }

  if (inquiry.ai_language === "en" || inquiry.ai_language === "es") {
    return inquiry.ai_language;
  }

  return company.language === "en" ? "en" : "es";
}

function normalizeAnalysisSentiment(
  inquiry: InquiryForEmailReplyRow,
  analysis: InboundEmailAnalysis | null
) {
  if (inquiry.sentiment === "negative") {
    return "negative";
  }

  if (
    analysis?.sentiment === "positive" ||
    analysis?.sentiment === "neutral" ||
    analysis?.sentiment === "negative"
  ) {
    return analysis.sentiment;
  }

  if (
    inquiry.sentiment === "positive" ||
    inquiry.sentiment === "neutral" ||
    inquiry.sentiment === "negative"
  ) {
    return inquiry.sentiment;
  }

  return "neutral";
}

function normalizeAnalysisPriority(
  inquiry: InquiryForEmailReplyRow,
  analysis: InboundEmailAnalysis | null
) {
  if (inquiry.ai_priority === "high" || analysis?.priority === "high") {
    return "high";
  }

  if (inquiry.ai_priority === "medium" || analysis?.priority === "medium") {
    return "medium";
  }

  return "medium";
}

function getStableEmailReplyCategory(
  inquiry: InquiryForEmailReplyRow,
  analysis: InboundEmailAnalysis | null
) {
  return inquiry.ai_category || analysis?.category || "general_info";
}

function truncateForInternalText(value: string, maxLength: number) {
  const cleanValue = value.replace(/\s+/g, " ").trim();

  if (cleanValue.length <= maxLength) {
    return cleanValue;
  }

  return `${cleanValue.slice(0, maxLength - 3)}...`;
}

function hasSchedulePreferenceSignal(value: string) {
  const normalizedValue = value.toLowerCase();

  return [
    "hoy",
    "mañana",
    "manana",
    "tarde",
    "mañana por la tarde",
    "manana por la tarde",
    "por la mañana",
    "por la manana",
    "mediodía",
    "mediodia",
    "lunes",
    "martes",
    "miércoles",
    "miercoles",
    "jueves",
    "viernes",
    "sábado",
    "sabado",
    "domingo",
    "today",
    "tomorrow",
    "morning",
    "afternoon",
    "evening",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ].some((signal) => normalizedValue.includes(signal));
}

function isShortAcknowledgementReply(value: string) {
  const normalizedValue = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalizedValue) {
    return false;
  }

  const acknowledgementSignals = [
    "ok",
    "vale",
    "perfecto",
    "gracias",
    "muchas gracias",
    "de acuerdo",
    "quedo pendiente",
    "thanks",
    "thank you",
    "perfect",
  ];

  return (
    normalizedValue.length <= 80 &&
    acknowledgementSignals.some((signal) => normalizedValue.includes(signal))
  );
}

function buildThreadedEmailReplySummary(
  customerName: string,
  latestReplyBody: string,
  language: "es" | "en"
) {
  const preview = truncateForInternalText(latestReplyBody, 180);
  const hasSchedulePreference = hasSchedulePreferenceSignal(latestReplyBody);

  if (language === "en") {
    if (isShortAcknowledgementReply(latestReplyBody)) {
      return `${customerName} replied to the existing case and is waiting for the next steps.`;
    }

    if (hasSchedulePreference) {
      return `${customerName} replied to the existing case with new information and a date or time preference: ${preview}`;
    }

    return `${customerName} replied to the existing case with new information: ${preview}`;
  }

  if (isShortAcknowledgementReply(latestReplyBody)) {
    return `${customerName} ha respondido al caso existente y queda pendiente de los siguientes pasos.`;
  }

  if (hasSchedulePreference) {
    return `${customerName} ha respondido al caso existente aportando nueva información y una preferencia de fecha u horario: ${preview}`;
  }

  return `${customerName} ha respondido al caso existente aportando nueva información: ${preview}`;
}

function buildThreadedEmailReplyIntent(
  latestReplyBody: string,
  language: "es" | "en"
) {
  const hasSchedulePreference = hasSchedulePreferenceSignal(latestReplyBody);

  if (language === "en") {
    if (isShortAcknowledgementReply(latestReplyBody)) {
      return "Acknowledge the previous response and wait for next steps";
    }

    if (hasSchedulePreference) {
      return "Provide additional information and a date or time preference for the existing case";
    }

    return "Provide additional information for the existing case";
  }

  if (isShortAcknowledgementReply(latestReplyBody)) {
    return "Confirmar recepción de la respuesta anterior y quedar pendiente de los siguientes pasos";
  }

  if (hasSchedulePreference) {
    return "Aportar información adicional y una preferencia de fecha u horario al caso existente";
  }

  return "Aportar información adicional al caso existente";
}

function buildThreadedEmailReplyRecommendedAction(
  latestReplyBody: string,
  language: "es" | "en"
) {
  const hasSchedulePreference = hasSchedulePreferenceSignal(latestReplyBody);

  if (language === "en") {
    if (hasSchedulePreference) {
      return "Review the new information and internal availability before proposing a specific time to the customer.";
    }

    return "Review the new information provided by the customer and respond with the next steps.";
  }

  if (hasSchedulePreference) {
    return "Revisar la nueva información aportada y la disponibilidad interna antes de proponer una hora concreta al cliente.";
  }

  return "Revisar la nueva información aportada por el cliente y responder con los siguientes pasos.";
}

function buildThreadedEmailReplySuggestedResponse(
  customerName: string,
  latestReplyBody: string,
  language: "es" | "en"
) {
  const hasSchedulePreference = hasSchedulePreferenceSignal(latestReplyBody);
  const isAcknowledgement = isShortAcknowledgementReply(latestReplyBody);

  if (language === "en") {
    if (isAcknowledgement) {
      return `Hi ${customerName}, thank you for your reply. A member of our team will contact you as soon as possible.`;
    }

    if (hasSchedulePreference) {
      return `Hi ${customerName}, thank you for the information. We have received the new details and your date or time preference. A member of our team will contact you as soon as possible.`;
    }

    return `Hi ${customerName}, thank you for the information. We have received the new details. A member of our team will contact you as soon as possible.`;
  }

  if (isAcknowledgement) {
    return `Hola ${customerName}, gracias por tu respuesta. Una persona de nuestro equipo se pondrá en contacto contigo lo antes posible.`;
  }

  if (hasSchedulePreference) {
    return `Hola ${customerName}, gracias por la información. Hemos recibido los nuevos datos y tu preferencia de fecha u horario. Una persona de nuestro equipo se pondrá en contacto contigo lo antes posible.`;
  }

  return `Hola ${customerName}, gracias por la información. Hemos recibido los nuevos datos. Una persona de nuestro equipo se pondrá en contacto contigo lo antes posible.`;
}

function buildInquiryUpdateValuesForEmailReply(
  status: string,
  inquiry: InquiryForEmailReplyRow,
  analysis: InboundEmailAnalysis | null,
  customerName: string,
  company: InboundEmailCompany,
  latestReplyBody: string
) {
  const language = normalizeAnalysisLanguage(inquiry, analysis, company);

  return {
    status,
    ai_summary: buildThreadedEmailReplySummary(
      customerName,
      latestReplyBody,
      language
    ),
    ai_intent: buildThreadedEmailReplyIntent(latestReplyBody, language),
    ai_category: getStableEmailReplyCategory(inquiry, analysis),
    ai_priority: normalizeAnalysisPriority(inquiry, analysis),
    ai_language: language,
    sentiment: normalizeAnalysisSentiment(inquiry, analysis),
    missing_information: [],
    recommended_action: buildThreadedEmailReplyRecommendedAction(
      latestReplyBody,
      language
    ),
    suggested_response: buildThreadedEmailReplySuggestedResponse(
      customerName,
      latestReplyBody,
      language
    ),
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

  const expectedFromEmail =
    outboundEmailReply.to_address?.trim().toLowerCase() ?? "";

  if (!expectedFromEmail || expectedFromEmail !== values.fromEmail) {
    return buildErrorResult(
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
    return buildErrorResult(
      error instanceof Error
        ? error.message
        : "No se pudo cargar el caso asociado a la respuesta.",
      500
    );
  }

  if (!inquiry || inquiry.company_id !== company.id) {
    return buildErrorResult(
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
    return buildErrorResult(
      error instanceof Error
        ? error.message
        : "No se pudo cargar el cliente asociado a la respuesta.",
      500
    );
  }

  if (!customer || customer.company_id !== company.id) {
    return buildErrorResult(
      "No se encontró el cliente asociado a esta respuesta por email.",
      404
    );
  }

  const cleanReplyBody =
    stripQuotedEmailText(values.textBody) || values.textBody.trim();

  if (!cleanReplyBody) {
    return buildErrorResult(
      "El cuerpo limpio de la respuesta por email está vacío.",
      400
    );
  }

  if (cleanReplyBody.length > MAX_ANALYSIS_MESSAGE_LENGTH) {
    return buildErrorResult(
      `La respuesta por email no puede superar los ${MAX_ANALYSIS_MESSAGE_LENGTH} caracteres después de limpiar el texto citado.`,
      400
    );
  }

  let inboundEventId: string;
  let processingToken: string;

  try {
    const claim = await claimInboundEvent(supabaseAdmin, {
      companyId: company.id,
      sourceChannel: "Email",
      externalMessageId: values.externalMessageId,
      rawPayload: {
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
      },
    });

    if (claim.outcome === "processed") {
      return buildDuplicateResult(claim.inquiryId);
    }

    if (claim.outcome === "in_progress") {
      return buildErrorResult(GENERIC_INBOUND_EMAIL_ERROR_MESSAGE, 503);
    }

    inboundEventId = claim.eventId;
    processingToken = claim.processingToken;
  } catch (error) {
    console.error("Could not claim inbound email reply event:", error);

    return buildErrorResult(GENERIC_INBOUND_EMAIL_ERROR_MESSAGE, 500);
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
      cleanReplyBody,
      inquiry.ai_category
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
  const customerDisplayName =
    customer.name || getCustomerName(values.fromName, values.fromEmail);
  const inquiryUpdateValues = buildInquiryUpdateValuesForEmailReply(
    nextStatus,
    inquiry,
    analysis,
    customerDisplayName,
    company,
    cleanReplyBody
  );

  const { error: finalizeReplyError } = await supabaseAdmin.rpc(
    "finalize_inbound_email_reply",
    {
      p_inbound_event_id: inboundEventId,
      p_processing_token: processingToken,
      p_company_id: company.id,
      p_inquiry_id: inquiry.id,
      p_customer_id: customer.id,
      p_body: cleanReplyBody,
      p_status: inquiryUpdateValues.status,
      p_ai_summary: inquiryUpdateValues.ai_summary,
      p_ai_intent: inquiryUpdateValues.ai_intent,
      p_ai_category: inquiryUpdateValues.ai_category,
      p_ai_priority: inquiryUpdateValues.ai_priority,
      p_ai_language: inquiryUpdateValues.ai_language,
      p_sentiment: inquiryUpdateValues.sentiment,
      p_missing_information: inquiryUpdateValues.missing_information,
      p_recommended_action: inquiryUpdateValues.recommended_action,
      p_suggested_response: inquiryUpdateValues.suggested_response,
    }
  );

  if (finalizeReplyError) {
    return buildFailedResultAfterInboundEvent(
      supabaseAdmin,
      inboundEventId,
      processingToken,
      `No se pudo guardar la respuesta y actualizar el caso: ${
        finalizeReplyError.message || "sin detalle del error"
      }`,
      500,
      { customerId: customer.id, inquiryId: inquiry.id }
    );
  }

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

  if (!externalMessageId) {
    return buildErrorResult("El identificador externo es obligatorio.", 400);
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

  let inboundEventId: string;
  let processingToken: string;

  try {
    const claim = await claimInboundEvent(supabaseAdmin, {
      companyId: company.id,
      sourceChannel: "Email",
      externalMessageId,
      rawPayload: {
        inboundEmailAddress,
        externalMessageId,
        fromName,
        fromEmail,
        subject,
        textBody,
        sourceChannel: "Email",
      },
    });

    if (claim.outcome === "processed") {
      return buildDuplicateResult(claim.inquiryId);
    }

    if (claim.outcome === "in_progress") {
      return buildErrorResult(GENERIC_INBOUND_EMAIL_ERROR_MESSAGE, 503);
    }

    inboundEventId = claim.eventId;
    processingToken = claim.processingToken;
  } catch (error) {
    console.error("Could not claim inbound email event:", error);

    return buildErrorResult(GENERIC_INBOUND_EMAIL_ERROR_MESSAGE, 500);
  }

  try {
    const safetyDecision = await screenAndQuarantineInboundMessage(
      supabaseAdmin,
      {
        companyId: company.id,
        inboundEventId,
        processingToken,
        sourceChannel: "Email",
        senderName: fromName || customerName,
        senderEmail: fromEmail,
        senderKey: fromEmail,
        subject,
        body: textBody,
        filterEnabled: company.inbound_filter_enabled,
        applySenderRateLimit: true,
      }
    );

    if (safetyDecision.quarantined) {
      return {
        ok: true,
        status: 202,
        inquiryId: null,
        message: "Email recibido para revisión.",
      };
    }
  } catch (error) {
    return buildFailedResultAfterInboundEvent(
      supabaseAdmin,
      inboundEventId,
      processingToken,
      error instanceof Error
        ? error.message
        : "No se pudo comprobar la seguridad del email.",
      500
    );
  }

  const now = new Date().toISOString();

  let customer: CustomerRow | null = null;

  try {
    customer = await findExistingCustomer(supabaseAdmin, company.id, fromEmail);
  } catch (error) {
    return buildFailedResultAfterInboundEvent(
      supabaseAdmin,
      inboundEventId,
      processingToken,
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
        processingToken,
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
          status: "active",
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
        processingToken,
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
    await supabaseAdmin.rpc("create_inbound_inquiry_with_initial_message", {
      p_inbound_event_id: inboundEventId,
      p_processing_token: processingToken,
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
      processingToken,
      `No se pudo crear el caso con su mensaje inicial: ${
        createInquiryError?.message || "sin detalle del error"
      }`,
      500,
      { customerId: customer.id }
    );
  }

  const createdInquiryId = String(createdInquiryIdFromRpc);

  await sendAutomaticAcknowledgement(supabaseAdmin, {
    company,
    inquiryId: createdInquiryId,
    customer,
    channel: "Email",
    subject: subject || analysis.subject,
  });

  return {
    ok: true,
    status: 201,
    inquiryId: createdInquiryId,
    message: "Email recibido correctamente.",
  };
}
