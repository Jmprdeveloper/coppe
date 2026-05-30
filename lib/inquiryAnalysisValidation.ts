import { inquiryCategoryOptions } from "./inquiryCategories";
import type {
  InquiryAnalysisResult,
  MessageLanguage,
} from "./inquiryAnalysis";
import type { InquiryCategory, Priority } from "../types";

type UnknownRecord = Record<string, unknown>;

const validInquiryCategories = new Set<InquiryCategory>(
  inquiryCategoryOptions.map((option) => option.value)
);

const legacyAiCategoryMap: Record<string, InquiryCategory> = {
  booking: "order_or_reservation",
  cancellation: "change_or_cancellation",
  complaint: "complaint_or_incident",
  incident: "complaint_or_incident",
  sales_inquiry: "product_service_inquiry",
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanRequiredString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleanValue = value.trim();

  if (!cleanValue) {
    return null;
  }

  return cleanValue;
}

function normalizeAiCategory(value: unknown): InquiryCategory | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleanValue = value.trim();

  if (validInquiryCategories.has(cleanValue as InquiryCategory)) {
    return cleanValue as InquiryCategory;
  }

  return legacyAiCategoryMap[cleanValue] ?? null;
}

function normalizeAiPriority(value: unknown): Priority | null {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  return null;
}

function normalizeAiLanguage(value: unknown): MessageLanguage | null {
  if (value === "es" || value === "en") {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const cleanValue = value.trim().toLowerCase();

  if (
    cleanValue === "spanish" ||
    cleanValue === "español" ||
    cleanValue === "espanol"
  ) {
    return "es";
  }

  if (
    cleanValue === "english" ||
    cleanValue === "inglés" ||
    cleanValue === "ingles"
  ) {
    return "en";
  }

  return null;
}

function normalizeMissingInformation(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeAiInquiryAnalysisResult(
  value: unknown
): InquiryAnalysisResult | null {
  if (!isRecord(value)) {
    return null;
  }

  const subject = cleanRequiredString(value.subject);
  const summary = cleanRequiredString(value.summary);
  const intent = cleanRequiredString(value.intent);
  const category = normalizeAiCategory(value.category);
  const priority = normalizeAiPriority(value.priority);
  const language = normalizeAiLanguage(value.language);
  const missingInformation = normalizeMissingInformation(
    value.missingInformation
  );
  const recommendedAction = cleanRequiredString(value.recommendedAction);
  const suggestedResponse = cleanRequiredString(value.suggestedResponse);

  if (
    !subject ||
    !summary ||
    !intent ||
    !category ||
    !priority ||
    !language ||
    !missingInformation ||
    !recommendedAction ||
    !suggestedResponse
  ) {
    return null;
  }

  return {
    subject,
    summary,
    intent,
    category,
    priority,
    language,
    missingInformation,
    recommendedAction,
    suggestedResponse,
  };
}

export function isValidInquiryAnalysisResult(
  value: unknown
): value is InquiryAnalysisResult {
  return normalizeAiInquiryAnalysisResult(value) !== null;
}
