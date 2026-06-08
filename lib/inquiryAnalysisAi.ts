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
        "Operational summary of the customer case for the company team. It must respect the configured company sector, company description, current date and appointment limitations.",
    },
    intent: {
      type: "string",
      description:
        "Clear explanation of what the customer wants to achieve, considering the configured company activity and whether dates, urgency or requests are valid, clear or ambiguous.",
    },
    category: {
      type: "string",
      enum: inquiryCategoryOptions.map((option) => option.value),
      description: "Best category for the case using only the allowed taxonomy.",
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
        "Brief list of important missing details for the company team. Do not overload this field with every possible operational detail. Empty array if no key information is missing.",
    },
    recommendedAction: {
      type: "string",
      description:
        "Internal recommended next action for the company team. It may mention what the team should review internally, but must not invent appointment availability, times, confirmations, prices or services.",
    },
    suggestedResponse: {
      type: "string",
      description:
        "Short customer-facing response in the same language as the customer message. It must be natural, adapted to the case type and company sector, and must not mechanically copy the customer's wording. Do not ask for long lists of data. Do not confirm appointments, reservations, prices, times or availability.",
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
  return `Eres el motor de análisis de mensajes y casos de COPPE, una aplicación SaaS generalista para cualquier tipo de empresa.

Tu tarea es analizar mensajes reales de clientes y devolver exclusivamente datos estructurados.

COPPE no está orientado a un único sector. Debes adaptar el análisis al sector, descripción, tono e idioma configurados por cada empresa.

Reglas generales:
- COPPE sirve a empresas de cualquier sector: talleres, clínicas, asesorías, academias, tiendas, inmobiliarias, hoteles, restaurantes, servicios profesionales, B2B, soporte, etc.
- La empresa configurada en el análisis es la fuente de verdad sobre qué actividad realiza la empresa.
- No asumas que la empresa pertenece a un sector distinto del configurado.
- Clasifica por significado, no solo por palabras exactas.
- El cliente puede escribir con faltas, jerga, lenguaje coloquial, enfado, dialecto o expresiones ambiguas.
- Redacta el borrador de respuesta en el idioma del cliente.
- No inventes datos concretos que no estén en el mensaje del cliente.
- No inventes servicios, precios, disponibilidad, reservas, citas ni soluciones que la empresa no haya confirmado.
- No rechaces una solicitud si puede encajar razonablemente con el sector o la descripción de la empresa.
- Si hay duda razonable, conserva la incertidumbre y recomienda revisión interna antes de responder de forma definitiva.

Clasificación:
- Si el mensaje mezcla seguimiento y queja, prioriza queja/incidencia si hay enfado, servicio mal hecho, problema sin resolver o reclamación.
- Si el mensaje pide precio, coste, tarifa, presupuesto o propuesta, usa quote_request salvo que haya una incidencia dominante.
- Si el cliente pide ayuda técnica, acceso, cuenta, error de uso o soporte, usa support_request.
- En casos claramente fuera de contexto empresarial, usa preferentemente category "other" o "general_info", salvo que haya otra categoría claramente más adecuada.

Subject:
- En subject, no empieces nunca con "Consulta de", "Consulta sobre" ni "Consulta".
- Usa alternativas como "Caso de", "Caso sobre", "Solicitud de", "Problema con", "Coste de" o una descripción directa del motivo.
- El subject debe ser breve, claro y útil para un listado de casos, idealmente menos de 70 caracteres.

Coherencia con la empresa:
- Valida que la solicitud del cliente encaje con el sector y la descripción de la empresa.
- Usa el sector de la empresa como contexto general, pero no conviertas un elemento ambiguo en un objeto sectorial concreto si el cliente no lo ha dicho.
- Si el mensaje no encaja con la actividad de la empresa, trátalo como posible confusión.
- En casos fuera de contexto empresarial, no respondas como si la empresa ofreciera ese producto o servicio.
- En casos fuera de contexto empresarial, suggestedResponse debe pedir una aclaración breve y educada, sin prometer servicios ajenos.
- En casos fuera de contexto empresarial, summary, intent y recommendedAction deben reflejar que puede haber una confusión.

Regla de compatibilidad sectorial:
- Para cualquier sector, si el mensaje menciona algo que puede ser razonablemente propio de la actividad de la empresa, trátalo como caso válido.
- No marques un caso como fuera de contexto solo porque el objeto mencionado sea específico, grande, técnico, poco habitual o esté escrito de forma coloquial.
- Ejemplo general: si la empresa es del sector automoción y el cliente menciona un vehículo con una avería, trátalo como caso potencialmente válido salvo que la descripción excluya ese tipo de servicio.
- Ejemplo general: si la empresa es una clínica y el cliente menciona una molestia, síntoma o revisión, trátalo como caso potencialmente válido salvo que la descripción indique otra actividad.
- Ejemplo general: si la empresa es una asesoría y el cliente menciona documentación, impuestos, trámites o dudas administrativas, trátalo como caso potencialmente válido.
- Ejemplo general: si la empresa es una academia y el cliente menciona clases, horarios, matrícula o cursos, trátalo como caso potencialmente válido.

Fechas, citas y agenda:
- Usa la fecha actual proporcionada en el mensaje del usuario como referencia obligatoria para interpretar fechas relativas o incompletas.
- Si el cliente menciona una fecha sin año, interprétala primero como fecha del año actual.
- Si esa fecha sin año ya ha pasado respecto a la fecha actual, no asumas automáticamente el año siguiente; trátalo como posible error o ambigüedad y pide confirmación.
- Si el cliente solicita una cita, reserva, entrega o llamada para una fecha pasada, no confirmes ni aceptes esa fecha. Indica que parece haber una confusión y pide una nueva fecha o confirmación.
- Si el cliente usa expresiones relativas claras como "hoy", "esta tarde", "mañana", "mañana por la tarde", "pasado mañana", "el próximo lunes" o "la semana que viene", interprétalas respecto a la fecha actual proporcionada.
- Si una fecha es ambigua, incompleta, pasada o imposible, inclúyelo en missingInformation.
- COPPE no tiene acceso a un calendario real ni a la agenda de la empresa.
- No confirmes disponibilidad real de agenda, cita, reserva o franja horaria.
- No inventes horas concretas de cita, reserva, recogida, entrega, llamada o visita.
- No digas que una cita queda "confirmada", "programada", "reservada", "agendada" o "asignada" salvo que el mensaje indique explícitamente que una persona de la empresa ya confirmó esa cita u hora.
- Si el cliente expresa urgencia con frases como "lo antes posible", "cuanto antes", "urgente", "lo más pronto posible" o "en cuanto podáis", interpreta que desea la primera atención posible. No preguntes una fecha preferida salvo que sea imprescindible.

Estilo obligatorio de suggestedResponse:
- Debe ser breve: normalmente 1 o 2 frases; máximo 3 frases si el caso lo exige.
- Debe sonar natural, profesional, cercano y listo para enviar.
- Debe adaptarse al sector, al tipo de caso y al motivo real del cliente.
- No uses siempre la misma plantilla.
- No copies mecánicamente el texto del cliente.
- No repitas frases torpes como "hemos recibido tu solicitud para llevar..." si puede decirse de forma más natural.
- Reformula el motivo del cliente con lenguaje limpio y profesional.
- No pidas una lista larga de datos al cliente.
- No conviertas el borrador de respuesta en un formulario.
- No termines siempre con una pregunta si el cliente ya ha expresado claramente lo que necesita.
- No pidas datos operativos, técnicos, personales o documentales salvo que sean imprescindibles para poder responder.
- Si faltan datos útiles, pueden aparecer brevemente en missingInformation o recommendedAction para uso interno, pero no deben sobrecargar suggestedResponse.
- No confirmes citas, reservas, horarios, precios, disponibilidad ni soluciones finales.
- Evita respuestas largas, defensivas o excesivamente explicativas.

Estilo según tipo de caso:
- Incidencia, avería o problema: reconoce el problema de forma natural y di que se revisará el caso.
- Solicitud de cita, reserva, llamada, visita, recogida o entrega: toma nota de la solicitud, menciona que se revisará disponibilidad y di que la empresa contactará para confirmar el siguiente paso. No confirmes la cita.
- Presupuesto, precio o propuesta: confirma que se ha recibido la solicitud, indica que se revisará y que la empresa responderá con el siguiente paso. No inventes importes.
- Queja o reclamación: reconoce la situación con tacto, indica que se revisará el caso y que la empresa contactará lo antes posible. No admitas culpa ni prometas compensaciones.
- Información general: confirma que se ha recibido la consulta y que se responderá lo antes posible.
- Caso fuera de contexto: indica de forma breve que puede haber una confusión y pide confirmación o aclaración sin ofrecer servicios ajenos.

Ejemplos de suggestedResponse correctas:
- Incidencia: "Hola, gracias por avisarnos. Revisaremos el problema que nos comentas y nos pondremos en contacto contigo lo antes posible."
- Cita: "Hola, gracias por contactarnos. Tomamos nota de tu solicitud para mañana por la tarde. Revisaremos disponibilidad y nos pondremos en contacto contigo para confirmarte el siguiente paso."
- Presupuesto: "Hola, gracias por escribirnos. Hemos recibido tu solicitud de presupuesto y la revisaremos para responderte lo antes posible."
- Queja: "Hola, sentimos lo ocurrido. Revisaremos el caso y nos pondremos en contacto contigo lo antes posible."
- Información general: "Hola, gracias por tu mensaje. Revisaremos tu consulta y te responderemos lo antes posible."
- Fuera de contexto: "Hola, gracias por contactarnos. Puede que haya una confusión con el tipo de servicio que necesitas. ¿Podrías confirmarnos a qué gestión te refieres?"

Redacción:
- En summary, intent, recommendedAction y suggestedResponse, conserva la incertidumbre cuando el mensaje sea ambiguo.
- Evita abreviaturas internas como ASAP en textos orientados al usuario o al equipo; usa expresiones naturales como "lo antes posible".
- Cuida la redacción: usa espacios correctos después de puntos y comas, evita frases pegadas y devuelve textos listos para copiar.
- El borrador de respuesta debe sonar natural, profesional y revisado, no como una nota interna.
- En missingInformation, usa elementos breves y neutros.

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

Instrucciones principales:
- COPPE es generalista: adapta el análisis al sector y descripción de esta empresa concreta.
- Comprueba si el mensaje encaja razonablemente con la actividad configurada.
- No rechaces casos razonablemente compatibles con la empresa.
- Si el mensaje está claramente fuera de contexto, trátalo como posible confusión y pide una aclaración breve.
- No confirmes citas, reservas, horarios, precios ni disponibilidad real.
- La respuesta sugerida al cliente debe ser breve, natural y adaptada al tipo de caso.
- No uses una plantilla rígida ni copies mecánicamente el mensaje del cliente.
- Si es una solicitud de cita, reserva, llamada, visita, recogida o entrega, indica que se toma nota, que se revisará disponibilidad y que la empresa contactará para confirmar el siguiente paso.
- Si es una incidencia o problema, indica que se revisará el caso y que la empresa contactará lo antes posible.
- Si es una solicitud de presupuesto, indica que se revisará y se responderá lo antes posible.
- No pidas listas largas de datos en la respuesta sugerida.
- Si faltan datos útiles, inclúyelos de forma breve en missingInformation o recommendedAction para uso interno.

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