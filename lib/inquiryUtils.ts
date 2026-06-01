import type {
  Inquiry,
  InquiryStatus,
  Priority,
} from "../types";
import { normalizeInquiryCategory } from "./inquiryCategories";

export { normalizeInquiryCategory };

export type InquiryRow = {
  id: string;
  customer_id: string | null;
  customer_name: string;
  source_channel: string;
  subject: string | null;
  original_message: string;
  ai_summary: string | null;
  ai_intent: string | null;
  ai_category: string | null;
  ai_priority: string | null;
  ai_language: string | null;
  sentiment: string | null;
  missing_information: string[] | null;
  recommended_action: string | null;
  suggested_response: string | null;
  status: string;
  created_at: string;
};

export function normalizeInquiryStatus(status: string): InquiryStatus {
  if (
    status === "new" ||
    status === "pending" ||
    status === "replied" ||
    status === "closed" ||
    status === "discarded"
  ) {
    return status;
  }

  return "new";
}

export function normalizePriority(priority: string | null): Priority {
  if (priority === "low" || priority === "medium" || priority === "high") {
    return priority;
  }

  return "medium";
}

export function formatDateTime(
  value: string | null,
  fallback = "Fecha no disponible"
) {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Fecha no disponible";
  }

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function mapInquiryRowToInquiry(row: InquiryRow): Inquiry {
  return {
    id: row.id,
    customerId: row.customer_id ?? "",
    customerName: row.customer_name,
    sourceChannel: row.source_channel,
    subject: row.subject ?? "Sin asunto",
    originalMessage: row.original_message,
    aiSummary: row.ai_summary ?? "Sin resumen disponible.",
    aiIntent: row.ai_intent ?? "No identificado",
    aiCategory: normalizeInquiryCategory(row.ai_category),
    aiPriority: normalizePriority(row.ai_priority),
    aiLanguage: row.ai_language ?? "No indicado",
    sentiment: row.sentiment ?? "No indicado",
    missingInformation: row.missing_information ?? [],
    recommendedAction:
      row.recommended_action ?? "No hay acción recomendada disponible.",
    suggestedResponse:
      row.suggested_response ?? "No hay borrador de respuesta disponible.",
    status: normalizeInquiryStatus(row.status),
    createdAt: formatDateTime(row.created_at),
  };
}