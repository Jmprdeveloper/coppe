import { describe, expect, it } from "vitest";

import {
  addDaysToDateKey,
  appointmentsOverlap,
  formatAppointmentTimeRange,
  getAppointmentConflictMessage,
  getAppointmentInterval,
  getLocalDateKey,
} from "../lib/appointmentScheduling";

describe("appointmentScheduling", () => {
  it("calcula el intervalo real y el protegido", () => {
    expect(
      getAppointmentInterval({
        scheduledAtIso: "2026-06-30T08:00:00.000Z",
        durationMinutes: 60,
        bufferBeforeMinutes: 15,
        bufferAfterMinutes: 10,
      }),
    ).toEqual({
      startsAtMs: Date.parse("2026-06-30T08:00:00.000Z"),
      endsAtMs: Date.parse("2026-06-30T09:00:00.000Z"),
      protectedStartsAtMs: Date.parse("2026-06-30T07:45:00.000Z"),
      protectedEndsAtMs: Date.parse("2026-06-30T09:10:00.000Z"),
    });
  });

  it("detecta solapes por duración y por búfer", () => {
    const first = {
      scheduledAtIso: "2026-06-30T08:00:00.000Z",
      durationMinutes: 60,
      bufferAfterMinutes: 15,
    };

    expect(
      appointmentsOverlap(first, {
        scheduledAtIso: "2026-06-30T08:30:00.000Z",
        durationMinutes: 30,
      }),
    ).toBe(true);
    expect(
      appointmentsOverlap(first, {
        scheduledAtIso: "2026-06-30T09:10:00.000Z",
        durationMinutes: 30,
      }),
    ).toBe(true);
    expect(
      appointmentsOverlap(first, {
        scheduledAtIso: "2026-06-30T09:15:00.000Z",
        durationMinutes: 30,
      }),
    ).toBe(false);
  });

  it("separa los días usando la zona horaria del negocio", () => {
    expect(
      getLocalDateKey("2026-06-30T22:30:00.000Z", "Europe/Madrid"),
    ).toBe("2026-07-01");
    expect(addDaysToDateKey("2026-06-30", 1)).toBe("2026-07-01");
  });

  it("formatea la franja de hora local", () => {
    expect(
      formatAppointmentTimeRange(
        {
          scheduledAtIso: "2026-06-30T08:00:00.000Z",
          durationMinutes: 45,
        },
        "Europe/Madrid",
      ),
    ).toBe("10:00–10:45");
  });

  it("convierte el error de integridad en un mensaje útil", () => {
    expect(
      getAppointmentConflictMessage({
        message: "APPOINTMENT_CONFLICT",
      }),
    ).toContain("ya tiene otra cita");
  });
});
