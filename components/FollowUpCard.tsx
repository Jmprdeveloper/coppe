import {
  CheckCircle2,
  ChevronRight,
  Pencil,
  RotateCcw,
  XCircle,
} from "lucide-react";

import { actionStyles } from "../lib/visualSystem";
import { classNames } from "../lib/utils";
import type { FollowUp } from "../types";

import { AutoDismissAlert } from "./AutoDismissAlert";

type FollowUpCardProps = {
  followUp: FollowUp;
  onOpen?: (id: string) => void;
  onEdit?: (followUp: FollowUp) => void;
  onComplete?: (id: string) => void;
  onCancel?: (id: string) => void;
  onReopen?: (id: string) => void;
  isUpdating?: boolean;
  successMessage?: string;
  onDismissSuccessMessage?: () => void;
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
      badge: "border-[#8FB8C2] bg-white text-[#0B3F4C]",
      dot: "bg-[#0B3F4C]",
      rail: "bg-[#0B3F4C]",
    };
  }

  if (followUp.status === "cancelled") {
    return {
      badge: "border-[#D2E4E8] bg-white text-[#5C7780]",
      dot: "bg-[#8FB8C2]",
      rail: "bg-[#8FB8C2]",
    };
  }

  if (followUp.urgency === "overdue") {
    return {
      badge: "border-[#6D9BA7] bg-white text-[#083640]",
      dot: "bg-[#083640]",
      rail: "bg-[#083640]",
    };
  }

  if (followUp.urgency === "today") {
    return {
      badge: "border-[#86B2BD] bg-white text-[#0B3F4C]",
      dot: "bg-[#0B3F4C]",
      rail: "bg-[#0B3F4C]",
    };
  }

  return {
    badge: "border-[#A7C9D1] bg-white text-[#0F4C5C]",
    dot: "bg-[#0F4C5C]",
    rail: "bg-[#0F4C5C]",
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
  successMessage = "",
  onDismissSuccessMessage,
}: FollowUpCardProps) {
  const completed = followUp.status === "completed";
  const cancelled = followUp.status === "cancelled";
  const pending = followUp.status === "pending";
  const cardClasses = getFollowUpCardClasses(followUp);
  const statusLabel = getFollowUpStatusLabel(followUp);
  const inquiryId = followUp.inquiryId;
  const canOpenCase = Boolean(inquiryId && onOpen);
  const hasStatusActions =
    (pending && (onComplete || onCancel)) || (!pending && onReopen);
  const hasFooterActions = canOpenCase || hasStatusActions;

  return (
    <article className="relative overflow-hidden rounded-2xl border border-[#B8D1D8] bg-white p-4 pl-5 text-left shadow-sm shadow-[#0F4C5C]/10 transition hover:border-[#8FB8C2] hover:bg-[#F7FBFC] hover:shadow-md">
      <span
        aria-hidden="true"
        className={classNames("absolute inset-y-0 left-0 w-1", cardClasses.rail)}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={classNames(
                "h-2.5 w-2.5 rounded-full",
                cardClasses.dot
              )}
            />

            <span
              className={classNames(
                "rounded-full border px-2.5 py-1 text-xs font-semibold shadow-sm shadow-[#0F4C5C]/5",
                cardClasses.badge
              )}
            >
              {statusLabel}
            </span>
          </div>

          <h3 className="mt-3 line-clamp-2 text-sm font-bold text-[#073540]">
            {followUp.title}
          </h3>

          <div className="mt-3 grid gap-2 text-xs text-[#456C75] sm:grid-cols-2">
            <div className="rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2">
              <div className="font-semibold uppercase tracking-wide text-[#5C7780]">
                Cliente
              </div>

              <div className="mt-1 truncate font-medium text-[#153F48]">
                {followUp.customerName}
              </div>
            </div>

            <div className="rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2">
              <div className="font-semibold uppercase tracking-wide text-[#5C7780]">
                Fecha
              </div>

              <div className="mt-1 truncate font-medium text-[#153F48]">
                {followUp.dueAt}
              </div>
            </div>
          </div>
        </div>

        {pending && onEdit ? (
          <button
            type="button"
            disabled={isUpdating}
            onClick={() => onEdit(followUp)}
            className="shrink-0 rounded-lg border border-[#D2E4E8] bg-white p-1.5 text-[#5C7780] transition hover:bg-[#F2FAFB] hover:text-[#0F4C5C] disabled:cursor-not-allowed disabled:opacity-60"
            title="Editar seguimiento"
          >
            <Pencil size={16} />
          </button>
        ) : null}
      </div>

      {hasFooterActions ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#EAF5F7] pt-4">
          <div className="flex flex-wrap gap-2">
            {pending && onComplete ? (
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => onComplete(followUp.id)}
                className="inline-flex min-h-9 min-w-[104px] items-center justify-center gap-2 rounded-xl border border-[#8FB8C2] bg-[#F2FAFB] px-3 py-2 text-xs font-semibold text-[#0B3F4C] transition hover:bg-[#DFF0F3] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <CheckCircle2 size={14} />
                Completar
              </button>
            ) : null}

            {pending && onCancel ? (
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => onCancel(followUp.id)}
                className="inline-flex min-h-9 min-w-[104px] items-center justify-center gap-2 rounded-xl border border-[#B8D1D8] bg-white px-3 py-2 text-xs font-semibold text-[#315F69] transition hover:bg-[#F2FAFB] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <XCircle size={14} />
                Cancelar
              </button>
            ) : null}

            {!pending && onReopen ? (
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => onReopen(followUp.id)}
                className="inline-flex min-h-9 min-w-[104px] items-center justify-center gap-2 rounded-xl border border-[#8FB8C2] bg-[#F2FAFB] px-3 py-2 text-xs font-semibold text-[#0B3F4C] transition hover:bg-[#DFF0F3] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RotateCcw size={14} />
                Reabrir
              </button>
            ) : null}
          </div>

          {canOpenCase ? (
            <button
              type="button"
              onClick={() => {
                if (inquiryId && onOpen) {
                  onOpen(inquiryId);
                }
              }}
              className={actionStyles.openCase}
              title="Abrir caso"
            >
              Abrir caso
              <ChevronRight size={14} />
            </button>
          ) : null}
        </div>
      ) : null}

      <AutoDismissAlert
        className="mt-4 font-medium"
        message={successMessage}
        onDismiss={onDismissSuccessMessage ?? (() => undefined)}
      />

      {completed || cancelled ? (
        <p className="mt-3 text-xs text-[#6B858C]">
          Estado del seguimiento: {statusLabel.toLowerCase()}.
        </p>
      ) : null}
    </article>
  );
}
