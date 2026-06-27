import { describe, expect, it } from "vitest";

import {
  buildRequestBodyTooLargeResponse,
  getRequestContentLength,
  readRequestJsonWithLimit,
  readRequestTextWithLimit,
  RequestBodyTooLargeError,
} from "../lib/requestBodyLimits";

describe("requestBodyLimits", () => {
  describe("getRequestContentLength", () => {
    it("lee una longitud válida", () => {
      const request = new Request("https://coppe.test", {
        headers: { "content-length": " 42 " },
      });

      expect(getRequestContentLength(request)).toBe(42);
    });

    it.each(["", "-1", "abc", "Infinity"])(
      "ignora una longitud inválida: %s",
      (contentLength) => {
        const request = new Request("https://coppe.test", {
          headers: { "content-length": contentLength },
        });

        expect(getRequestContentLength(request)).toBeNull();
      }
    );
  });

  describe("readRequestTextWithLimit", () => {
    it("devuelve vacío cuando no hay cuerpo", async () => {
      const request = new Request("https://coppe.test");

      await expect(readRequestTextWithLimit(request, 10)).resolves.toBe("");
    });

    it("acepta un cuerpo dentro del límite real de bytes", async () => {
      const request = new Request("https://coppe.test", {
        method: "POST",
        body: "á",
      });

      await expect(readRequestTextWithLimit(request, 2)).resolves.toBe("á");
    });

    it("rechaza por la cabecera content-length antes de leer", async () => {
      const request = new Request("https://coppe.test", {
        method: "POST",
        headers: { "content-length": "20" },
        body: "hola",
      });

      await expect(readRequestTextWithLimit(request, 10)).rejects.toEqual(
        new RequestBodyTooLargeError(10)
      );
    });

    it("rechaza un cuerpo cuyo flujo supera el límite real", async () => {
      const request = new Request("https://coppe.test", {
        method: "POST",
        body: "á",
      });

      await expect(readRequestTextWithLimit(request, 1)).rejects.toEqual(
        new RequestBodyTooLargeError(1)
      );
    });
  });

  describe("readRequestJsonWithLimit", () => {
    it("parsea JSON dentro del límite", async () => {
      const request = new Request("https://coppe.test", {
        method: "POST",
        body: JSON.stringify({ ok: true }),
      });

      await expect(
        readRequestJsonWithLimit<{ ok: boolean }>(request, 100)
      ).resolves.toEqual({ ok: true });
    });

    it("mantiene el error de JSON malformado", async () => {
      const request = new Request("https://coppe.test", {
        method: "POST",
        body: "{",
      });

      await expect(readRequestJsonWithLimit(request, 100)).rejects.toBeInstanceOf(
        SyntaxError
      );
    });
  });

  it("construye una respuesta HTTP 413", async () => {
    const response = buildRequestBodyTooLargeResponse(256);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "El cuerpo de la petición no puede superar 256 bytes.",
    });
  });
});
