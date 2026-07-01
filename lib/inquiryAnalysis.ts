import { type CurrentCompany } from "./currentCompany";
import {
  detectOutOfScopeRequest,
  extractLatestCustomerTurn,
  isGreetingOnlyMessage,
} from "./inquiryConversationSafety";
import { normalizeSearchText } from "./searchUtils";

export type MessageLanguage = "es" | "en";
export type InquirySentiment = "positive" | "neutral" | "negative";

type ResponseTone =
  | "profesional y cercano"
  | "formal"
  | "directo"
  | "amable y detallado";

type RequestPerspective = "internal" | "customer";

type CompanyContext = {
  name: string;
  sector: string;
  description: string;
  tone: ResponseTone;
  language: MessageLanguage;
};

function normalizeCompanyLanguage(
  value: string | null | undefined
): MessageLanguage {
  const normalizedValue = normalizeSearchText(value);

  if (
    normalizedValue === "en" ||
    normalizedValue === "english" ||
    normalizedValue === "ingles" ||
    normalizedValue === "inglés"
  ) {
    return "en";
  }

  return "es";
}

function normalizeResponseTone(
  value: string | null | undefined
): ResponseTone {
  const normalizedValue = normalizeSearchText(value);

  if (normalizedValue === "formal") {
    return "formal";
  }

  if (normalizedValue === "directo") {
    return "directo";
  }

  if (
    normalizedValue === "amable y detallado" ||
    normalizedValue === "amable detallado"
  ) {
    return "amable y detallado";
  }

  return "profesional y cercano";
}

function buildCompanyContext(company: CurrentCompany): CompanyContext {
  return {
    name: company.name?.trim() || "la empresa",
    sector: company.sector?.trim() || "servicios profesionales",
    description: company.description?.trim() || "",
    tone: normalizeResponseTone(company.tone),
    language: normalizeCompanyLanguage(company.language),
  };
}

function includesSignal(normalizedMessage: string, signal: string) {
  if (signal.length <= 3) {
    return new RegExp(`\\b${signal}\\b`).test(normalizedMessage);
  }

  return normalizedMessage.includes(signal);
}

export function detectLanguage(
  message: string,
  fallbackLanguage: string | null | undefined = "es"
): MessageLanguage {
  const normalizedMessage = normalizeSearchText(message);
  const normalizedFallbackLanguage = normalizeCompanyLanguage(fallbackLanguage);

  const englishSignals = [
    "hello",
    "hi",
    "booking",
    "check in",
    "check-in",
    "parking",
    "available",
    "availability",
    "flight",
    "arrive",
    "arrival",
    "reservation",
    "guest",
    "guests",
    "room",
    "price",
    "quote",
    "appointment",
    "cancel",
    "cancellation",
    "complaint",
    "problem",
    "thank you",
    "thanks",
  ];

  const spanishSignals = [
    "hola",
    "buenos dias",
    "buenas tardes",
    "buenas noches",
    "reserva",
    "disponibilidad",
    "aparcamiento",
    "parking",
    "llegada",
    "vuelo",
    "persona",
    "personas",
    "precio",
    "presupuesto",
    "cita",
    "cancelar",
    "cancelacion",
    "cancelación",
    "queja",
    "reclamacion",
    "reclamación",
    "problema",
    "gracias",
  ];

  const englishSignalCount = englishSignals.filter((signal) =>
    includesSignal(normalizedMessage, signal)
  ).length;

  const spanishSignalCount = spanishSignals.filter((signal) =>
    includesSignal(normalizedMessage, signal)
  ).length;

  if (englishSignalCount > spanishSignalCount) {
    return "en";
  }

  if (spanishSignalCount > englishSignalCount) {
    return "es";
  }

  return normalizedFallbackLanguage;
}

function hasAdministrativeChangeRequest(normalizedMessage: string) {
  const hasAnySignal = (signals: string[]) =>
    signals.some((signal) => normalizedMessage.includes(signal));

  const explicitCancellationSignal = hasAnySignal([
    "cancel",
    "cancelar",
    "cancelacion",
    "cancelación",
    "anular",
    "anulacion",
    "anulación",
    "dar de baja",
    "devolucion",
    "devolución",
    "return",
    "refund",
  ]);

  if (explicitCancellationSignal) {
    return true;
  }

  const administrativeChangePhrases = [
    "cambiar cita",
    "cambiar la cita",
    "cambiar una cita",
    "cambiar mi cita",
    "cambiar el turno",
    "cambiar turno",
    "cambiar la reserva",
    "cambiar reserva",
    "cambiar mi reserva",
    "cambiar el pedido",
    "cambiar pedido",
    "cambiar mi pedido",
    "cambiar la solicitud",
    "cambiar solicitud",
    "cambiar mi solicitud",
    "cambiar la fecha",
    "cambiar fecha",
    "cambiar la hora",
    "cambiar hora",
    "cambiar la reunion",
    "cambiar reunion",
    "cambiar la reunión",
    "cambiar reunión",
    "cambiar la direccion de envio",
    "cambiar direccion de envio",
    "cambiar la dirección de envío",
    "cambiar dirección de envío",
    "cambiar los datos",
    "cambiar datos",
    "modificar cita",
    "modificar la cita",
    "modificar una cita",
    "modificar mi cita",
    "modificar reserva",
    "modificar la reserva",
    "modificar pedido",
    "modificar el pedido",
    "modificar solicitud",
    "modificar la solicitud",
    "modificar fecha",
    "modificar la fecha",
    "modificar hora",
    "modificar la hora",
    "modificar turno",
    "modificar el turno",
    "modificar datos",
    "modificar los datos",
    "aplazar cita",
    "aplazar la cita",
    "aplazar reserva",
    "aplazar la reserva",
    "aplazar reunion",
    "aplazar reunión",
    "reprogramar cita",
    "reprogramar la cita",
    "reprogramar reserva",
    "reprogramar la reserva",
    "reprogramar reunion",
    "reprogramar reunión",
    "change appointment",
    "change my appointment",
    "change booking",
    "change my booking",
    "change reservation",
    "change my reservation",
    "change order",
    "change my order",
    "change request",
    "change my request",
    "change date",
    "change the date",
    "change time",
    "change the time",
    "change meeting",
    "change my meeting",
    "modify appointment",
    "modify booking",
    "modify reservation",
    "modify order",
    "modify request",
    "reschedule appointment",
    "reschedule booking",
    "reschedule reservation",
    "reschedule meeting",
  ];

  return administrativeChangePhrases.some((phrase) =>
    normalizedMessage.includes(phrase)
  );
}

export function inferCategory(message: string) {
  const normalizedMessage = normalizeSearchText(message);

  const hasAnySignal = (signals: string[]) =>
    signals.some((signal) => normalizedMessage.includes(signal));

  if (
    hasAnySignal([
      "factura",
      "facturacion",
      "facturación",
      "pago",
      "cobro",
      "recibo",
      "invoice",
      "payment",
      "billing",
      "charge",
      "receipt",
    ])
  ) {
    return "billing_or_payment";
  }

  if (
    hasAnySignal([
      "seguimiento",
      "estado de mi solicitud",
      "estado del pedido",
      "sigo esperando",
      "follow up",
      "following up",
      "status update",
      "any update",
    ])
  ) {
    return "follow_up";
  }

  if (
    hasAnySignal([
      "presupuesto",
      "precio",
      "tarifa",
      "coste",
      "cotizacion",
      "cotización",
      "quote",
      "budget",
      "estimate",
      "price",
      "cost",
      "proposal",
    ])
  ) {
    return "quote_request";
  }

  if (hasAdministrativeChangeRequest(normalizedMessage)) {
    return "change_or_cancellation";
  }

  if (
    hasAnySignal([
      "queja",
      "reclamacion",
      "reclamación",
      "incidencia",
      "problema",
      "averia",
      "avería",
      "error",
      "no funciona",
      "complaint",
      "problem",
      "issue",
      "incident",
      "broken",
    ])
  ) {
    return "complaint_or_incident";
  }

  if (
    hasAnySignal([
      "cita",
      "reunion",
      "reunión",
      "llamada",
      "visita",
      "appointment",
      "meeting",
      "call",
    ])
  ) {
    return "appointment_request";
  }

  if (
    hasAnySignal([
      "mirar",
      "mireis",
      "miréis",
      "verlo",
      "verla",
      "verme",
      "llevarlo",
      "llevarla",
      "traerlo",
      "traerla",
      "revisar",
      "revision",
      "revisión",
      "valorar",
      "evaluar",
      "reparar",
      "arreglar",
      "instalar",
      "tramitar",
      "gestionar",
      "intervenir",
      "mantenimiento",
      "sustituir",
      "sustitucion",
      "sustitución",
      "reemplazar",
      "check it",
      "take a look",
      "review",
      "assess",
      "evaluate",
      "repair",
      "fix",
      "install",
      "process",
      "handle",
      "service request",
      "maintenance",
      "replace",
    ])
  ) {
    return "service_request";
  }

  if (
    hasAnySignal([
      "ayuda",
      "soporte",
      "asistencia",
      "consulta tecnica",
      "consulta técnica",
      "no puedo acceder",
      "acceso",
      "support",
      "help",
      "technical",
      "login",
      "access",
    ])
  ) {
    return "support_request";
  }

  if (
    hasAnySignal([
      "pedido",
      "orden",
      "compra",
      "contratar",
      "contratacion",
      "contratación",
      "reserva",
      "inscripcion",
      "inscripción",
      "plaza",
      "disponibilidad",
      "stock",
      "order",
      "purchase",
      "booking",
      "reservation",
      "availability",
      "sign up",
      "enroll",
    ])
  ) {
    return "order_or_reservation";
  }

  if (
    hasAnySignal([
      "producto",
      "servicio",
      "informacion sobre",
      "información sobre",
      "caracteristicas",
      "características",
      "reparar",
      "arreglar",
      "instalar",
      "mantenimiento",
      "revision",
      "revisión",
      "cambio de",
      "cambiar el",
      "cambiar la",
      "cambiar los",
      "cambiar las",
      "sustituir",
      "sustitucion",
      "sustitución",
      "reemplazar",
      "reemplazo",
      "product",
      "service",
      "details",
      "features",
      "repair",
      "replace",
      "install",
      "installation",
      "maintenance",
    ])
  ) {
    return "product_service_inquiry";
  }

  return "general_info";
}

export function inferPriority(category: string, message: string) {
  const normalizedMessage = normalizeSearchText(message);

  if (
    category === "change_or_cancellation" ||
    category === "complaint_or_incident" ||
    normalizedMessage.includes("urgente") ||
    normalizedMessage.includes("urgent") ||
    normalizedMessage.includes("hoy") ||
    normalizedMessage.includes("today") ||
    normalizedMessage.includes("mañana") ||
    normalizedMessage.includes("tomorrow")
  ) {
    return "high";
  }

  return "medium";
}

export function inferSentiment(
  category: string,
  message: string
): InquirySentiment {
  const normalizedMessage = normalizeSearchText(message);

  const hasAnySignal = (signals: string[]) =>
    signals.some((signal) => normalizedMessage.includes(signal));

  const negativeSignals = [
    "enfadado",
    "enfadada",
    "molesto",
    "molesta",
    "indignado",
    "indignada",
    "inaceptable",
    "vergonzoso",
    "vergüenza",
    "fatal",
    "horrible",
    "mal servicio",
    "muy mal",
    "no funciona",
    "no me responde",
    "nadie responde",
    "sigo esperando",
    "reclamacion",
    "reclamación",
    "queja",
    "problema",
    "incidencia",
    "averia",
    "avería",
    "urgente",
    "decepcionado",
    "decepcionada",
    "angry",
    "upset",
    "unacceptable",
    "terrible",
    "awful",
    "very bad",
    "bad service",
    "not working",
    "nobody replies",
    "still waiting",
    "complaint",
    "problem",
    "issue",
    "urgent",
    "disappointed",
  ];

  const positiveSignals = [
    "gracias",
    "muchas gracias",
    "perfecto",
    "genial",
    "excelente",
    "muy bien",
    "estupendo",
    "contento",
    "contenta",
    "satisfecho",
    "satisfecha",
    "amable",
    "thank you",
    "thanks",
    "perfect",
    "great",
    "excellent",
    "very good",
    "happy",
    "satisfied",
    "kind",
  ];

  if (category === "complaint_or_incident" || hasAnySignal(negativeSignals)) {
    return "negative";
  }

  if (hasAnySignal(positiveSignals)) {
    return "positive";
  }

  return "neutral";
}

function extractRequestPurposeByLanguage(
  originalMessage: string,
  language: MessageLanguage,
  perspective: RequestPerspective = "internal"
) {
  const requestPurpose =
    language === "en"
      ? extractEnglishRequestPurpose(originalMessage)
      : extractSpanishRequestPurpose(originalMessage);

  return normalizeRequestPurposePerspective(
    requestPurpose,
    language,
    perspective
  );
}

export function buildSummary(
  customerName: string,
  message: string,
  category: string,
  company: CurrentCompany
) {
  const cleanMessage = message.trim();
  const companyContext = buildCompanyContext(company);
  const language = detectLanguage(message, company.language);
  const requestPurpose = extractRequestPurposeByLanguage(message, language);
  const sectorContext = companyContext.sector
    ? ` en el sector ${companyContext.sector}`
    : "";

  if (category === "change_or_cancellation") {
    return `${customerName} solicita cambiar o cancelar una solicitud, pedido, cita, reserva o servicio${sectorContext}.`;
  }

  if (category === "order_or_reservation") {
    return `${customerName} plantea un caso relacionado con pedido, reserva, contratación, inscripción o disponibilidad${sectorContext}.`;
  }

  if (category === "complaint_or_incident") {
    return `${customerName} comunica una queja o incidencia que requiere revisión por parte de ${companyContext.name}.`;
  }

  if (category === "quote_request") {
    return `${customerName} solicita información de precio, tarifa o presupuesto para un producto o servicio de ${companyContext.name}.`;
  }

  if (category === "appointment_request") {
    if (requestPurpose) {
      return `${customerName} solicita una cita para ${requestPurpose} con ${companyContext.name}.`;
    }

    return `${customerName} solicita una cita con ${companyContext.name}.`;
  }

  if (category === "service_request") {
    if (requestPurpose) {
      return `${customerName} solicita que ${companyContext.name} revise o atienda ${requestPurpose}.`;
    }

    return `${customerName} solicita una revisión, intervención o prestación de servicio por parte de ${companyContext.name}.`;
  }

  if (category === "product_service_inquiry") {
    if (requestPurpose) {
      return `${customerName} solicita información o ayuda sobre ${requestPurpose} a ${companyContext.name}.`;
    }

    return `${customerName} solicita información sobre un producto o servicio de ${companyContext.name}.`;
  }

  if (category === "support_request") {
    return `${customerName} solicita soporte o ayuda relacionada con un producto, servicio o proceso de ${companyContext.name}.`;
  }

  if (category === "billing_or_payment") {
    return `${customerName} plantea un caso relacionado con facturación, pagos, cobros o recibos.`;
  }

  if (category === "follow_up") {
    return `${customerName} solicita seguimiento o actualización sobre una gestión previa.`;
  }

  if (companyContext.description) {
    return `${customerName} envía un mensaje para ${companyContext.name}, empresa de ${companyContext.sector}. Mensaje: ${
      cleanMessage.length <= 140
        ? cleanMessage
        : `${cleanMessage.slice(0, 137)}...`
    }`;
  }

  if (cleanMessage.length <= 180) {
    return cleanMessage;
  }

  return `${cleanMessage.slice(0, 177)}...`;
}

export function buildIntent(
  category: string,
  originalMessage = "",
  company?: CurrentCompany
) {
  const language = detectLanguage(originalMessage, company?.language);
  const requestPurpose = originalMessage
    ? extractRequestPurposeByLanguage(originalMessage, language)
    : "";

  if (category === "appointment_request") {
    return requestPurpose
      ? `Solicitar cita para ${requestPurpose}`
      : "Solicitar cita";
  }

  if (category === "service_request") {
    return requestPurpose
      ? `Solicitar revisión, intervención o servicio para ${requestPurpose}`
      : "Solicitar revisión, intervención o servicio";
  }

  if (category === "product_service_inquiry" && requestPurpose) {
    return `Solicitar información o ayuda sobre ${requestPurpose}`;
  }

  const intents: Record<string, string> = {
    general_info: "Solicitar información general",
    service_request: "Solicitar revisión, intervención o servicio",
    product_service_inquiry: "Solicitar información sobre producto o servicio",
    quote_request: "Solicitar precio, tarifa o presupuesto",
    order_or_reservation: "Solicitar pedido, reserva, contratación o disponibilidad",
    change_or_cancellation: "Solicitar cambio o cancelación",
    complaint_or_incident: "Comunicar queja o incidencia",
    support_request: "Solicitar soporte o ayuda",
    billing_or_payment: "Solicitar información sobre facturación o pagos",
    follow_up: "Solicitar seguimiento de una gestión previa",
  };

  return intents[category] ?? "Solicitar información";
}

function hasDateSignal(normalizedMessage: string) {
  const dateSignals = [
    "hoy",
    "mañana",
    "manana",
    "pasado",
    "semana",
    "finde",
    "fin de semana",
    "lunes",
    "martes",
    "miercoles",
    "miércoles",
    "jueves",
    "viernes",
    "sabado",
    "sábado",
    "domingo",
    "today",
    "tomorrow",
    "weekend",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];

  return (
    dateSignals.some((signal) => normalizedMessage.includes(signal)) ||
    /\b\d{1,2}[/-]\d{1,2}/.test(normalizedMessage)
  );
}

function hasReservationReference(normalizedMessage: string) {
  return (
    normalizedMessage.includes("numero de reserva") ||
    normalizedMessage.includes("número de reserva") ||
    normalizedMessage.includes("numero de pedido") ||
    normalizedMessage.includes("número de pedido") ||
    normalizedMessage.includes("referencia") ||
    normalizedMessage.includes("localizador") ||
    normalizedMessage.includes("ticket") ||
    normalizedMessage.includes("expediente") ||
    normalizedMessage.includes("booking reference") ||
    normalizedMessage.includes("reservation number") ||
    normalizedMessage.includes("order number") ||
    normalizedMessage.includes("case number") ||
    normalizedMessage.includes("reference number")
  );
}

export function buildMissingInformation(
  category: string,
  originalMessage: string
) {
  const normalizedMessage = normalizeSearchText(originalMessage);

  if (category === "order_or_reservation") {
    const missingInformation: string[] = [];

    if (!hasDateSignal(normalizedMessage)) {
      missingInformation.push("fecha, plazo o disponibilidad deseada");
    }

    return missingInformation;
  }

  if (category === "appointment_request") {
    if (hasDateSignal(normalizedMessage)) {
      return [];
    }

    return ["fecha u horario preferido"];
  }

  if (category === "change_or_cancellation") {
    if (hasReservationReference(normalizedMessage)) {
      return [];
    }

    return ["referencia o número asociado", "datos identificativos de la solicitud"];
  }

  if (category === "service_request") {
    return [];
  }

  if (category === "quote_request") {
    return ["producto o servicio solicitado", "detalles básicos para preparar la propuesta"];
  }

  if (category === "support_request") {
    return ["descripción del problema", "producto, servicio o proceso afectado"];
  }

  if (category === "billing_or_payment") {
    if (hasReservationReference(normalizedMessage)) {
      return [];
    }

    return ["referencia de factura, pedido, cliente o solicitud"];
  }

  return [];
}

export function buildRecommendedAction(
  category: string,
  originalMessage: string,
  company: CurrentCompany
) {
  const normalizedMessage = normalizeSearchText(originalMessage);
  const companyContext = buildCompanyContext(company);

  if (category === "change_or_cancellation") {
    if (hasReservationReference(normalizedMessage)) {
      return `Revisar la referencia indicada en ${companyContext.name} y responder al cliente con los siguientes pasos.`;
    }

    return "Solicitar una referencia, número de pedido, número de solicitud o dato identificativo antes de gestionar el cambio o la cancelación.";
  }

  if (category === "order_or_reservation") {
    const missingInformation = buildMissingInformation(category, originalMessage);

    if (missingInformation.length === 0) {
      return `Revisar la solicitud según la operativa de ${companyContext.name} y responder con confirmación, alternativa o siguientes pasos.`;
    }

    return "Solicitar los datos que faltan y revisar disponibilidad, condiciones o viabilidad antes de confirmar.";
  }

  if (category === "complaint_or_incident") {
    return `Revisar la incidencia internamente teniendo en cuenta el servicio de ${companyContext.sector} y responder con una solución clara.`;
  }

  if (category === "quote_request") {
    if (companyContext.description) {
      return "Revisar la solicitud según los productos o servicios descritos por la empresa y pedir cualquier dato necesario antes de preparar una propuesta o presupuesto.";
    }

    return "Revisar la solicitud y pedir cualquier dato necesario antes de preparar una propuesta o presupuesto.";
  }

  if (category === "appointment_request") {
    return "Revisar disponibilidad de agenda antes de proponer una hora concreta y responder al cliente con los siguientes pasos.";
  }

  if (category === "service_request") {
    return `Revisar internamente la solicitud de servicio según la actividad de ${companyContext.name} y responder al cliente con los siguientes pasos, sin confirmar disponibilidad ni comprometer una solución antes de validarlo.`;
  }

  if (category === "product_service_inquiry") {
    return `Responder con información clara sobre el producto o servicio solicitado y pedir aclaración si falta contexto.`;
  }

  if (category === "support_request") {
    return "Revisar la solicitud de soporte, identificar el producto, servicio o proceso afectado y responder con pasos concretos.";
  }

  if (category === "billing_or_payment") {
    return "Revisar la información de facturación o pago asociada y responder con una aclaración precisa o los siguientes pasos.";
  }

  if (category === "follow_up") {
    return "Comprobar el estado de la gestión previa y responder con una actualización clara.";
  }

  if (category === "general_info") {
    return `Responder con información coherente con la actividad de ${companyContext.name} o pedir aclaración si falta contexto.`;
  }

  return "Revisar el caso y responder al cliente.";
}

function formatList(items: string[], language: MessageLanguage) {
  if (items.length === 0) {
    return "";
  }

  if (items.length === 1) {
    return items[0];
  }

  const separator = language === "en" ? " and " : " y ";

  return `${items.slice(0, -1).join(", ")}${separator}${
    items[items.length - 1]
  }`;
}

function formatCustomerFacingRequestPurpose(value: string) {
  const cleanValue = value
    .replace(/^[,:;\-\s]+/, "")
    .replace(/[¿?!.:;\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleanValue) {
    return "";
  }

  return `${cleanValue.charAt(0).toLowerCase()}${cleanValue.slice(1)}`;
}

function preserveReplacementCase(source: string, replacement: string) {
  if (source === source.toUpperCase()) {
    return replacement.toUpperCase();
  }

  if (source[0] === source[0]?.toUpperCase()) {
    return `${replacement.charAt(0).toUpperCase()}${replacement.slice(1)}`;
  }

  return replacement;
}

function replaceTokenPreservingCase(
  value: string,
  tokenPattern: string,
  replacement: string,
  alphabetPattern: string
) {
  return value.replace(
    new RegExp(
      `(^|[^${alphabetPattern}])(${tokenPattern})(?=$|[^${alphabetPattern}])`,
      "gi"
    ),
    (match, prefix: string, token: string) => {
      if (typeof prefix !== "string" || typeof token !== "string") {
        return match;
      }

      return `${prefix}${preserveReplacementCase(token, replacement)}`;
    }
  );
}

function normalizeSpanishRequestPurposePerspective(
  value: string,
  perspective: RequestPerspective
) {
  const alphabetPattern = "A-Za-zÁÉÍÓÚÜÑáéíóúüñ";
  const possessiveSingular = perspective === "customer" ? "tu" : "su";
  const possessivePlural = perspective === "customer" ? "tus" : "sus";
  const ownedMasculineSingular = perspective === "customer" ? "tuyo" : "suyo";
  const ownedFeminineSingular = perspective === "customer" ? "tuya" : "suya";
  const ownedMasculinePlural = perspective === "customer" ? "tuyos" : "suyos";
  const ownedFemininePlural = perspective === "customer" ? "tuyas" : "suyas";

  return [
    ["m[ií]os", ownedMasculinePlural],
    ["m[ií]as", ownedFemininePlural],
    ["m[ií]o", ownedMasculineSingular],
    ["m[ií]a", ownedFeminineSingular],
    ["mis", possessivePlural],
    ["mi", possessiveSingular],
    ["nuestros", possessivePlural],
    ["nuestras", possessivePlural],
    ["nuestro", possessiveSingular],
    ["nuestra", possessiveSingular],
  ].reduce(
    (nextValue, [tokenPattern, replacement]) =>
      replaceTokenPreservingCase(
        nextValue,
        tokenPattern,
        replacement,
        alphabetPattern
      ),
    value
  );
}

function normalizeEnglishRequestPurposePerspective(
  value: string,
  perspective: RequestPerspective
) {
  const alphabetPattern = "A-Za-z";
  const possessive = perspective === "customer" ? "your" : "their";
  const owned = perspective === "customer" ? "yours" : "theirs";

  return [
    ["mine", owned],
    ["ours", owned],
    ["my", possessive],
    ["our", possessive],
  ].reduce(
    (nextValue, [tokenPattern, replacement]) =>
      replaceTokenPreservingCase(
        nextValue,
        tokenPattern,
        replacement,
        alphabetPattern
      ),
    value
  );
}

function normalizeRequestPurposePerspective(
  value: string,
  language: MessageLanguage,
  perspective: RequestPerspective
) {
  if (!value) {
    return "";
  }

  if (language === "en") {
    return normalizeEnglishRequestPurposePerspective(value, perspective);
  }

  return normalizeSpanishRequestPurposePerspective(value, perspective);
}

function isWeakSpanishRequestPurpose(value: string) {
  const normalizedValue = normalizeSearchText(value);

  return [
    "cita",
    "una cita",
    "pedir cita",
    "solicitar cita",
    "agendar cita",
    "una reunion",
    "una reunión",
    "una llamada",
    "que me atiendan",
    "cuando me podeis atender",
    "cuándo me podeis atender",
    "cuando me podéis atender",
    "cuándo me podéis atender",
    "cuando me podeis dar cita",
    "cuándo me podeis dar cita",
    "cuando me podéis dar cita",
    "cuándo me podéis dar cita",
  ].includes(normalizedValue);
}

function extractSpanishRequestPurpose(originalMessage: string) {
  const cleanMessage = originalMessage.replace(/\s+/g, " ").trim();

  const patterns = [
    /\b(?:para|por)\s+([^¿?!.]+)/i,
    /\b(?:necesito|quiero|quisiera|me gustaría|me gustaria|tengo que)\s+([^¿?!.]+)/i,
  ];

  for (const pattern of patterns) {
    const match = cleanMessage.match(pattern);

    if (!match?.[1]) {
      continue;
    }

    const purpose = formatCustomerFacingRequestPurpose(match[1]);

    if (purpose && !isWeakSpanishRequestPurpose(purpose)) {
      return purpose;
    }
  }

  return "";
}

function isWeakEnglishRequestPurpose(value: string) {
  const normalizedValue = normalizeSearchText(value);

  return [
    "appointment",
    "an appointment",
    "book an appointment",
    "schedule an appointment",
    "a meeting",
    "a call",
    "be contacted",
    "get an appointment",
  ].includes(normalizedValue);
}

function extractEnglishRequestPurpose(originalMessage: string) {
  const cleanMessage = originalMessage.replace(/\s+/g, " ").trim();

  const patterns = [
    /\b(?:to|for|about)\s+([^?!.]+)/i,
    /\b(?:i need|i want|i would like|we need|we want|we would like)\s+([^?!.]+)/i,
  ];

  for (const pattern of patterns) {
    const match = cleanMessage.match(pattern);

    if (!match?.[1]) {
      continue;
    }

    const purpose = formatCustomerFacingRequestPurpose(match[1]);

    if (purpose && !isWeakEnglishRequestPurpose(purpose)) {
      return purpose;
    }
  }

  return "";
}

function getSpanishGreeting(customerName: string, tone: ResponseTone) {
  if (tone === "formal") {
    return `Estimado/a ${customerName}`;
  }

  if (tone === "directo") {
    return `Hola ${customerName}`;
  }

  return `Hola ${customerName}`;
}

function getEnglishGreeting(customerName: string, tone: ResponseTone) {
  if (tone === "formal") {
    return `Dear ${customerName}`;
  }

  if (tone === "directo") {
    return `Hi ${customerName}`;
  }

  return `Hi ${customerName}`;
}

function buildSpanishResponse(
  customerName: string,
  company: CurrentCompany,
  category: string,
  originalMessage: string
) {
  const companyContext = buildCompanyContext(company);
  const normalizedMessage = normalizeSearchText(originalMessage);

  const greeting = getSpanishGreeting(customerName, companyContext.tone);
  const hasReference = hasReservationReference(normalizedMessage);

  const companyDescriptionContext = companyContext.description
    ? " Tendremos en cuenta la información de nuestra empresa para darte una respuesta adecuada."
    : "";

  if (category === "change_or_cancellation") {
    if (hasReference) {
      return `${greeting}, gracias por contactar con ${companyContext.name}. Hemos recibido tu solicitud de cambio o cancelación y revisaremos los datos que nos has enviado. Te responderemos lo antes posible con los siguientes pasos.`;
    }

    return `${greeting}, gracias por contactar con ${companyContext.name}. Para poder ayudarte con el cambio o la cancelación, ¿podrías indicarnos una referencia, número de pedido, número de solicitud o dato identificativo? Lo revisaremos lo antes posible.`;
  }

  if (category === "order_or_reservation") {
    const missingDetails = buildMissingInformation(category, originalMessage);

    if (missingDetails.length > 0) {
      return `${greeting}, gracias por contactar con ${companyContext.name}. Para poder revisar tu solicitud, ¿podrías indicarnos ${formatList(
        missingDetails,
        "es"
      )}? Te responderemos lo antes posible.`;
    }

    return `${greeting}, gracias por contactar con ${companyContext.name}. Hemos recibido tu solicitud y vamos a revisar la información que nos has enviado. Te responderemos lo antes posible con una respuesta clara.`;
  }

  if (category === "complaint_or_incident") {
    if (companyContext.tone === "formal") {
      return `${greeting}, sentimos lo ocurrido. Gracias por informar a ${companyContext.name}. Hemos recibido tu mensaje y lo revisaremos internamente para ofrecerte una respuesta clara lo antes posible.`;
    }

    return `${greeting}, sentimos lo ocurrido. Gracias por informar a ${companyContext.name}. Hemos recibido tu mensaje y vamos a revisarlo internamente para darte una respuesta clara lo antes posible.`;
  }

  if (category === "quote_request") {
    if (companyContext.tone === "directo") {
      return `${greeting}, gracias por contactar con ${companyContext.name}. Hemos recibido tu solicitud y revisaremos los detalles para darte una respuesta clara.`;
    }

    return `${greeting}, gracias por contactar con ${companyContext.name}. Hemos recibido tu solicitud y vamos a revisar los detalles para poder darte una respuesta clara.${companyDescriptionContext} Si necesitamos algún dato adicional, te lo indicaremos lo antes posible.`;
  }

  if (category === "appointment_request") {
    const requestPurpose = extractRequestPurposeByLanguage(
      originalMessage,
      "es",
      "customer"
    );
    const acknowledgement = requestPurpose
      ? `Hemos recibido tu solicitud para ${requestPurpose}.`
      : "Hemos recibido tu solicitud de cita.";

    return `${greeting}, gracias por contactar con ${companyContext.name}. ${acknowledgement} Una persona de nuestro equipo se pondrá en contacto contigo lo antes posible.`;
  }

  if (category === "service_request") {
    const requestPurpose = extractRequestPurposeByLanguage(
      originalMessage,
      "es",
      "customer"
    );
    const acknowledgement = requestPurpose
      ? `Hemos recibido tu solicitud para ${requestPurpose}.`
      : "Hemos recibido tu solicitud de servicio.";

    return `${greeting}, gracias por contactar con ${companyContext.name}. ${acknowledgement} Una persona de nuestro equipo se pondrá en contacto contigo lo antes posible.`;
  }

  if (category === "product_service_inquiry") {
    return `${greeting}, gracias por contactar con ${companyContext.name}. Hemos recibido tu mensaje sobre nuestros productos o servicios y lo revisaremos para darte una respuesta clara.`;
  }

  if (category === "support_request") {
    return `${greeting}, gracias por contactar con ${companyContext.name}. Hemos recibido tu solicitud de soporte y revisaremos la información para indicarte los siguientes pasos.`;
  }

  if (category === "billing_or_payment") {
    return `${greeting}, gracias por contactar con ${companyContext.name}. Hemos recibido tu mensaje sobre facturación o pagos y lo revisaremos para darte una respuesta clara.`;
  }

  if (category === "follow_up") {
    return `${greeting}, gracias por contactar con ${companyContext.name}. Revisaremos el estado de la gestión anterior y te responderemos con una actualización lo antes posible.`;
  }

  if (companyContext.tone === "amable y detallado") {
    return `${greeting}, gracias por contactar con ${companyContext.name}. Hemos recibido tu mensaje y lo revisaremos con detalle para darte una respuesta clara y adaptada a lo que necesitas.`;
  }

  if (companyContext.tone === "directo") {
    return `${greeting}, gracias por contactar con ${companyContext.name}. Hemos recibido tu mensaje y lo revisaremos para responderte cuanto antes.`;
  }

  return `${greeting}, gracias por contactar con ${companyContext.name}. Hemos recibido tu mensaje y lo revisaremos para darte una respuesta clara lo antes posible.`;
}

function buildEnglishResponse(
  customerName: string,
  company: CurrentCompany,
  category: string,
  originalMessage: string
) {
  const companyContext = buildCompanyContext(company);
  const normalizedMessage = normalizeSearchText(originalMessage);

  const greeting = getEnglishGreeting(customerName, companyContext.tone);
  const hasReference = hasReservationReference(normalizedMessage);

  const companyDescriptionContext = companyContext.description
    ? " We will take our company information into account so we can give you an appropriate answer."
    : "";

  if (category === "change_or_cancellation") {
    if (hasReference) {
      return `${greeting}, thank you for contacting ${companyContext.name}. We have received your change or cancellation request and will review the details you have sent us. We will get back to you as soon as possible with the next steps.`;
    }

    return `${greeting}, thank you for contacting ${companyContext.name}. To help with the change or cancellation, could you please send us a reference, order number, request number or identifying detail? We will review it as soon as possible.`;
  }

  if (category === "order_or_reservation") {
    const missingDetails = buildMissingInformation(category, originalMessage);

    if (missingDetails.length > 0) {
      return `${greeting}, thank you for contacting ${companyContext.name}. To review your request, could you please confirm ${formatList(
        missingDetails,
        "en"
      )}? We will get back to you shortly.`;
    }

    return `${greeting}, thank you for contacting ${companyContext.name}. We have received your request and will review the information you have sent us. We will get back to you shortly with a clear answer.`;
  }

  if (category === "complaint_or_incident") {
    if (companyContext.tone === "formal") {
      return `${greeting}, we are sorry to hear about this. Thank you for letting ${companyContext.name} know. We have received your message and will review it internally so we can provide a clear response as soon as possible.`;
    }

    return `${greeting}, we are sorry to hear about this. Thank you for letting ${companyContext.name} know. We have received your message and will review it internally so we can give you a clear response as soon as possible.`;
  }

  if (category === "quote_request") {
    if (companyContext.tone === "directo") {
      return `${greeting}, thank you for contacting ${companyContext.name}. We have received your request and will review the details so we can give you a clear answer.`;
    }

    return `${greeting}, thank you for contacting ${companyContext.name}. We have received your request and will review the details so we can prepare a clear response.${companyDescriptionContext} If we need any additional information, we will let you know shortly.`;
  }

  if (category === "appointment_request") {
    const requestPurpose = extractRequestPurposeByLanguage(
      originalMessage,
      "en",
      "customer"
    );
    const acknowledgement = requestPurpose
      ? `We have received your request to ${requestPurpose}.`
      : "We have received your appointment request.";

    return `${greeting}, thank you for contacting ${companyContext.name}. ${acknowledgement} A member of our team will contact you as soon as possible.`;
  }

  if (category === "service_request") {
    const requestPurpose = extractRequestPurposeByLanguage(
      originalMessage,
      "en",
      "customer"
    );
    const acknowledgement = requestPurpose
      ? `We have received your request to ${requestPurpose}.`
      : "We have received your service request.";

    return `${greeting}, thank you for contacting ${companyContext.name}. ${acknowledgement} A member of our team will contact you as soon as possible.`;
  }

  if (category === "product_service_inquiry") {
    return `${greeting}, thank you for contacting ${companyContext.name}. We have received your question about our products or services and will review it so we can give you a clear answer.`;
  }

  if (category === "support_request") {
    return `${greeting}, thank you for contacting ${companyContext.name}. We have received your support request and will review the information so we can tell you the next steps.`;
  }

  if (category === "billing_or_payment") {
    return `${greeting}, thank you for contacting ${companyContext.name}. We have received your billing or payment question and will review it so we can give you a clear answer.`;
  }

  if (category === "follow_up") {
    return `${greeting}, thank you for contacting ${companyContext.name}. We will check the status of the previous request and get back to you with an update as soon as possible.`;
  }

  if (companyContext.tone === "amable y detallado") {
    return `${greeting}, thank you for contacting ${companyContext.name}. We have received your message and will review it carefully so we can give you a clear answer adapted to your request.`;
  }

  if (companyContext.tone === "directo") {
    return `${greeting}, thank you for contacting ${companyContext.name}. We have received your message and will review it so we can reply shortly.`;
  }

  return `${greeting}, thank you for contacting ${companyContext.name}. We have received your message and will review it shortly so we can give you a clear answer.`;
}

export function buildSuggestedResponse(
  customerName: string,
  company: CurrentCompany,
  category: string,
  language: MessageLanguage,
  originalMessage: string
) {
  if (language === "en") {
    return buildEnglishResponse(customerName, company, category, originalMessage);
  }

  return buildSpanishResponse(customerName, company, category, originalMessage);
}

export function buildSubject(message: string, fallbackCategory: string) {
  const cleanMessage = message.trim();

  if (cleanMessage.length > 0) {
    const firstLine = cleanMessage.split("\n")[0].trim();

    if (firstLine.length <= 70) {
      return firstLine;
    }

    return `${firstLine.slice(0, 67)}...`;
  }

  const subjects: Record<string, string> = {
    general_info: "Caso general",
    service_request: "Solicitud de servicio",
    product_service_inquiry: "Caso sobre producto o servicio",
    quote_request: "Solicitud de presupuesto",
    appointment_request: "Solicitud de cita",
    order_or_reservation: "Solicitud de pedido o reserva",
    change_or_cancellation: "Solicitud de cambio o cancelación",
    complaint_or_incident: "Queja o incidencia de cliente",
    support_request: "Solicitud de soporte",
    billing_or_payment: "Caso de facturación o pago",
    follow_up: "Solicitud de seguimiento",
  };

  return subjects[fallbackCategory] ?? "Nuevo caso";
}

type AnalyzeInquiryInput = {
  customerName: string;
  message: string;
  company: CurrentCompany;
};

export type InquiryAnalysisResult = {
  subject: string;
  summary: string;
  intent: string;
  category: string;
  priority: string;
  sentiment: InquirySentiment;
  language: MessageLanguage;
  missingInformation: string[];
  recommendedAction: string;
  suggestedResponse: string;
};

function buildGreetingOnlyAnalysis(
  customerName: string,
  company: CurrentCompany,
  language: MessageLanguage,
): InquiryAnalysisResult {
  const companyName = company.name?.trim() || "la empresa";

  if (language === "en") {
    return {
      subject: "Customer greeting",
      summary: `${customerName} has greeted the team without explaining what they need yet.`,
      intent: "Start a conversation with the company.",
      category: "general_info",
      priority: "low",
      sentiment: "neutral",
      language,
      missingInformation: ["Reason for the enquiry"],
      recommendedAction:
        "Reply to the greeting and ask briefly how the company can help.",
      suggestedResponse: `Hi ${customerName}, thank you for contacting ${companyName}. How can we help you?`,
    };
  }

  return {
    subject: "Saludo del cliente",
    summary: `${customerName} ha saludado al equipo, pero todavía no ha indicado qué necesita.`,
    intent: "Iniciar una conversación con la empresa.",
    category: "general_info",
    priority: "low",
    sentiment: "neutral",
    language,
    missingInformation: ["Motivo de la consulta"],
    recommendedAction:
      "Responder al saludo y preguntar brevemente en qué puede ayudar la empresa.",
    suggestedResponse: `Hola ${customerName}, gracias por contactar con ${companyName}. ¿En qué podemos ayudarte?`,
  };
}

function buildOutOfScopeAnalysis(
  customerName: string,
  company: CurrentCompany,
  language: MessageLanguage,
  request: NonNullable<ReturnType<typeof detectOutOfScopeRequest>>,
  hasStructuredHistory: boolean,
  focusedMessage: string,
): InquiryAnalysisResult {
  const companyName = company.name?.trim() || "la empresa";
  const companyActivity =
    company.sector?.trim() || company.description?.trim() || "sus servicios";

  if (language === "en") {
    return {
      subject: "Possible service mismatch",
      summary: `${customerName} is asking about ${request.requestLabelEn}, which does not appear to match ${companyName}'s activity (${companyActivity}).`,
      intent: hasStructuredHistory
        ? "The latest customer message changes the conversation to a request that appears unrelated to the company."
        : "Request a service that appears unrelated to the company.",
      category: "other",
      priority: inferPriority("other", focusedMessage),
      sentiment: inferSentiment("other", focusedMessage),
      language,
      missingInformation: [],
      recommendedAction:
        "Do not process the unrelated request. Check whether the customer contacted the wrong company and reply with a brief clarification.",
      suggestedResponse: `Hi ${customerName}, thank you for your message. There may be some confusion about the service requested: ${companyName} operates in ${companyActivity}. If you need help related to our services, please write to us again.`,
    };
  }

  return {
    subject: "Posible confusión de servicio",
    summary: `${customerName} solicita ${request.requestLabelEs}, algo que no parece corresponder con la actividad de ${companyName} (${companyActivity}).`,
    intent: hasStructuredHistory
      ? "El último mensaje cambia la conversación hacia una solicitud que parece ajena a la empresa."
      : "Solicitar un servicio que parece ajeno a la actividad de la empresa.",
    category: "other",
    priority: inferPriority("other", focusedMessage),
    sentiment: inferSentiment("other", focusedMessage),
    language,
    missingInformation: [],
    recommendedAction:
      "No tramitar la solicitud ajena. Comprobar si el cliente se ha dirigido a la empresa equivocada y responder con una aclaración breve.",
    suggestedResponse: `Hola ${customerName}, gracias por escribirnos. Parece que puede haber una confusión con el servicio solicitado: la actividad de ${companyName} es «${companyActivity}». Si necesitas ayuda relacionada con nuestros servicios, puedes volver a escribirnos.`,
  };
}

export function analyzeInquiry({
  customerName,
  message,
  company,
}: AnalyzeInquiryInput): InquiryAnalysisResult {
  const conversationFocus = extractLatestCustomerTurn(message);
  const focusedMessage = conversationFocus.message;
  const language = detectLanguage(focusedMessage, company.language);

  if (isGreetingOnlyMessage(focusedMessage)) {
    return buildGreetingOnlyAnalysis(customerName, company, language);
  }

  const outOfScopeRequest = detectOutOfScopeRequest(focusedMessage, company);

  if (outOfScopeRequest) {
    return buildOutOfScopeAnalysis(
      customerName,
      company,
      language,
      outOfScopeRequest,
      conversationFocus.hasStructuredHistory,
      focusedMessage,
    );
  }

  const category = inferCategory(focusedMessage);
  const priority = inferPriority(category, focusedMessage);
  const sentiment = inferSentiment(category, focusedMessage);
  const subject = buildSubject(focusedMessage, category);
  const summary = buildSummary(
    customerName,
    focusedMessage,
    category,
    company,
  );
  const intent = buildIntent(category, focusedMessage, company);
  const missingInformation = buildMissingInformation(
    category,
    focusedMessage,
  );
  const recommendedAction = buildRecommendedAction(
    category,
    focusedMessage,
    company,
  );
  const suggestedResponse = buildSuggestedResponse(
    customerName,
    company,
    category,
    language,
    focusedMessage,
  );

  return {
    subject,
    summary,
    intent,
    category,
    priority,
    sentiment,
    language,
    missingInformation,
    recommendedAction,
    suggestedResponse,
  };
}

