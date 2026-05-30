import { type CurrentCompany } from "./currentCompany";
import {
  type InquiryAnalysisResult,
} from "./inquiryAnalysis";
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

const OPENAI_RESPONSES_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

const inquiryAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    subject: {
      type: "string",
      description:
        "Short subject for the inquiry. Maximum 70 characters if possible.",
    },
    summary: {
      type: "string",
      description:
        "Operational summary of the customer inquiry for the company team.",
    },
    intent: {
      type: "string",
      description:
        "Clear explanation of what the customer wants to achieve.",
    },
    category: {
      type: "string",
      enum: inquiryCategoryOptions.map((option) => option.value),
      description:
        "Best category for the inquiry using only the allowed taxonomy.",
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
        "List of missing details needed to answer properly. Empty array if no key information is missing.",
    },
    recommendedAction: {
      type: "string",
      description:
        "Internal recommended next action for the company team.",
    },
    suggestedResponse: {
      type: "string",
      description:
        "Suggested customer-facing response in the same language as the customer message.",
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

function buildAllowedCategoriesText() {
  return inquiryCategoryOptions
    .map((option) => `- ${option.value}: ${option.label}`)
    .join("\n");
}

function buildSystemPrompt() {
  return `Eres el motor de análisis de consultas de COPPE, una aplicación SaaS para cualquier tipo de empresa.

Tu tarea es analizar mensajes reales de clientes y devolver exclusivamente datos estructurados.

Reglas:
- COPPE sirve a empresas de cualquier sector: talleres, clínicas, asesorías, academias, tiendas, inmobiliarias, hoteles, restaurantes, servicios profesionales, B2B, soporte, etc.
- No asumas que la empresa es turística.
- Clasifica por significado, no solo por palabras exactas.
- El cliente puede escribir con jerga, faltas, lenguaje coloquial, enfado, dialecto o expresiones ambiguas.
- Si el mensaje mezcla seguimiento y queja, prioriza queja/incidencia si hay enfado, servicio mal hecho, problema sin resolver o reclamación.
- Si el mensaje pide precio, coste, tarifa, presupuesto o propuesta, usa quote_request salvo que haya una incidencia dominante.
- Si el cliente pide ayuda técnica, acceso, cuenta, error de uso o soporte, usa support_request.
- Redacta la respuesta sugerida en el idioma del cliente.
- No inventes datos concretos que no estén en el mensaje o en el contexto de empresa.
- Si falta información importante, indícala en missingInformation.

Categorías permitidas:
${buildAllowedCategoriesText()}`;
}

function buildUserPrompt({
  customerName,
  message,
  company,
}: AnalyzeInquiryWithAiInput) {
  return `Analiza esta consulta de cliente.

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

export async function analyzeInquiryWithAiEngine(
  input: AnalyzeInquiryWithAiInput
): Promise<InquiryAnalysisResult> {
  const apiKey = getOpenAiApiKey();

  if (!apiKey) {
    throw new Error("Falta OPENAI_API_KEY.");
  }

  const response = await fetch(OPENAI_RESPONSES_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getOpenAiModel(),
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

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `OpenAI no pudo analizar la consulta: ${response.status} ${errorText}`
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

  return normalizedAnalysis;
}
