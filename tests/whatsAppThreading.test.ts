import { describe, expect, it } from "vitest";

import {
  buildWhatsAppThreadAnalysisContext,
  getWhatsAppThreadCutoffIso,
  normalizeWhatsAppThreadWindowDays,
} from "../lib/whatsAppThreading";

describe("WhatsApp conversation threading", () => {
  it("normalizes the configurable thread window", () => {
    expect(normalizeWhatsAppThreadWindowDays(undefined)).toBe(30);
    expect(normalizeWhatsAppThreadWindowDays("14")).toBe(14);
    expect(normalizeWhatsAppThreadWindowDays(0)).toBe(30);
    expect(normalizeWhatsAppThreadWindowDays(900)).toBe(365);
  });

  it("builds a stable cutoff from the configured window", () => {
    expect(
      getWhatsAppThreadCutoffIso(
        new Date("2026-06-29T12:00:00.000Z"),
        30
      )
    ).toBe("2026-05-30T12:00:00.000Z");
  });

  it("puts the latest customer message and recent history in context", () => {
    const context = buildWhatsAppThreadAnalysisContext(
      "Instalación",
      [
        {
          direction: "outbound",
          author_type: "company",
          body: "¿Qué horario prefiere?",
        },
      ],
      "El martes por la tarde.",
      "appointment"
    );

    expect(context).toContain("El martes por la tarde.");
    expect(context).toContain("¿Qué horario prefiere?");
    expect(context).toContain("appointment");
  });
});
