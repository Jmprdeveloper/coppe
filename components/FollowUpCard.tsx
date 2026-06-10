import {
  CheckCircle2,
  ChevronRight,
  Pencil,
  RotateCcw,
  XCircle,
} from "lucide-react";

import { classNames } from "../lib/utils";
import type { FollowUp } from "../types";

type FollowUpCardProps = {
  followUp: FollowUp;
  onOpen?: (id: string) => void;
  onEdit?: (followUp: FollowUp) => void;
  onComplete?: (id: string) => void;
  onCancel?: (id: string) => void;
  onReopen?: (id: string) => void;
  isUpdating?: boolean;
};

function getFollowUpStatusLabel(followUp: FollowUp) {
  if (followUp.status === "completed") {
    return "Completado";
  }

  if (followUp.status === "cancelled") {
    return "Cancelado";
  }

  if (followUp.urgency === "overdue") {
    return "Vencido";
  }

  if (followUp.urgency === "today") {
    return "Para hoy";
  }

  return "Próximo";
}

function getFollowUpCardClasses(followUp: FollowUp) {
  if (followUp.status === "completed") {
    return {
      wrapper:
        "border-emerald-200 bg-white shadow-sm shadow-emerald-100/50",
      badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
      dot: "bg-emerald-500",
    };
  }

  if (followUp.status === "cancelled") {
    return {
      wrapper: "border-slate-200 bg-white shadow-sm shadow-slate-100/80",
      badge: "border-slate-200 bg-slate-50 text-slate-600",
      dot: "bg-slate-400",
    };
  }

  if (followUp.urgency === "overdue") {
    return {
      wrapper: "border-red-200 bg-white shadow-sm shadow-red-100/70",
      badge: "border-red-200 bg-red-50 text-red-700",
      dot: "bg-red-500",
    };
  }

  if (followUp.urgency === "today") {
    return {
      wrapper: "border-amber-200 bg-white shadow-sm shadow-amber-100/70",
      badge: "border-amber-200 bg-amber-50 text-amber-700",
      dot: "bg-amber-500",
    };
  }

  return {
    wrapper: "border-sky-200 bg-white shadow-sm shadow-sky-100/70",
    badge: "border-sky-200 bg-sky-50 text-sky-700",
    dot: "bg-sky-500",
  };
}

export function FollowUpCard({
  followUp,
  onOpen,
  onEdit,
  onComplete,
  onCancel,
  onReopen,
  isUpdating = false,
}: FollowUpCardProps) {
  const completed = followUp.status === "completed";
  const cancelled = followUp.status === "cancelled";
  const pending = followUp.status === "pending";
  const cardClasses = getFollowUpCardClasses(followUp);
  const statusLabel = getFollowUpStatusLabel(followUp);

  return (
    <article
      className={classNames(
        "rounded-2xl border p-4 transition",
        cardClasses.wrapper
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={classNames("h-2.5 w-2.5 rounded-full", cardClasses.dot)} />

            <span
              className={classNames(
                "rounded-full border px-2.5 py-1 text-xs font-semibold",
                cardClasses.badge
              )}
            >
              {statusLabel}
            </span>
          </div>

          <h3 className="mt-3 line-clamp-2 text-sm font-bold text-slate-950">
            {followUp.title}
          </h3>

          <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="font-semibold uppercase tracking-wide text-slate-400">
                Cliente
              </div>
              <div className="mt-1 truncate font-medium text-slate-700">
                {followUp.customerName}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="font-semibold uppercase tracking-wide text-slate-400">
                Fecha
              </div>
              <div className="mt-1 truncate font-medium text-slate-700">
                {followUp.dueAt}
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {pending && onEdit ? (
            <button
              type="button"
              disabled={isUpdating}
              onClick={() => onEdit(followUp)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              title="Editar seguimiento"
            >
              <Pencil size={16} />
            </button>
          ) : null}

          {followUp.inquiryId && onOpen ? (
            <button
              type="button"
              onClick={() => onOpen(followUp.inquiryId)}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#0F4C5C] hover:bg-slate-100"
              title="Abrir caso"
            >
              Abrir caso
              <ChevronRight size={14} />
            </button>
          ) : null}
        </div>
      </div>

      {pending && (onComplete || onCancel) ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          {onComplete ? (
            <button
              type="button"
              disabled={isUpdating}
              onClick={() => onComplete(followUp.id)}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CheckCircle2 size={14} />
              Completar
            </button>
          ) : null}

          {onCancel ? (
            <button
              type="button"
              disabled={isUpdating}
              onClick={() => onCancel(followUp.id)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <XCircle size={14} />
              Cancelar
            </button>
          ) : null}
        </div>
      ) : null}

      {!pending && onReopen ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            disabled={isUpdating}
            onClick={() => onReopen(followUp.id)}
            className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RotateCcw size={14} />
            Reabrir
          </button>
        </div>
      ) : null}

      {completed || cancelled ? (
        <p className="mt-3 text-xs text-slate-500">
          Estado del seguimiento: {statusLabel.toLowerCase()}.
        </p>
      ) : null}
    </article>
  );
}
