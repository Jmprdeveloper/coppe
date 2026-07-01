import { describe, expect, it } from "vitest";

import { analyzeInquiry } from "../lib/inquiryAnalysis";
import type { CurrentCompany } from "../lib/currentCompany";
import { buildWhatsAppThreadAnalysisContext } from "../lib/whatsAppThreading";

const serviceCompany = {
  id: "company-1",
  name: "Servicios Generales Demo",
  sector: "servicios profesionales",
  description: "Empresa generalista de servicios profesionales.",
  tone: "profesional y cercano",
  language: "es",
  userRole: "owner",
} as CurrentCompany;

const englishServiceCompany = {
  ...serviceCompany,
  id: "company-2",
  name: "General Services Demo",
  sector: "professional services",
  description: "General professional services company.",
  language: "en",
} as CurrentCompany;

const automotiveCompany = {
  ...serviceCompany,
  id: "company-automotive",
  name: "Taller del Pollo",
  sector: "Taller mecánico",
  description:
    "Reparación de todo tipo de vehículos y de todas las marcas.",
} as CurrentCompany;

describe("inquiryAnalysis", () => {
  it("reformula posesivos de primera persona en respuestas sugeridas en español", () => {
    const result = analyzeInquiry({
      customerName: "jmpr",
      message: "Hola, necesito arreglar mi moto, no arranca.",
      company: serviceCompany,
    });

    expect(result.suggestedResponse).toContain("arreglar tu moto");
    expect(result.suggestedResponse).not.toContain("arreglar mi moto");
    expect(result.summary).toContain("arreglar su moto");
    expect(result.intent).toContain("arreglar su moto");
  });

  it("mantiene la corrección de perspectiva en sectores generalistas", () => {
    const result = analyzeInquiry({
      customerName: "Ana",
      message: "Hola, necesito revisar mi contrato.",
      company: serviceCompany,
    });

    expect(result.suggestedResponse).toContain("revisar tu contrato");
    expect(result.suggestedResponse).not.toContain("revisar mi contrato");
    expect(result.summary).toContain("revisar su contrato");
    expect(result.intent).toContain("revisar su contrato");
  });

  it("reformula posesivos de primera persona en respuestas sugeridas en inglés", () => {
    const result = analyzeInquiry({
      customerName: "Alex",
      message: "Hi, I need to review my contract.",
      company: englishServiceCompany,
    });

    expect(result.suggestedResponse).toContain("review your contract");
    expect(result.suggestedResponse).not.toContain("review my contract");
    expect(result.summary).toContain("review their contract");
    expect(result.intent).toContain("review their contract");
  });

  it("analiza solo el último turno y detecta un cambio fuera de la actividad", () => {
    const message = buildWhatsAppThreadAnalysisContext(
      "Avería de moto",
      [
        {
          direction: "inbound",
          author_type: "customer",
          body: "Hola, necesito arreglar mi moto, no arranca.",
        },
        {
          direction: "outbound",
          author_type: "company",
          body: "Hemos recibido tu solicitud.",
        },
      ],
      "Hola, necesito habitación para cuatro personas este fin de semana.",
      "service_request",
    );
    const result = analyzeInquiry({
      customerName: "jmpr",
      message,
      company: automotiveCompany,
    });

    expect(result.category).toBe("other");
    expect(result.subject).toBe("Posible confusión de servicio");
    expect(result.summary).toContain("reserva de alojamiento");
    expect(result.intent).toContain("último mensaje");
    expect(result.suggestedResponse).toContain("confusión");
    expect(result.suggestedResponse).not.toContain("Historial reciente");
    expect(result.suggestedResponse).not.toContain(
      "Una persona de nuestro equipo",
    );
  });

  it("responde a un saludo sin inventar una necesidad", () => {
    const result = analyzeInquiry({
      customerName: "Ana",
      message: "Hola",
      company: automotiveCompany,
    });

    expect(result.category).toBe("general_info");
    expect(result.priority).toBe("low");
    expect(result.summary).toContain("todavía no ha indicado");
    expect(result.missingInformation).toEqual(["Motivo de la consulta"]);
    expect(result.suggestedResponse).toBe(
      "Hola Ana, gracias por contactar con Taller del Pollo. ¿En qué podemos ayudarte?",
    );
  });
});
