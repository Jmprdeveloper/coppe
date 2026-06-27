import { describe, expect, it } from "vitest";

import {
  compareAppointmentsByScheduledAt,
  getAppointmentStatusLabel,
  getAppointmentTimestamp,
  isActiveAppointmentStatus,
  isAppointmentPendingClosure,
  mapAppointmentRowToAppointment,
  normalizeAppointmentStatus,
  type AppointmentRow,
} from "../lib/appointmentUtils";
import { formatDateTime } from "../lib/inquiryUtils";

describe("appointmentUtils", () => {
  describe("normalizeAppointmentStatus", () => {
    it.each(["proposed", "confirmed", "completed", "cancelled"] as const)(
      "mantiene el estado válido %s",
      (status) => {
        expect(normalizeAppointmentStatus(status)).toBe(status);
      }
    );

    it.each([null, undefined, "", "unknown"])(
      "usa proposed para el estado inválido %s",
      (status) => {
        expect(normalizeAppointmentStatus(status)).toBe("proposed");
      }
    );
  });

  it.each([
    ["proposed", "Pendiente de confirmar"],
    ["confirmed", "Confirmada internamente"],
    ["completed", "Realizada"],
    ["cancelled", "Cancelada"],
    ["unknown", "Pendiente de confirmar"],
  ])("etiqueta %s como %s", (status, expected) => {
    expect(getAppointmentStatusLabel(status)).toBe(expected);
  });

  it.each([
    ["proposed", true],
    ["confirmed", true],
    ["completed", false],
    ["cancelled", false],
    ["unknown", true],
  ])("resuelve si el estado %s está activo", (status, expected) => {
    expect(isActiveAppointmentStatus(status)).toBe(expected);
  });

  describe("getAppointmentTimestamp", () => {
    it("convierte una fecha válida en timestamp", () => {
      expect(getAppointmentTimestamp("2026-06-27T12:00:00.000Z")).toBe(
        Date.parse("2026-06-27T12:00:00.000Z")
      );
    });

    it.each([null, undefined, "", "fecha-inválida"])(
      "devuelve null para %s",
      (value) => {
        expect(getAppointmentTimestamp(value)).toBeNull();
      }
    );
  });

  describe("isAppointmentPendingClosure", () => {
    const currentTimeMs = Date.parse("2026-06-27T12:00:00.000Z");

    it("detecta una cita activa anterior a la hora actual", () => {
      expect(
        isAppointmentPendingClosure(
          {
            scheduledAtIso: "2026-06-27T11:59:59.000Z",
            status: "confirmed",
          },
          currentTimeMs
        )
      ).toBe(true);
    });

    it("no marca una cita futura ni una cita en el instante actual", () => {
      expect(
        isAppointmentPendingClosure(
          {
            scheduledAtIso: "2026-06-27T12:00:00.000Z",
            status: "proposed",
          },
          currentTimeMs
        )
      ).toBe(false);
      expect(
        isAppointmentPendingClosure(
          {
            scheduledAtIso: "2026-06-27T12:00:01.000Z",
            status: "confirmed",
          },
          currentTimeMs
        )
      ).toBe(false);
    });

    it("ignora citas cerradas o con fecha inválida", () => {
      expect(
        isAppointmentPendingClosure(
          {
            scheduledAtIso: "2026-06-27T11:00:00.000Z",
            status: "completed",
          },
          currentTimeMs
        )
      ).toBe(false);
      expect(
        isAppointmentPendingClosure(
          {
            scheduledAtIso: "fecha-inválida",
            status: "confirmed",
          },
          currentTimeMs
        )
      ).toBe(false);
    });
  });

  it("ordena citas por fecha y coloca fechas inválidas al principio", () => {
    const appointments = [
      { scheduledAtIso: "2026-06-28T12:00:00.000Z" },
      { scheduledAtIso: "fecha-inválida" },
      { scheduledAtIso: "2026-06-27T12:00:00.000Z" },
    ];

    expect(appointments.sort(compareAppointmentsByScheduledAt)).toEqual([
      { scheduledAtIso: "fecha-inválida" },
      { scheduledAtIso: "2026-06-27T12:00:00.000Z" },
      { scheduledAtIso: "2026-06-28T12:00:00.000Z" },
    ]);
  });

  describe("mapAppointmentRowToAppointment", () => {
    const row: AppointmentRow = {
      id: "appointment-1",
      inquiry_id: "inquiry-1",
      customer_id: "customer-1",
      title: "Revisión del vehículo",
      scheduled_at: "2026-06-30T08:30:00.000Z",
      duration_minutes: 45,
      status: "confirmed",
      notes: "Comprobar frenos",
      created_at: "2026-06-27T09:00:00.000Z",
      updated_at: "2026-06-28T10:00:00.000Z",
    };

    it("mapea una fila completa", () => {
      expect(mapAppointmentRowToAppointment(row)).toEqual({
        id: "appointment-1",
        inquiryId: "inquiry-1",
        customerId: "customer-1",
        title: "Revisión del vehículo",
        scheduledAt: formatDateTime(row.scheduled_at),
        scheduledAtIso: row.scheduled_at,
        durationMinutes: 45,
        status: "confirmed",
        notes: "Comprobar frenos",
        createdAt: formatDateTime(row.created_at),
        updatedAt: formatDateTime(row.updated_at),
      });
    });

    it("aplica valores seguros a campos nulos o inválidos", () => {
      expect(
        mapAppointmentRowToAppointment({
          ...row,
          inquiry_id: null,
          customer_id: null,
          duration_minutes: null,
          status: "desconocido",
          notes: null,
        })
      ).toMatchObject({
        inquiryId: "",
        customerId: "",
        durationMinutes: 60,
        status: "proposed",
        notes: "",
      });
    });
  });
});
