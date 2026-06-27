import { describe, expect, it } from "vitest";

import {
  isValidInquiryAnalysisResult,
  normalizeAiInquiryAnalysisResult,
} from "../lib/inquiryAnalysisValidation";

const validAnalysis = {
  subject: "Problema con una reparación",
  summary: "El cliente informa de un problema con su vehículo.",
  intent: "Solicitar revisión",
  category: "complaint_or_incident",
  priority: "high",
  sentiment: "negative",
  language: "es",
  missingInformation: ["Matrícula", " Fecha preferida "],
  recommendedAction: "Revisar el caso y contactar con el cliente.",
  suggestedResponse: "Una persona del equipo contactará contigo.",
};

describe("inquiryAnalysisValidation", () => {
  it("acepta y normaliza un análisis completo", () => {
    expect(normalizeAiInquiryAnalysisResult(validAnalysis)).toEqual({
      ...validAnalysis,
      missingInformation: ["Matrícula", "Fecha preferida"],
    });
    expect(isValidInquiryAnalysisResult(validAnalysis)).toBe(true);
  });

  it("normaliza categorías heredadas e idiomas escritos", () => {
    const result = normalizeAiInquiryAnalysisResult({
      ...validAnalysis,
      category: "booking",
      language: " Español ",
    });

    expect(result?.category).toBe("order_or_reservation");
    expect(result?.language).toBe("es");
  });

  it("normaliza inglés y elimina información faltante inválida", () => {
    const result = normalizeAiInquiryAnalysisResult({
      ...validAnalysis,
      language: "ENGLISH",
      missingInformation: [" Teléfono ", "", 123, null],
    });

    expect(result?.language).toBe("en");
    expect(result?.missingInformation).toEqual(["Teléfono"]);
  });

  it.each([
    null,
    [],
    "resultado",
    { ...validAnalysis, subject: "   " },
    { ...validAnalysis, category: "unknown_category" },
    { ...validAnalysis, priority: "urgent" },
    { ...validAnalysis, sentiment: "angry" },
    { ...validAnalysis, language: "fr" },
    { ...validAnalysis, missingInformation: "ninguna" },
  ])("rechaza un resultado inválido", (value) => {
    expect(normalizeAiInquiryAnalysisResult(value)).toBeNull();
    expect(isValidInquiryAnalysisResult(value)).toBe(false);
  });
});
