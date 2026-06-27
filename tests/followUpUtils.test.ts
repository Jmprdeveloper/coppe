import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  followUpUrgencyWeight,
  formatFollowUpDueAt,
  normalizeFollowUpStatus,
  resolveFollowUpUrgency,
} from "../lib/followUpUtils";

describe("followUpUtils", () => {
  describe("normalizeFollowUpStatus", () => {
    it.each(["pending", "completed", "cancelled"] as const)(
      "mantiene el estado válido %s",
      (status) => {
        expect(normalizeFollowUpStatus(status)).toBe(status);
      }
    );

    it.each(["", "unknown"])(
      "usa pending para el estado inválido %s",
      (status) => {
        expect(normalizeFollowUpStatus(status)).toBe("pending");
      }
    );
  });

  describe("resolveFollowUpUrgency", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-27T12:00:00.000Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("usa upcoming cuando el seguimiento no está pendiente", () => {
      expect(
        resolveFollowUpUrgency(
          "2026-06-25T12:00:00.000Z",
          "completed",
          "overdue"
        )
      ).toBe("upcoming");
    });

    it.each(["today", "overdue", "upcoming"] as const)(
      "conserva la urgencia almacenada %s cuando no hay fecha",
      (urgency) => {
        expect(resolveFollowUpUrgency(null, "pending", urgency)).toBe(urgency);
      }
    );

    it("usa upcoming sin fecha y con urgencia desconocida", () => {
      expect(resolveFollowUpUrgency(null, "pending", "urgent")).toBe("upcoming");
    });

    it("usa upcoming para una fecha inválida", () => {
      expect(
        resolveFollowUpUrgency("fecha-inválida", "pending", "overdue")
      ).toBe("upcoming");
    });

    it("clasifica fechas anteriores como vencidas", () => {
      expect(
        resolveFollowUpUrgency(
          "2026-06-25T12:00:00.000Z",
          "pending",
          null
        )
      ).toBe("overdue");
    });

    it("distingue horas pasadas y futuras del día actual", () => {
      expect(
        resolveFollowUpUrgency(
          "2026-06-27T10:00:00.000Z",
          "pending",
          null
        )
      ).toBe("overdue");
      expect(
        resolveFollowUpUrgency(
          "2026-06-27T14:00:00.000Z",
          "pending",
          null
        )
      ).toBe("today");
    });

    it("clasifica fechas posteriores como próximas", () => {
      expect(
        resolveFollowUpUrgency(
          "2026-06-29T12:00:00.000Z",
          "pending",
          null
        )
      ).toBe("upcoming");
    });
  });

  describe("formatFollowUpDueAt", () => {
    it("gestiona fechas ausentes e inválidas", () => {
      expect(formatFollowUpDueAt(null, "upcoming")).toBe("Sin fecha");
      expect(formatFollowUpDueAt("fecha-inválida", "upcoming")).toBe(
        "Fecha no disponible"
      );
    });

    it("etiqueta los seguimientos vencidos", () => {
      expect(
        formatFollowUpDueAt("2026-06-27T10:00:00.000Z", "overdue")
      ).toBe("Vencido");
    });

    it("antepone Hoy a un seguimiento del día actual", () => {
      expect(
        formatFollowUpDueAt("2026-06-27T14:00:00.000Z", "today")
      ).toMatch(/^Hoy, /);
    });

    it("formatea una fecha próxima en español", () => {
      const value = "2026-06-29T14:00:00.000Z";
      const expected = new Intl.DateTimeFormat("es-ES", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value));

      expect(formatFollowUpDueAt(value, "upcoming")).toBe(expected);
    });
  });

  it.each([
    ["overdue", 3],
    ["today", 2],
    ["upcoming", 1],
  ] as const)("asigna peso %s a la urgencia", (urgency, expected) => {
    expect(followUpUrgencyWeight(urgency)).toBe(expected);
  });
});
