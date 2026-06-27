import { describe, expect, it } from "vitest";

import {
  getCustomerDatabaseErrorMessage,
  isValidEmail,
  isValidPhone,
  normalizePhoneForComparison,
} from "../lib/customerValidation";

describe("customerValidation", () => {
  describe("isValidEmail", () => {
    it.each([
      "cliente@example.com",
      "nombre+etiqueta@subdominio.example.es",
    ])("acepta el email válido %s", (email) => {
      expect(isValidEmail(email)).toBe(true);
    });

    it.each([
      "",
      "cliente",
      "cliente@",
      "@example.com",
      "cliente @example.com",
      "cliente@example",
    ])("rechaza el email inválido %s", (email) => {
      expect(isValidEmail(email)).toBe(false);
    });
  });

  describe("normalizePhoneForComparison", () => {
    it.each([
      ["619 191 919", "619191919"],
      ["+34 619 191 919", "619191919"],
      ["0034 619 191 919", "619191919"],
      ["34 619 191 919", "619191919"],
      ["+351 912 345 678", "351912345678"],
      [null, ""],
      [undefined, ""],
    ])("normaliza %s como %s", (phone, expected) => {
      expect(normalizePhoneForComparison(phone)).toBe(expected);
    });
  });

  describe("isValidPhone", () => {
    it.each([
      "619191919",
      "+34 619 191 919",
      "0034 (619) 191-919",
      "912.345.678",
    ])("acepta el teléfono válido %s", (phone) => {
      expect(isValidPhone(phone)).toBe(true);
    });

    it.each([
      "",
      "   ",
      "123456",
      "1234567890123456",
      "619ABC919",
      "619/191/919",
    ])("rechaza el teléfono inválido %s", (phone) => {
      expect(isValidPhone(phone)).toBe(false);
    });
  });

  describe("getCustomerDatabaseErrorMessage", () => {
    it("traduce el conflicto de email", () => {
      expect(
        getCustomerDatabaseErrorMessage(
          "duplicate key customers_company_email_unique"
        )
      ).toBe("Ya existe un cliente con ese email en esta empresa.");
    });

    it.each([
      "customers_company_phone_digits_unique",
      "customers_company_phone_normalized_unique",
    ])("traduce el conflicto de teléfono %s", (constraint) => {
      expect(getCustomerDatabaseErrorMessage(constraint)).toBe(
        "Ya existe un cliente con ese teléfono en esta empresa."
      );
    });

    it("mantiene un error desconocido", () => {
      expect(getCustomerDatabaseErrorMessage("Error inesperado")).toBe(
        "Error inesperado"
      );
    });

    it("proporciona un fallback para mensajes vacíos", () => {
      expect(getCustomerDatabaseErrorMessage("")).toBe("sin detalle del error");
    });
  });
});
