import { type CurrentCompany } from "./currentCompany";
import { type InquiryAnalysisResult } from "./inquiryAnalysis";
import { inquiryCategoryOptions } from "./inquiryCategories";
import { normalizeAiInquiryAnalysisResult } from "./inquiryAnalysisValidation";

type AnalyzeInquiryWithAiInput = {
  customerName: string;
  message: string;
  company: CurrentCompany;
};

type OpenAiResponseContentItem = {
  type?: string;
  text?: unknown;
};

type OpenAiResponseOutputItem = {
  type?: string;
  content?: OpenAiResponseContentItem[];
};

type OpenAiResponsesApiResult = {
  output_text?: unknown;
  output?: OpenAiResponseOutputItem[];
};

type AnalysisDateContext = {
  currentDateIso: string;
  currentDateText: string;
  timeZone: string;
};

const OPENAI_RESPONSES_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_OPENAI_REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_OPENAI_MAX_OUTPUT_TOKENS = 1200;
const DEFAULT_ANALYSIS_TIME_ZONE = "Europe/Madrid";

const inquiryAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    subject: {
      type: "string",
      description:
        "Short subject for the case. Do not start with Consulta de, Consulta sobre or Consulta. Maximum 70 characters if possible.",
    },
    summary: {
      type: "string",
      description:
        "Operational summary of the customer case for the company team. It must respect the company sector, context and current date.",
    },
    intent: {
      type: "string",
      description:
        "Clear explanation of what the customer wants to achieve, considering whether the request fits the company activity and whether mentioned dates are valid or ambiguous.",
    },
    category: {
      type: "string",
      enum: inquiryCategoryOptions.map((option) => option.value),
      description:
        "Best category for the case using only the allowed taxonomy.",
    },
    priority: {
      type: "string",
      enum: ["low", "medium", "high"],
      description:
        "Priority level. Use high for urgent, angry, blocked, cancellation, serious complaint or time-sensitive messages.",
    },
    language: {
      type: "string",
      enum: ["es", "en"],
      description:
        "Detected language of the customer message. Use es for Spanish and en for English.",
    },
    missingInformation: {
      type: "array",
      items: {
        type: "string",
      },
      description:
        "List of missing details needed to answer properly. Empty array if no key information is missing. Include date clarification when the customer mentions a past, incomplete or ambiguous date.",
    },
    recommendedAction: {
      type: "string",
      description:
        "Internal recommended next action for the company team. It must not assume the company offers services outside its sector and must handle past or ambiguous dates prudently.",
    },
    suggestedResponse: {
      type: "string",
      description:
        "Suggested customer-facing response in the same language as the customer message. It must be coherent with the company sector, must not offer services the company does not provide and must not confirm unavailable calendar slots.",
    },
  },
  required: [
    "subject",
    "summary",
    "intent",
    "category",
    "priority",
    "language",
    "missingInformation",
    "recommendedAction",
    "suggestedResponse",
  ],
} as const;

function getOpenAiApiKey() {
  return process.env.OPENAI_API_KEY?.trim() || "";
}

function getOpenAiModel() {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
}

function getOpenAiRequestTimeoutMs() {
  const rawValue = process.env.OPENAI_REQUEST_TIMEOUT_MS?.trim();

  if (!rawValue) {
    return DEFAULT_OPENAI_REQUEST_TIMEOUT_MS;
  }

  const parsedValue = Number(rawValue);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return DEFAULT_OPENAI_REQUEST_TIMEOUT_MS;
  }

  return parsedValue;
}

function getOpenAiMaxOutputTokens() {
  const rawValue = process.env.OPENAI_MAX_OUTPUT_TOKENS?.trim();

  if (!rawValue) {
    return DEFAULT_OPENAI_MAX_OUTPUT_TOKENS;
  }

  const parsedValue = Number(rawValue);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return DEFAULT_OPENAI_MAX_OUTPUT_TOKENS;
  }

  return parsedValue;
}

function getAnalysisDateContext(): AnalysisDateContext {
  const now = new Date();
  const timeZone = DEFAULT_ANALYSIS_TIME_ZONE;

  const currentDateIso = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const currentDateText = new Intl.DateTimeFormat("es-ES", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);

  return {
    currentDateIso,
    currentDateText,
    timeZone,
  };
}

function buildAllowedCategoriesText() {
  return inquiryCategoryOptions
    .map((option) => `- ${option.value}: ${option.label}`)
    .join("\n");
}

function buildSystemPrompt() {
  return `Eres el motor de análisis de mensajes y casos de COPPE, una aplicación SaaS para cualquier tipo de empresa.

Tu tarea es analizar mensajes reales de clientes y devolver exclusivamente datos estructurados.

Reglas:
- COPPE sirve a empresas de cualquier sector: talleres, clínicas, asesorías, academias, tiendas, inmobiliarias, hoteles, restaurantes, servicios profesionales, B2B, soporte, etc.
- La empresa configurada en el análisis es la fuente de verdad sobre qué actividad realiza la empresa.
- No asumas que la empresa es turística.
- Clasifica por significado, no solo por palabras exactas.
- El cliente puede escribir con jerga, faltas, lenguaje coloquial, enfado, dialecto o expresiones ambiguas.
- Si el mensaje mezcla seguimiento y queja, prioriza queja/incidencia si hay enfado, servicio mal hecho, problema sin resolver o reclamación.
- Si el mensaje pide precio, coste, tarifa, presupuesto o propuesta, usa quote_request salvo que haya una incidencia dominante.
- Si el cliente pide ayuda técnica, acceso, cuenta, error de uso o soporte, usa support_request.
- Redacta el borrador de respuesta en el idioma del cliente.
- En subject, no empieces nunca con "Consulta de", "Consulta sobre" ni "Consulta". Usa alternativas como "Caso de", "Caso sobre", "Solicitud de", "Problema con", "Coste de" o una descripción directa del motivo.
- El subject debe ser breve, claro y útil para un listado de casos, idealmente menos de 70 caracteres.
- No inventes datos concretos que no estén en el mensaje del cliente.
- Usa el sector de la empresa como contexto general, pero no conviertas un elemento ambiguo en un objeto sectorial concreto si el cliente no lo ha dicho.
- Valida siempre que la solicitud del cliente encaje con el sector y la descripción de la empresa.
- Si el cliente pide un producto, servicio, reserva, cita o gestión que no encaja con la actividad de la empresa, no respondas como si la empresa lo ofreciera.
- En casos fuera de contexto empresarial, indica de forma educada que puede haber una confusión, pide aclaración y, si procede, reconduce el mensaje hacia una gestión compatible con la empresa.
- En casos fuera de contexto empresarial, no prometas disponibilidad, precios, reservas, citas, servicios ni soluciones que no pertenezcan a la actividad de la empresa.
- En casos fuera de contexto empresarial, el resumen debe indicar que la solicitud no parece encajar con la actividad de la empresa.
- En casos fuera de contexto empresarial, intent debe explicar que el cliente parece pedir algo ajeno al negocio o que puede haber una confusión.
- En casos fuera de contexto empresarial, recommendedAction debe recomendar revisar la posible confusión antes de responder.
- En casos fuera de contexto empresarial, suggestedResponse debe evitar ofrecer servicios ajenos a la empresa y debe pedir confirmación o aclaración.
- En casos claramente fuera de contexto empresarial, usa preferentemente category "other" o "general_info", salvo que haya otra categoría claramente más adecuada.
- Por ejemplo: si la empresa es un taller mecánico y el cliente pide reservar una habitación, no prepares una reserva de alojamiento; explica que el espacio corresponde a un taller y pregunta si quería reservar una cita para su vehículo.
- Por ejemplo: si la empresa es una clínica y el cliente pregunta por una mesa para cenar, no respondas como restaurante; pide confirmación o aclaración.
- Por ejemplo: si una empresa es un taller y el cliente dice "una puerta", no asumas automáticamente que es la puerta de un vehículo; pide aclaración si hace falta.
- Por ejemplo: si el cliente dice "el problema sigue igual", no digas "problema mecánico" salvo que el mensaje mencione claramente algo mecánico.
- Usa la fecha actual proporcionada en el mensaje del usuario como referencia obligatoria para interpretar fechas relativas o incompletas.
- Si el cliente menciona una fecha sin año, interprétala primero como fecha del año actual.
- Si esa fecha sin año ya ha pasado respecto a la fecha actual, no asumas automáticamente el año siguiente; trátalo como posible error o ambigüedad y pide confirmación.
- Si el cliente solicita una cita, reserva, entrega o llamada para una fecha pasada, no confirmes ni aceptes esa fecha. Indica que parece haber una confusión y pide una nueva fecha o confirmación.
- Si el cliente usa expresiones como "mañana", "hoy", "el viernes", "la semana que viene" o similares, interprétalas respecto a la fecha actual proporcionada.
- Si una fecha es ambigua, incompleta, pasada o imposible, inclúyelo en missingInformation.
- No confirmes disponibilidad real de agenda, cita, reserva o franja horaria, porque COPPE no tiene acceso a un calendario real. Puedes preparar una respuesta para solicitar confirmación o proponer revisar disponibilidad.
- En solicitudes de cita válidas, suggestedResponse debe pedir los datos necesarios para gestionar la cita, pero no prometer que la cita queda reservada salvo que el mensaje de la empresa lo indique explícitamente.
- En summary, intent, recommendedAction y suggestedResponse, conserva la incertidumbre cuando el mensaje sea ambiguo.
- Evita abreviaturas internas como ASAP en textos orientados al usuario o al equipo; usa expresiones naturales como "lo antes posible".
- Cuida la redacción: usa espacios correctos después de puntos y comas, evita frases pegadas y devuelve textos listos para copiar.
- El borrador de respuesta debe sonar natural, profesional y revisado, no como una nota interna.
- En missingInformation, usa elementos breves y neutros. Evita ejemplos sectoriales concretos entre paréntesis salvo que sean imprescindibles.
- Si el cliente menciona un objeto ambiguo, pide el contexto de forma neutral. Por ejemplo: "tipo de puerta o contexto de la reparación", no "puerta de vehículo".
- Si falta información importante, indícala en missingInformation.

Categorías permitidas:
${buildAllowedCategoriesText()}`;
}

function buildUserPrompt({
  customerName,
  message,
  company,
}: AnalyzeInquiryWithAiInput) {
  const dateContext = getAnalysisDateContext();

  return `Analiza este mensaje o caso de cliente.

Fecha actual para interpretar fechas:
${dateContext.currentDateText}
Fecha actual ISO:
${dateContext.currentDateIso}
Zona horaria:
${dateContext.timeZone}

Cliente:
${customerName}

Mensaje original:
${message}

Empresa:
Nombre: ${company.name}
Sector: ${company.sector}
Descripción: ${company.description || "No indicada"}
Tono de respuesta preferido: ${company.tone || "profesional y cercano"}
Idioma principal de empresa: ${company.language || "es"}

Antes de preparar el análisis, comprueba si el mensaje encaja con la actividad de la empresa. Si no encaja, trata el caso como posible confusión y no respondas como si la empresa ofreciera ese producto o servicio.

Antes de preparar el análisis, comprueba si el mensaje menciona fechas, citas, reservas, entregas o llamadas. Si una fecha ya ha pasado, es ambigua o no tiene año y parece referirse a una fecha pasada del año actual, pide confirmación en lugar de asumir el año siguiente.

Devuelve el análisis estructurado para COPPE.`;
}

function extractOutputText(result: OpenAiResponsesApiResult) {
  if (typeof result.output_text === "string") {
    return result.output_text;
  }

  const output = Array.isArray(result.output) ? result.output : [];

  for (const outputItem of output) {
    const content = Array.isArray(outputItem.content)
      ? outputItem.content
      : [];

    for (const contentItem of content) {
      if (
        contentItem.type === "output_text" &&
        typeof contentItem.text === "string"
      ) {
        return contentItem.text;
      }
    }
  }

  return "";
}

function normalizeAiGeneratedSubject(subject: string) {
  const cleanSubject = subject.trim();

  if (!cleanSubject) {
    return "Nuevo caso";
  }

  return cleanSubject
    .replace(/^consulta\s+sobre\b/i, "Caso sobre")
    .replace(/^consulta\s+de\b/i, "Caso de")
    .replace(/^consulta\b/i, "Caso");
}

export async function analyzeInquiryWithAiEngine(
  input: AnalyzeInquiryWithAiInput
): Promise<InquiryAnalysisResult> {
  const apiKey = getOpenAiApiKey();

  if (!apiKey) {
    throw new Error("Falta OPENAI_API_KEY.");
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, getOpenAiRequestTimeoutMs());

  let response: Response;

  try {
    response = await fetch(OPENAI_RESPONSES_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: abortController.signal,
      body: JSON.stringify({
        model: getOpenAiModel(),
        max_output_tokens: getOpenAiMaxOutputTokens(),
        input: [
          {
            role: "system",
            content: buildSystemPrompt(),
          },
          {
            role: "user",
            content: buildUserPrompt(input),
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "coppe_inquiry_analysis",
            strict: true,
            schema: inquiryAnalysisJsonSchema,
          },
        },
      }),
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `OpenAI no pudo analizar el caso: ${response.status} ${errorText}`
    );
  }

  const responsePayload = (await response.json()) as OpenAiResponsesApiResult;
  const outputText = extractOutputText(responsePayload);

  if (!outputText) {
    throw new Error("OpenAI no devolvió texto de análisis.");
  }

  let parsedOutput: unknown;

  try {
    parsedOutput = JSON.parse(outputText);
  } catch {
    throw new Error("OpenAI devolvió un JSON no válido.");
  }

  const normalizedAnalysis = normalizeAiInquiryAnalysisResult(parsedOutput);

  if (!normalizedAnalysis) {
    throw new Error("OpenAI devolvió un análisis incompleto o no válido.");
  }

  return {
    ...normalizedAnalysis,
    subject: normalizeAiGeneratedSubject(normalizedAnalysis.subject),
  };
}