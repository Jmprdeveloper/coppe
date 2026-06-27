import { describe, expect, it } from "vitest";

import {
  formatDateTime,
  mapInquiryRowToInquiry,
  normalizeInquiryStatus,
  normalizePriority,
  normalizeSentiment,
  type InquiryRow,
} from "../lib/inquiryUtils";

describe("inquiryUtils", () => {
  it.each([
    "new",
    "pending",
    "waiting_customer",
    "replied",
    "closed",
    "discarded",
  ] as const)("mantiene el estado válido %s", (status) => {
    expect(normalizeInquiryStatus(status)).toBe(status);
  });

  it.each(["", "open", "unknown"])(
    "usa new para el estado inválido %s",
    (status) => {
      expect(normalizeInquiryStatus(status)).toBe("new");
    }
  );

  it.each(["low", "medium", "high"] as const)(
    "mantiene la prioridad válida %s",
    (priority) => {
      expect(normalizePriority(priority)).toBe(priority);
    }
  );

  it.each([null, "", "urgent"])(
    "usa medium para la prioridad inválida %s",
    (priority) => {
      expect(normalizePriority(priority)).toBe("medium");
    }
  );

  it.each(["positive", "neutral", "negative"] as const)(
    "mantiene el sentimiento válido %s",
    (sentiment) => {
      expect(normalizeSentiment(sentiment)).toBe(sentiment);
    }
  );

  it.each([null, "", "angry"])(
    "usa No indicado para el sentimiento inválido %s",
    (sentiment) => {
      expect(normalizeSentiment(sentiment)).toBe("No indicado");
    }
  );

  describe("formatDateTime", () => {
    it("usa el fallback indicado cuando no hay fecha", () => {
      expect(formatDateTime(null, "Sin actividad")).toBe("Sin actividad");
    });

    it("usa el fallback general para una fecha inválida", () => {
      expect(formatDateTime("fecha-inválida", "Sin actividad")).toBe(
        "Fecha no disponible"
      );
    });

    it("formatea una fecha válida en español", () => {
      const value = "2026-06-27T12:30:00.000Z";
      const expected = new Intl.DateTimeFormat("es-ES", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value));

      expect(formatDateTime(value)).toBe(expected);
    });
  });

  describe("mapInquiryRowToInquiry", () => {
    const row: InquiryRow = {
      id: "inquiry-1",
      customer_id: "customer-1",
      customer_name: "Ana Pérez",
      source_channel: "Email",
      subject: "Problema con el vehículo",
      original_message: "El vehículo hace un ruido extraño.",
      ai_summary: "El cliente comunica un ruido en su vehículo.",
      ai_intent: "Solicitar revisión",
      ai_category: "service_request",
      ai_priority: "high",
      ai_language: "es",
      sentiment: "negative",
      missing_information: ["Matrícula"],
      recommended_action: "Contactar con el cliente.",
      suggested_response: "Revisaremos tu caso.",
      status: "pending",
      created_at: "2026-06-27T12:30:00.000Z",
    };

    it("mapea una fila completa", () => {
      expect(mapInquiryRowToInquiry(row)).toEqual({
        id: "inquiry-1",
        customerId: "customer-1",
        customerName: "Ana Pérez",
        sourceChannel: "Email",
        subject: "Problema con el vehículo",
        originalMessage: "El vehículo hace un ruido extraño.",
        aiSummary: "El cliente comunica un ruido en su vehículo.",
        aiIntent: "Solicitar revisión",
        aiCategory: "service_request",
        aiPriority: "high",
        aiLanguage: "es",
        sentiment: "negative",
        missingInformation: ["Matrícula"],
        recommendedAction: "Contactar con el cliente.",
        suggestedResponse: "Revisaremos tu caso.",
        status: "pending",
        createdAt: formatDateTime(row.created_at),
      });
    });

    it("aplica fallbacks y normaliza valores heredados o inválidos", () => {
      expect(
        mapInquiryRowToInquiry({
          ...row,
          customer_id: null,
          subject: null,
          ai_summary: null,
          ai_intent: null,
          ai_category: "booking",
          ai_priority: "urgent",
          ai_language: null,
          sentiment: null,
          missing_information: null,
          recommended_action: null,
          suggested_response: null,
          status: "open",
        })
      ).toMatchObject({
        customerId: "",
        subject: "Sin asunto",
        aiSummary: "Sin resumen disponible.",
        aiIntent: "No identificado",
        aiCategory: "order_or_reservation",
        aiPriority: "medium",
        aiLanguage: "No indicado",
        sentiment: "No indicado",
        missingInformation: [],
        recommendedAction: "No hay acción recomendada disponible.",
        suggestedResponse: "No hay borrador de respuesta disponible.",
        status: "new",
      });
    });
  });
});
