import type { InquiryCategory, InquiryStatus, Priority } from "../types";

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

export function normalizeInquiryCategory(
  category: string | null
): InquiryCategory {
  if (
    category === "sales_inquiry" ||
    category === "appointment_request" ||
    category === "quote_request" ||
    category === "booking" ||
    category === "incident" ||
    category === "general_info" ||
    category === "follow_up" ||
    category === "cancellation" ||
    category === "complaint" ||
    category === "other"
  ) {
    return category;
  }

  return "other";
}

export function formatDateTime(value: string | null, fallback = "Fecha no disponible") {
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