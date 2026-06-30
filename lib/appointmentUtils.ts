import type { Appointment, AppointmentStatus } from "../types";
import { formatDateTime } from "./inquiryUtils";

export type AppointmentRow = {
  id: string;
  inquiry_id: string | null;
  customer_id: string | null;
  assigned_to: string | null;
  title: string;
  scheduled_at: string;
  duration_minutes: number | null;
  timezone: string | null;
  location: string | null;
  buffer_before_minutes: number | null;
  buffer_after_minutes: number | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type AppointmentTiming = Pick<Appointment, "scheduledAtIso" | "status">;

export function normalizeAppointmentStatus(
  status: string | null | undefined
): AppointmentStatus {
  if (
    status === "proposed" ||
    status === "confirmed" ||
    status === "completed" ||
    status === "cancelled"
  ) {
    return status;
  }

  return "proposed";
}

export function getAppointmentStatusLabel(status: string | null | undefined) {
  const normalizedStatus = normalizeAppointmentStatus(status);

  if (normalizedStatus === "proposed") {
    return "Pendiente de confirmar";
  }

  if (normalizedStatus === "confirmed") {
    return "Confirmada internamente";
  }

  if (normalizedStatus === "completed") {
    return "Realizada";
  }

  if (normalizedStatus === "cancelled") {
    return "Cancelada";
  }

  return "Sin estado";
}

export function isActiveAppointmentStatus(
  status: string | null | undefined
) {
  const normalizedStatus = normalizeAppointmentStatus(status);

  return normalizedStatus === "proposed" || normalizedStatus === "confirmed";
}

export function getAppointmentTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return null;
  }

  return timestamp;
}

export function isAppointmentPendingClosure(
  appointment: AppointmentTiming,
  currentTimeMs = Date.now()
) {
  if (!isActiveAppointmentStatus(appointment.status)) {
    return false;
  }

  const appointmentTimeMs = getAppointmentTimestamp(
    appointment.scheduledAtIso
  );

  if (appointmentTimeMs === null) {
    return false;
  }

  return appointmentTimeMs < currentTimeMs;
}

export function compareAppointmentsByScheduledAt(
  first: Pick<Appointment, "scheduledAtIso">,
  second: Pick<Appointment, "scheduledAtIso">
) {
  const firstTimeMs = getAppointmentTimestamp(first.scheduledAtIso) ?? 0;
  const secondTimeMs = getAppointmentTimestamp(second.scheduledAtIso) ?? 0;

  return firstTimeMs - secondTimeMs;
}

export function mapAppointmentRowToAppointment(
  row: AppointmentRow
): Appointment {
  return {
    id: row.id,
    inquiryId: row.inquiry_id ?? "",
    customerId: row.customer_id ?? "",
    assignedTo: row.assigned_to ?? "",
    title: row.title,
    scheduledAt: formatDateTime(row.scheduled_at),
    scheduledAtIso: row.scheduled_at,
    durationMinutes: row.duration_minutes ?? 60,
    timezone: row.timezone?.trim() || "Europe/Madrid",
    location: row.location ?? "",
    bufferBeforeMinutes: row.buffer_before_minutes ?? 0,
    bufferAfterMinutes: row.buffer_after_minutes ?? 0,
    status: normalizeAppointmentStatus(row.status),
    notes: row.notes ?? "",
    createdAt: formatDateTime(row.created_at),
    updatedAt: formatDateTime(row.updated_at),
  };
}
