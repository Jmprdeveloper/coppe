export type FollowUpStatus = "pending" | "completed" | "cancelled";

export type FollowUpUrgency = "today" | "overdue" | "upcoming";

export function normalizeFollowUpStatus(status: string): FollowUpStatus {
  if (status === "pending" || status === "completed" || status === "cancelled") {
    return status;
  }

  return "pending";
}

function isSameDay(firstDate: Date, secondDate: Date) {
  return (
    firstDate.getFullYear() === secondDate.getFullYear() &&
    firstDate.getMonth() === secondDate.getMonth() &&
    firstDate.getDate() === secondDate.getDate()
  );
}

export function resolveFollowUpUrgency(
  dueAt: string | null,
  status: string,
  storedUrgency: string | null
): FollowUpUrgency {
  if (status !== "pending") {
    return "upcoming";
  }

  if (!dueAt) {
    if (
      storedUrgency === "today" ||
      storedUrgency === "overdue" ||
      storedUrgency === "upcoming"
    ) {
      return storedUrgency;
    }

    return "upcoming";
  }

  const dueDate = new Date(dueAt);

  if (Number.isNaN(dueDate.getTime())) {
    return "upcoming";
  }

  const now = new Date();

  if (dueDate < now && !isSameDay(dueDate, now)) {
    return "overdue";
  }

  if (isSameDay(dueDate, now)) {
    return dueDate < now ? "overdue" : "today";
  }

  return "upcoming";
}

export function formatFollowUpDueAt(
  value: string | null,
  urgency: FollowUpUrgency
) {
  if (!value) {
    return "Sin fecha";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Fecha no disponible";
  }

  if (urgency === "overdue") {
    return "Vencido";
  }

  if (urgency === "today") {
    return `Hoy, ${new Intl.DateTimeFormat("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date)}`;
  }

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function followUpUrgencyWeight(urgency: FollowUpUrgency) {
  if (urgency === "overdue") {
    return 3;
  }

  if (urgency === "today") {
    return 2;
  }

  return 1;
}