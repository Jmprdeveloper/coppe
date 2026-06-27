import { describe, expect, it } from "vitest";

import {
  getCategoryLabel,
  inquiryCategoryOptions,
  normalizeInquiryCategory,
} from "../lib/inquiryCategories";

describe("inquiryCategories", () => {
  it("mantiene opciones canónicas únicas y con etiqueta", () => {
    const values = inquiryCategoryOptions.map((option) => option.value);

    expect(new Set(values).size).toBe(values.length);

    for (const option of inquiryCategoryOptions) {
      expect(normalizeInquiryCategory(option.value)).toBe(option.value);
      expect(getCategoryLabel(option.value)).toBe(option.label);
      expect(option.label.trim()).not.toBe("");
    }
  });

  it.each([
    ["booking", "order_or_reservation"],
    ["cancellation", "change_or_cancellation"],
    ["complaint", "complaint_or_incident"],
    ["incident", "complaint_or_incident"],
    ["sales_inquiry", "product_service_inquiry"],
  ])("normaliza la categoría heredada %s", (category, expected) => {
    expect(normalizeInquiryCategory(category)).toBe(expected);
  });

  it("elimina espacios de una categoría canónica", () => {
    expect(normalizeInquiryCategory("  quote_request  ")).toBe("quote_request");
  });

  it.each([null, undefined, "", "unknown_category"])(
    "usa other para la categoría desconocida %s",
    (category) => {
      expect(normalizeInquiryCategory(category)).toBe("other");
      expect(getCategoryLabel(category)).toBe("Otra");
    }
  );

  it("etiqueta correctamente una categoría heredada", () => {
    expect(getCategoryLabel("complaint")).toBe("Queja o incidencia");
  });
});
