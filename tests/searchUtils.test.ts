import { describe, expect, it } from "vitest";

import { normalizeSearchText } from "../lib/searchUtils";

describe("searchUtils", () => {
  it.each([
    [null, ""],
    [undefined, ""],
    ["", ""],
    ["   ", ""],
  ])("normaliza el valor vacío %s", (value, expected) => {
    expect(normalizeSearchText(value)).toBe(expected);
  });

  it.each([
    ["  CLIENTE IMPORTANTE  ", "cliente importante"],
    ["ÁÉÍÓÚÜÑ", "aeiouun"],
    ["Reparación mecánica", "reparacion mecanica"],
    ["Área", "area"],
  ])("normaliza %s como %s", (value, expected) => {
    expect(normalizeSearchText(value)).toBe(expected);
  });

  it("mantiene números y signos significativos", () => {
    expect(normalizeSearchText("Caso #123 / Motor")).toBe(
      "caso #123 / motor"
    );
  });
});
