import { describe, expect, it } from "vitest";

import {
  formatSourceChannel,
  normalizeSourceChannelValue,
  sourceChannelOptions,
} from "../lib/sourceChannels";

describe("sourceChannels", () => {
  it("mantiene las opciones canónicas", () => {
    for (const option of sourceChannelOptions) {
      expect(formatSourceChannel(option.value)).toBe(option.label);
    }
  });

  it.each([
    ["correo electrónico", "Email"],
    ["E-MAIL", "Email"],
    ["llamada", "Teléfono"],
    ["whats-app", "WhatsApp"],
    ["public_intake", "Formulario web"],
    ["CHAT-WEB", "Chat web"],
    ["Perfil de empresa de Google", "Perfil de Empresa de Google"],
    ["in person", "Presencial"],
    ["portal-externo", "Portal externo"],
  ])("formatea %s como %s", (value, expected) => {
    expect(formatSourceChannel(value)).toBe(expected);
  });

  it.each([null, undefined, "", "   "])(
    "usa la etiqueta vacía para %s",
    (value) => {
      expect(formatSourceChannel(value)).toBe("Canal no indicado");
    }
  );

  it("mantiene un canal desconocido para no perder información", () => {
    expect(formatSourceChannel("Marketplace privado")).toBe(
      "Marketplace privado"
    );
  });

  it("normaliza alias a valores admitidos", () => {
    expect(normalizeSourceChannelValue("correo")).toBe("Email");
    expect(normalizeSourceChannelValue("chat")).toBe("Chat web");
  });

  it("usa el fallback indicado para canales desconocidos", () => {
    expect(normalizeSourceChannelValue("Canal privado", "Otro")).toBe("Otro");
  });
});
