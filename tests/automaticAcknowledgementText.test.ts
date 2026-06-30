import { describe, expect, it } from "vitest";

import { buildAutomaticAcknowledgementText } from "../lib/automaticAcknowledgementText";

describe("automaticAcknowledgementText", () => {
  it("crea un acuse general con el nombre de la empresa", () => {
    expect(
      buildAutomaticAcknowledgementText({ companyName: "Taller COPPE" }),
    ).toContain("gracias por contactar con Taller COPPE");
  });

  it("admite una plantilla personalizada", () => {
    expect(
      buildAutomaticAcknowledgementText({
        companyName: "Taller COPPE",
        customMessage: "Gracias por escribir a {empresa}. Te responderemos.",
      }),
    ).toBe("Gracias por escribir a Taller COPPE. Te responderemos.");
  });
});
