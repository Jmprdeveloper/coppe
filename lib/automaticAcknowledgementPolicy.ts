const DEFAULT_ACKNOWLEDGEMENT_SESSION_HOURS = 12;
const MAX_ACKNOWLEDGEMENT_SESSION_HOURS = 168;

export function normalizeAcknowledgementSessionHours(value: unknown) {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return DEFAULT_ACKNOWLEDGEMENT_SESSION_HOURS;
  }

  return Math.min(
    Math.round(parsedValue),
    MAX_ACKNOWLEDGEMENT_SESSION_HOURS,
  );
}

export function startsNewAcknowledgementSession(values: {
  previousActivityAt: string | null | undefined;
  currentActivityAt?: Date;
  sessionHours?: unknown;
}) {
  if (!values.previousActivityAt) {
    return true;
  }

  const previousTimestamp = Date.parse(values.previousActivityAt);

  if (!Number.isFinite(previousTimestamp)) {
    return true;
  }

  const currentTimestamp = (values.currentActivityAt ?? new Date()).getTime();
  const sessionMilliseconds =
    normalizeAcknowledgementSessionHours(values.sessionHours) * 60 * 60 * 1000;

  return currentTimestamp - previousTimestamp >= sessionMilliseconds;
}
