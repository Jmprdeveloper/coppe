export type AppointmentIntervalInput = {
  scheduledAtIso: string;
  durationMinutes: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
};

export type AppointmentInterval = {
  startsAtMs: number;
  endsAtMs: number;
  protectedStartsAtMs: number;
  protectedEndsAtMs: number;
};

export type AvailableAppointmentSlot = {
  startsAtMs: number;
  endsAtMs: number;
};

export type AvailableAppointmentSlotsInput = {
  dayStartsAtMs: number;
  durationMinutes: number;
  appointments: AppointmentIntervalInput[];
  workdayStartsAtMinutes?: number;
  workdayEndsAtMinutes?: number;
  stepMinutes?: number;
  nowMs?: number;
};

const DEFAULT_TIME_ZONE = "Europe/Madrid";

function clampMinutes(value: number | null | undefined, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(Math.round(value ?? min), min), max);
}

export function getAppointmentInterval(
  appointment: AppointmentIntervalInput,
): AppointmentInterval | null {
  const startsAtMs = Date.parse(appointment.scheduledAtIso);

  if (!Number.isFinite(startsAtMs)) {
    return null;
  }

  const durationMinutes = clampMinutes(appointment.durationMinutes, 5, 480);
  const bufferBeforeMinutes = clampMinutes(
    appointment.bufferBeforeMinutes,
    0,
    240,
  );
  const bufferAfterMinutes = clampMinutes(
    appointment.bufferAfterMinutes,
    0,
    240,
  );
  const endsAtMs = startsAtMs + durationMinutes * 60_000;

  return {
    startsAtMs,
    endsAtMs,
    protectedStartsAtMs: startsAtMs - bufferBeforeMinutes * 60_000,
    protectedEndsAtMs: endsAtMs + bufferAfterMinutes * 60_000,
  };
}

export function appointmentsOverlap(
  first: AppointmentIntervalInput,
  second: AppointmentIntervalInput,
) {
  const firstInterval = getAppointmentInterval(first);
  const secondInterval = getAppointmentInterval(second);

  if (!firstInterval || !secondInterval) {
    return false;
  }

  return (
    firstInterval.protectedStartsAtMs < secondInterval.protectedEndsAtMs &&
    secondInterval.protectedStartsAtMs < firstInterval.protectedEndsAtMs
  );
}

export function getAvailableAppointmentSlots({
  dayStartsAtMs,
  durationMinutes,
  appointments,
  workdayStartsAtMinutes = 9 * 60,
  workdayEndsAtMinutes = 18 * 60,
  stepMinutes = 30,
  nowMs = Date.now(),
}: AvailableAppointmentSlotsInput): AvailableAppointmentSlot[] {
  if (!Number.isFinite(dayStartsAtMs)) {
    return [];
  }

  const safeDurationMinutes = clampMinutes(durationMinutes, 5, 480);
  const safeStepMinutes = clampMinutes(stepMinutes, 5, 240);
  const safeWorkdayStart = clampMinutes(workdayStartsAtMinutes, 0, 24 * 60);
  const safeWorkdayEnd = clampMinutes(workdayEndsAtMinutes, 0, 24 * 60);

  if (safeWorkdayEnd <= safeWorkdayStart) {
    return [];
  }

  const slots: AvailableAppointmentSlot[] = [];

  for (
    let startMinutes = safeWorkdayStart;
    startMinutes + safeDurationMinutes <= safeWorkdayEnd;
    startMinutes += safeStepMinutes
  ) {
    const startsAtMs = dayStartsAtMs + startMinutes * 60_000;
    const endsAtMs = startsAtMs + safeDurationMinutes * 60_000;

    if (startsAtMs < nowMs) {
      continue;
    }

    const candidate = {
      scheduledAtIso: new Date(startsAtMs).toISOString(),
      durationMinutes: safeDurationMinutes,
    };

    if (
      appointments.some((appointment) =>
        appointmentsOverlap(candidate, appointment),
      )
    ) {
      continue;
    }

    slots.push({ startsAtMs, endsAtMs });
  }

  return slots;
}

export function getLocalDateKey(
  value: string | number | Date,
  timeZone = DEFAULT_TIME_ZONE,
) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function getTodayDateKey(timeZone = DEFAULT_TIME_ZONE) {
  return getLocalDateKey(new Date(), timeZone);
}

export function addDaysToDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));

  if (Number.isNaN(date.getTime())) {
    return dateKey;
  }

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function formatDateKey(
  dateKey: string,
  options: Intl.DateTimeFormatOptions = {},
) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));

  if (Number.isNaN(date.getTime())) {
    return dateKey;
  }

  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...options,
    timeZone: "UTC",
  }).format(date);
}

export function formatAppointmentTimeRange(
  appointment: Pick<
    AppointmentIntervalInput,
    "scheduledAtIso" | "durationMinutes"
  >,
  timeZone = DEFAULT_TIME_ZONE,
) {
  const interval = getAppointmentInterval(appointment);

  if (!interval) {
    return "Hora no válida";
  }

  const formatter = new Intl.DateTimeFormat("es-ES", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${formatter.format(interval.startsAtMs)}–${formatter.format(
    interval.endsAtMs,
  )}`;
}

export function getAppointmentConflictMessage(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "";

  if (
    message.includes("APPOINTMENT_CONFLICT") ||
    message.includes("exclusion constraint")
  ) {
    return "Ese profesional ya tiene otra cita o un tiempo de preparación protegido en ese intervalo. Elige otra hora o responsable.";
  }

  if (message.includes("APPOINTMENT_ASSIGNEE_NOT_MEMBER")) {
    return "El responsable seleccionado ya no pertenece al equipo.";
  }

  if (message.includes("APPOINTMENT_TIMEZONE_INVALID")) {
    return "La zona horaria seleccionada no es válida.";
  }

  return "";
}
