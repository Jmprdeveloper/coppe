import { describe, expect, it } from "vitest";

import {
  normalizeAcknowledgementSessionHours,
  startsNewAcknowledgementSession,
} from "../lib/automaticAcknowledgementPolicy";

describe("automatic acknowledgement contact sessions", () => {
  it("uses a twelve-hour session by default", () => {
    expect(normalizeAcknowledgementSessionHours(undefined)).toBe(12);
    expect(normalizeAcknowledgementSessionHours(0)).toBe(12);
  });

  it("does not send another acknowledgement during the same session", () => {
    expect(
      startsNewAcknowledgementSession({
        previousActivityAt: "2026-07-01T06:05:00.000Z",
        currentActivityAt: new Date("2026-07-01T06:09:00.000Z"),
      }),
    ).toBe(false);
  });

  it("starts a new session after the inactivity window", () => {
    expect(
      startsNewAcknowledgementSession({
        previousActivityAt: "2026-06-29T12:34:00.000Z",
        currentActivityAt: new Date("2026-07-01T06:05:00.000Z"),
      }),
    ).toBe(true);
  });

  it("treats an inquiry without previous activity as a new session", () => {
    expect(
      startsNewAcknowledgementSession({
        previousActivityAt: null,
        currentActivityAt: new Date("2026-07-01T06:05:00.000Z"),
      }),
    ).toBe(true);
  });
});
