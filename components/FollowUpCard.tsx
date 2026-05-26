import { CheckCircle2, ChevronRight, XCircle } from "lucide-react";

import { classNames } from "../lib/utils";
import type { FollowUp } from "../types";

type FollowUpCardProps = {
  followUp: FollowUp;
  onOpen: (id: string) => void;
  onComplete?: (id: string) => void;
  onCancel?: (id: string) => void;
  isUpdating?: boolean;
};

export function FollowUpCard({
  followUp,
  onOpen,
  onComplete,
  onCancel,
  isUpdating = false,
}: FollowUpCardProps) {
  const overdue = followUp.urgency === "overdue";
  const completed = followUp.status === "completed";
  const cancelled = followUp.status === "cancelled";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div
              className={classNames(
                "h-2.5 w-2.5 shrink-0 rounded-full",
                completed
                  ? "bg-emerald-500"
                  : cancelled
                    ? "bg-slate-400"
                    : overdue
                      ? "bg-red-500"
                      : "bg-amber-500"
              )}
            />

            <p className="text-sm font-semibold text-slate-950">
              {followUp.title}
            </p>
          </div>

          <p className="mt-1 text-xs text-slate-500">
            {followUp.customerName} · {followUp.dueAt}
          </p>

          {followUp.status !== "pending" ? (
            <p className="mt-2 text-xs font-medium text-slate-500">
              Estado:{" "}
              {completed
                ? "Completado"
                : cancelled
                  ? "Cancelado"
                  : followUp.status}
            </p>
          ) : null}
        </div>

        {followUp.inquiryId ? (
          <button
            type="button"
            onClick={() => onOpen(followUp.inquiryId)}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Abrir consulta"
          >
            <ChevronRight size={16} />
          </button>
        ) : null}
      </div>

      {followUp.status === "pending" && (onComplete || onCancel) ? (
        <div className="mt-4 flex flex-wrap gap-2">
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
    </div>
  );
}