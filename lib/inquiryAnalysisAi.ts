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
        "Operational summary of the customer case for the company team. It must first evaluate whether the message fits the configured company sector and description.",
    },
    intent: {
      type: "string",
      description:
        "Clear explanation of what the customer wants to achieve and whether that request fits the configured company activity.",
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
    sentiment: {
      type: "string",
      enum: ["positive", "neutral", "negative"],
      description:
        "Emotional tone of the customer message. Use negative for complaints, frustration, anger, disappointment, unresolved problems or strong urgency. Use positive for gratitude, satisfaction or praise. Use neutral for informational messages without clear emotional tone.",
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
        "Brief list of important missing details for the company team. Empty array if no key information is missing or if the message is outside the company context.",
    },
    recommendedAction: {
      type: "string",
      description:
        "Internal recommended next action for the company team. It must clearly distinguish between valid company-related cases and possible customer confusion.",
    },
    suggestedResponse: {
      type: "string",
      description:
        "Short customer-facing response in the same language as the customer message. First respect whether the message fits the configured company. If it fits, acknowledge receipt and say a person from the company will contact the customer as soon as possible. If it does not fit, politely indicate that there may be confusion and invite the customer to contact the company again if they need something related to its services. Do not solve, diagnose, confirm, promise, or ask for long lists of data.",
    },
  },
  required: [
    "subject",
    "summary",
    "intent",
    "category",
    "priority",
    "sentiment",
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

Principio principal:
- Primero evalúa la compatibilidad entre el mensaje y la empresa configurada.
- Después clasifica el tipo de mensaje.
- El tipo de mensaje nunca debe pesar más que el sector y la descripción de la empresa.
- Que un cliente pida una cita, reserva, presupuesto, revisión o ayuda no significa automáticamente que el caso encaje con la empresa.
- Para que el caso encaje, el motivo concreto del cliente debe ser razonablemente compatible con la actividad configurada.

Reglas generales:
- COPPE sirve a empresas de cualquier sector: talleres, clínicas, asesorías, academias, tiendas, inmobiliarias, hoteles, restaurantes, servicios profesionales, B2B, soporte, etc.
- La empresa configurada en el análisis es la fuente de verdad sobre qué actividad realiza la empresa.
- No asumas que la empresa pertenece a un sector distinto del configurado.
- Clasifica por significado, no solo por palabras exactas.
- Desambigua verbos polisémicos como "cambiar", "modificar", "revisar", "mirar", "devolver" o "reservar" según el objeto y el contexto de empresa.
- No clasifiques como cambio/cancelación administrativa solo por la palabra "cambiar".
- Si "cambiar" significa sustituir, reemplazar, instalar, reparar o intervenir sobre un producto, pieza, elemento, documento, equipo, instalación, servicio técnico o elemento físico/digital, clasifica según la necesidad real: cita, presupuesto, soporte, producto/servicio o incidencia.
- Solo usa change_or_cancellation cuando el cliente quiera cambiar, reprogramar, aplazar, cancelar, anular, devolver o dar de baja una cita, reserva, pedido, solicitud, suscripción, fecha, hora, turno, reunión, contrato o gestión previa.
- Si el mensaje combina una necesidad concreta de servicio con una petición de cita, prioriza la necesidad y la cita, no la palabra "cambiar".
- El cliente puede escribir con faltas, jerga, lenguaje coloquial, enfado, dialecto o expresiones ambiguas.
- Redacta todos los campos orientados al cliente en el idioma del cliente.
- No inventes datos concretos que no estén en el mensaje del cliente.
- No inventes servicios, precios, disponibilidad, reservas, citas ni soluciones que la empresa no haya confirmado.
- No rechaces una solicitud si puede encajar razonablemente con el sector o la descripción de la empresa.
- Si hay duda razonable, conserva la incertidumbre y recomienda revisión interna antes de responder de forma definitiva.

Compatibilidad con la empresa:
- Evalúa el contenido real del mensaje, no solo palabras genéricas como "cita", "reserva", "revisión", "consulta", "ayuda" o "presupuesto".
- Un mensaje encaja si el problema, necesidad, producto, servicio o contexto mencionado pertenece razonablemente a la actividad de la empresa.
- Un mensaje no encaja si el problema, necesidad, producto, servicio o contexto mencionado apunta claramente a otro tipo de negocio.
- Si el mensaje no encaja con la actividad de la empresa, trátalo como posible confusión.
- En casos fuera de contexto empresarial, summary, intent y recommendedAction deben reflejar que puede haber una confusión.
- En casos fuera de contexto empresarial, suggestedResponse debe ser educada y breve, pero no debe decir que una persona del equipo se pondrá en contacto para gestionar esa solicitud ajena.
- En casos fuera de contexto empresarial, suggestedResponse debe indicar que puede haber una confusión y que el cliente puede volver a contactar si necesita algo relacionado con los servicios de la empresa.

Ejemplos de compatibilidad:
- Si la empresa es un taller, automoción, mecánica o reparación de vehículos, un mensaje sobre coche, moto, furgoneta, camión, autobús, motor, frenos, dirección, ruedas, revisión o avería encaja salvo que la descripción lo excluya.
- Si la empresa es un taller y el cliente dice que lleva días con molestias y quiere que lo vean, eso NO encaja: parece una solicitud para una clínica o profesional sanitario.
- Si la empresa es una clínica o centro sanitario y el cliente dice que lleva días con molestias y quiere una cita, eso sí encaja.
- Si la empresa es una asesoría y el cliente menciona documentación, impuestos, trámites, declaraciones o dudas administrativas, eso encaja.
- Si la empresa es una academia y el cliente menciona clases, cursos, matrícula, horarios o profesores, eso encaja.
- Si la empresa es un restaurante y el cliente quiere reservar una mesa, eso encaja.
- Si la empresa no es hotel, alojamiento o turismo y el cliente quiere reservar una habitación, normalmente no encaja.
- Si cualquier empresa recibe "quiero cambiar mi cita", "quiero cambiar la hora", "quiero modificar una reserva" o "quiero cancelar un pedido", eso es cambio/cancelación administrativa.
- Si cualquier empresa recibe "quiero cambiar el radiador", "quiero cambiar la batería", "quiero cambiar una cerradura", "quiero cambiar el diseño", "quiero cambiar un componente" o "quiero sustituir una pieza", eso NO es cambio/cancelación administrativa: es una solicitud de servicio, soporte, reparación, instalación, presupuesto o cita según el contexto.
- Si una empresa vende productos y el cliente quiere "cambiar un producto por otra talla" o "devolver un pedido", puede encajar como cambio/devolución, porque el objeto es un pedido, compra o devolución previa.

Clasificación:
- sentiment debe reflejar el tono emocional real del mensaje del cliente: positive, neutral o negative.
- Usa sentiment "negative" si hay queja, enfado, frustración, decepción, reclamación, problema sin resolver o urgencia expresada con tensión.
- Usa sentiment "positive" si hay agradecimiento, satisfacción, felicitación o valoración claramente positiva.
- Usa sentiment "neutral" si el mensaje es principalmente informativo y no muestra emoción clara.
- Si el mensaje mezcla seguimiento y queja, prioriza queja/incidencia si hay enfado, servicio mal hecho, problema sin resolver o reclamación.
- Si el mensaje pide precio, coste, tarifa, presupuesto o propuesta, usa quote_request salvo que haya una incidencia dominante.
- Si el cliente pide ayuda técnica, acceso, cuenta, error de uso o soporte, usa support_request.
- En casos claramente fuera de contexto empresarial, usa preferentemente category "other" o "general_info", salvo que haya otra categoría claramente más adecuada.

Subject:
- En subject, no empieces nunca con "Consulta de", "Consulta sobre" ni "Consulta".
- Usa alternativas como "Caso de", "Caso sobre", "Solicitud de", "Problema con", "Coste de" o una descripción directa del motivo.
- El subject debe ser breve, claro y útil para un listado de casos, idealmente menos de 70 caracteres.
- Si el caso está fuera de contexto, el subject debe reflejar posible confusión. Por ejemplo: "Posible confusión de servicio".

Fechas, citas y agenda:
- Usa la fecha actual proporcionada en el mensaje del usuario como referencia obligatoria para interpretar fechas relativas o incompletas.
- Si el cliente menciona una fecha sin año, interprétala primero como fecha del año actual.
- Si esa fecha sin año ya ha pasado respecto a la fecha actual, no asumas automáticamente el año siguiente; trátalo como posible error o ambigüedad y pide confirmación en el análisis interno.
- Si el cliente solicita una cita, reserva, entrega o llamada para una fecha pasada, no confirmes ni aceptes esa fecha.
- Si el cliente usa expresiones relativas claras como "hoy", "esta tarde", "mañana", "mañana por la tarde", "pasado mañana", "el próximo lunes" o "la semana que viene", interprétalas respecto a la fecha actual proporcionada.
- Si una fecha es ambigua, incompleta, pasada o imposible, inclúyelo en missingInformation.
- COPPE no tiene acceso a un calendario real ni a la agenda de la empresa.
- No confirmes disponibilidad real de agenda, cita, reserva o franja horaria.
- No inventes horas concretas de cita, reserva, recogida, entrega, llamada o visita.
- No digas que una cita queda "confirmada", "programada", "reservada", "agendada" o "asignada" salvo que el mensaje indique explícitamente que una persona de la empresa ya confirmó esa cita u hora.
- Si el cliente expresa urgencia con frases como "lo antes posible", "cuanto antes", "urgente", "lo más pronto posible" o "en cuanto podáis", interpreta que desea la primera atención posible. No preguntes una fecha preferida salvo que sea imprescindible.

Diferencia entre análisis interno y respuesta al cliente:
- summary, intent, missingInformation y recommendedAction son para el equipo de la empresa. Pueden explicar qué ocurre, qué falta y qué debería revisar el equipo.
- suggestedResponse es solo una primera respuesta prudente al cliente.
- suggestedResponse no debe resolver el caso.
- suggestedResponse no debe diagnosticar.
- suggestedResponse no debe exponer etiquetas internas agrupadas como "cita, reunión o llamada", "producto o servicio", "pedido, reserva, contratación o disponibilidad" o equivalentes.
- suggestedResponse debe mencionar el motivo concreto del cliente cuando esté claro: por ejemplo, "revisar los frenos", "cambiar el radiador", "pedir presupuesto", "reservar una mesa" o "resolver el acceso".
- Si el motivo concreto no está claro, suggestedResponse debe usar una fórmula breve y natural como "tu solicitud", "tu mensaje" o "tu solicitud de cita", pero no una lista de categorías internas.
- suggestedResponse no debe confirmar que la empresa hará el servicio.
- suggestedResponse no debe prometer precios, fechas, disponibilidad, soluciones ni resultados.
- suggestedResponse no debe pedir listas largas de datos.
- suggestedResponse no debe convertirse en un formulario.
- suggestedResponse no debe implicar que la empresa ya está revisando físicamente un vehículo, documento, paciente, instalación, producto o trabajo.
- suggestedResponse no debe usar frases como "revisaremos el problema", "revisaremos el vehículo", "revisaremos al paciente", "ya estamos revisando", "hemos agendado", "hemos reservado", "queda confirmado" o similares.

Estilo de suggestedResponse para casos que SÍ encajan con la empresa:
- Debe ser breve: normalmente 1 o 2 frases; máximo 3 frases si el caso lo exige.
- Debe sonar natural, profesional, cercano y listo para enviar.
- Debe adaptarse al idioma del cliente y al tono configurado de la empresa.
- Debe reconocer el tipo de mensaje o motivo de forma breve y neutral.
- No copies mecánicamente el mensaje del cliente.
- Reformula el motivo del cliente con lenguaje limpio, breve y profesional.
- Debe confirmar recepción y derivar el seguimiento a una persona de la empresa.
- Cierre recomendado: "Una persona de nuestro equipo se pondrá en contacto contigo lo antes posible."
- En inglés, usa un cierre equivalente: "A member of our team will contact you as soon as possible."
- Ejemplo válido: "Hola, gracias por contactarnos. Hemos recibido tu mensaje sobre el problema con la dirección del autobús. Una persona de nuestro equipo se pondrá en contacto contigo lo antes posible."
- Ejemplo válido: "Hola, gracias por contactarnos. Hemos recibido tu solicitud para revisar los frenos del coche. Una persona de nuestro equipo se pondrá en contacto contigo lo antes posible."
- Ejemplo válido: "Hola, gracias por contactarnos. Hemos recibido tu solicitud de cita. Una persona de nuestro equipo se pondrá en contacto contigo lo antes posible."
- Ejemplo válido: "Hola, gracias por escribirnos. Hemos recibido tu solicitud de presupuesto. Una persona de nuestro equipo se pondrá en contacto contigo lo antes posible."
- Ejemplo NO válido: "Hemos recibido tu solicitud de cita, reunión o llamada." porque expone una categoría interna demasiado amplia.

Estilo de suggestedResponse para casos que NO encajan con la empresa:
- Debe ser breve, educada y prudente.
- Debe indicar que puede haber una confusión con el tipo de servicio solicitado.
- No debe ofrecer gestionar la solicitud ajena.
- No debe decir que una persona del equipo se pondrá en contacto para atender esa solicitud ajena.
- Debe invitar al cliente a volver a contactar si necesita algo relacionado con los servicios de la empresa.
- Ejemplo para empresa no sanitaria que recibe una solicitud sanitaria: "Hola, gracias por contactarnos. Parece que puede haber una confusión con el tipo de servicio que necesitas. Si necesitas ayuda relacionada con nuestros servicios, puedes volver a ponerte en contacto con nosotros."
- Ejemplo para empresa no hotelera que recibe una reserva de habitación: "Hola, gracias por contactarnos. Puede que haya una confusión con el tipo de servicio solicitado. Si necesitas algo relacionado con nuestros servicios, puedes volver a escribirnos."

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
- Primero decide si el mensaje encaja con esta empresa concreta.
- No clasifiques como válido un mensaje solo porque pida una cita, reserva, revisión, presupuesto o ayuda. El motivo concreto debe encajar con el sector y descripción de la empresa.
- No clasifiques como change_or_cancellation solo por la palabra "cambiar"; mira qué se quiere cambiar.
- Si "cambiar" significa sustituir, reparar, instalar o reemplazar algo como servicio solicitado, no es cambio/cancelación administrativa.
- Si "cambiar" afecta a una cita, reserva, pedido, fecha, hora, turno, solicitud o gestión previa, entonces sí puede ser change_or_cancellation.
- Si el mensaje encaja con la empresa, suggestedResponse debe ser un acuse de recibo breve y decir que una persona del equipo se pondrá en contacto lo antes posible.
- En suggestedResponse, usa el motivo concreto del cliente cuando esté claro y no expongas etiquetas internas agrupadas como "cita, reunión o llamada" o "producto o servicio".
- Si el mensaje no encaja con la empresa, suggestedResponse debe indicar posible confusión y sugerir que el cliente vuelva a contactar si necesita algo relacionado con los servicios de la empresa.
- No confirmes citas, reservas, horarios, precios ni disponibilidad real.
- suggestedResponse no debe resolver, diagnosticar, prometer, pedir listas largas de datos ni implicar que la empresa ya está revisando físicamente nada.
- No uses frases como "revisaremos el problema", "revisaremos el vehículo", "revisaremos al paciente", "hemos agendado", "hemos reservado" o "queda confirmado".

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