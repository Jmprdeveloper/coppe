import type { Appointment, AppointmentStatus } from "../types";
import { formatDateTime } from "./inquiryUtils";

export type AppointmentRow = {
  id: string;
  inquiry_id: string | null;
  customer_id: string | null;
  title: string;
  scheduled_at: string;
  duration_minutes: number | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

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
    return "Propuesta";
  }

  if (normalizedStatus === "confirmed") {
    return "Confirmada";
  }

  if (normalizedStatus === "completed") {
    return "Completada";
  }

  if (normalizedStatus === "cancelled") {
    return "Cancelada";
  }

  return "Sin estado";
}

export function mapAppointmentRowToAppointment(
  row: AppointmentRow
): Appointment {
  return {
    id: row.id,
    inquiryId: row.inquiry_id ?? "",
    customerId: row.customer_id ?? "",
    title: row.title,
    scheduledAt: formatDateTime(row.scheduled_at),
    scheduledAtIso: row.scheduled_at,
    durationMinutes: row.duration_minutes ?? 60,
    status: normalizeAppointmentStatus(row.status),
    notes: row.notes ?? "",
    createdAt: formatDateTime(row.created_at),
    updatedAt: formatDateTime(row.updated_at),
  };
}