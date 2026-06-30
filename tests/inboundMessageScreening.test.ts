import { describe, expect, it } from "vitest";

import { screenInboundMessage } from "../lib/inboundMessageScreening";

describe("inboundMessageScreening", () => {
  it("deja pasar una solicitud real de un cliente", () => {
    expect(
      screenInboundMessage({
        senderKey: "cliente@example.com",
        subject: "Presupuesto",
        body: "Hola, necesito presupuesto para reparar el embrague. ¿Tenéis disponibilidad esta semana?",
      }),
    ).toMatchObject({
      classification: "legitimate",
      shouldQuarantine: false,
    });
  });

  it("pone en cuarentena una captación comercial no solicitada", () => {
    expect(
      screenInboundMessage({
        senderKey: "sales@agency.example",
        subject: "SEO para vuestra web",
        body: "Somos una marketing agency especializada en SEO y backlinks. Podemos llevaros a la primera página de Google.",
      }),
    ).toMatchObject({
      classification: "commercial_solicitation",
      shouldQuarantine: true,
    });
  });

  it("distingue una captación genérica de una petición de servicio", () => {
    expect(
      screenInboundMessage({
        senderKey: "ventas@example.com",
        body: "Hola, he visto vuestra web y me gustaría ofreceros nuestros servicios de captación.",
      }).classification,
    ).toBe("commercial_solicitation");
    expect(
      screenInboundMessage({
        senderKey: "cliente@example.com",
        body: "Hola, me gustaría contratar vuestros servicios. ¿Podéis enviarme un presupuesto?",
      }).classification,
    ).toBe("legitimate");
  });

  it("detecta respuestas automáticas y remitentes bloqueados", () => {
    expect(
      screenInboundMessage({
        senderKey: "mailer-daemon@example.com",
        body: "Delivery status notification",
      }).classification,
    ).toBe("automated");
    expect(
      screenInboundMessage({
        senderKey: "blocked@example.com",
        body: "Hola",
        senderRule: "block",
      }).classification,
    ).toBe("blocked_sender");
  });

  it("la lista blanca prevalece sobre las heurísticas", () => {
    expect(
      screenInboundMessage({
        senderKey: "partner@example.com",
        body: "SEO backlinks",
        senderRule: "allow",
      }),
    ).toMatchObject({
      classification: "legitimate",
      shouldQuarantine: false,
    });
  });
});
