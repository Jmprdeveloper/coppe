import { MAX_ANALYSIS_MESSAGE_LENGTH } from "./inquiryAnalysisLimits";

export type WhatsAppThreadMessage = {
  direction: string;
  author_type: string;
  body: string;
};

const DEFAULT_WHATSAPP_THREAD_WINDOW_DAYS = 30;
const MAX_WHATSAPP_THREAD_WINDOW_DAYS = 365;

export function normalizeWhatsAppThreadWindowDays(value: unknown) {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return DEFAULT_WHATSAPP_THREAD_WINDOW_DAYS;
  }

  return Math.min(
    Math.round(parsedValue),
    MAX_WHATSAPP_THREAD_WINDOW_DAYS
  );
}

export function getWhatsAppThreadCutoffIso(
  now: Date,
  threadWindowDays: number
) {
  return new Date(
    now.getTime() -
      normalizeWhatsAppThreadWindowDays(threadWindowDays) * 24 * 60 * 60 * 1000
  ).toISOString();
}

export function buildWhatsAppThreadAnalysisContext(
  subject: string,
  messages: WhatsAppThreadMessage[],
  latestMessage: string,
  currentCategory: string | null
) {
  const messageBlocks = messages
    .filter((message) => message.body.trim())
    .map((message) => {
      const author =
        message.author_type === "customer"
          ? "Cliente"
          : message.author_type === "company"
            ? "Empresa"
            : "COPPE";
      const direction =
        message.direction === "inbound" ? "recibido" : "enviado";

      return `${author} (${direction}):\n${message.body.trim()}`;
    });
  const instructions = [
    "Actualiza un caso existente de WhatsApp; no estás creando uno nuevo.",
    "El último mensaje del cliente es la información más reciente y tiene máxima prioridad.",
    "Conserva la categoría principal salvo que el cliente cambie claramente de asunto.",
    "Actualiza resumen, intención, datos pendientes, acción recomendada y respuesta sugerida.",
  ].join("\n");
  const fixedBlocks = [
    instructions,
    subject.trim() ? `Asunto del caso:\n${subject.trim()}` : "",
    currentCategory
      ? `Categoría actual del caso:\n${currentCategory}`
      : "",
    `Último mensaje del cliente:\n${latestMessage.trim()}`,
  ].filter(Boolean);

  for (let startIndex = 0; startIndex <= messageBlocks.length; startIndex += 1) {
    const candidate = [
      ...fixedBlocks,
      "Historial reciente:",
      messageBlocks.slice(startIndex).join("\n\n"),
    ]
      .filter(Boolean)
      .join("\n\n")
      .trim();

    if (candidate.length <= MAX_ANALYSIS_MESSAGE_LENGTH) {
      return candidate;
    }
  }

  return latestMessage.trim().slice(0, MAX_ANALYSIS_MESSAGE_LENGTH);
}
