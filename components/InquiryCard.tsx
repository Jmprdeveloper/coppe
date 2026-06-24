import { ChevronRight } from "lucide-react";

import { formatSourceChannel } from "../lib/sourceChannels";
import { actionStyles } from "../lib/visualSystem";
import { classNames } from "../lib/utils";
import type { Inquiry, Priority } from "../types";

type InquiryCardProps = {
  inquiry: Inquiry;
  onOpen: (id: string) => void;
};

function getInquiryCardRail(inquiry: Inquiry) {
  if (inquiry.aiPriority === "high") {
    return "bg-[#083640]";
  }

  if (inquiry.status === "waiting_customer") {
    return "bg-[#0B3F4C]";
  }

  if (inquiry.status === "pending") {
    return "bg-[#0D4F5E]";
  }

  if (inquiry.status === "new") {
    return "bg-[#0F4C5C]";
  }

  if (inquiry.status === "closed" || inquiry.status === "discarded") {
    return "bg-[#8FB8C2]";
  }

  return "bg-[#0F4C5C]";
}

function formatPriorityLabel(priority: Priority) {
  if (priority === "high") {
    return "Alta";
  }

  if (priority === "medium") {
    return "Media";
  }

  return "Baja";
}

function formatInquiryStatus(status: Inquiry["status"]) {
  if (status === "new") {
    return "Nuevo";
  }

  if (status === "pending") {
    return "En seguimiento";
  }

  if (status === "waiting_customer") {
    return "Esperando al cliente";
  }

  if (status === "replied") {
    return "Respondido";
  }

  if (status === "closed") {
    return "Cerrado";
  }

  if (status === "discarded") {
    return "Descartado";
  }

  return "Estado no indicado";
}

function formatInquiryCategory(category: string) {
  if (category === "appointment") {
    return "Cita";
  }

  if (category === "quote") {
    return "Presupuesto";
  }

  if (category === "complaint") {
    return "Queja o incidencia";
  }

  if (category === "service_request") {
    return "Solicitud de servicio";
  }

  if (category === "change_or_cancellation") {
    return "Cambio o cancelación";
  }

  if (category === "support") {
    return "Soporte";
  }

  if (category === "other") {
    return "Otro";
  }

  return category || "Sin categoría";
}

function InquiryBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center rounded-full border border-[#D2E4E8] bg-white px-2.5 py-1 text-xs font-semibold text-[#315F69] shadow-sm shadow-[#0F4C5C]/5">
      <span className="truncate">{children}</span>
    </span>
  );
}

export function InquiryCard({ inquiry, onOpen }: InquiryCardProps) {
  const subject = inquiry.subject || "Sin asunto";
  const summary =
    inquiry.aiSummary || inquiry.originalMessage || "Sin resumen disponible";
  const sourceChannel = formatSourceChannel(inquiry.sourceChannel);

  return (
    <article className="relative w-full overflow-hidden rounded-2xl border border-[#B8D1D8] bg-white p-4 pl-5 text-left shadow-sm shadow-[#0F4C5C]/10 transition hover:border-[#8FB8C2] hover:bg-[#F7FBFC] hover:shadow-md">
      <span
        aria-hidden="true"
        className={classNames(
          "absolute inset-y-0 left-0 w-1",
          getInquiryCardRail(inquiry)
        )}
      />

      <div className="flex flex-col gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <InquiryBadge>{sourceChannel}</InquiryBadge>
            <InquiryBadge>{formatPriorityLabel(inquiry.aiPriority)}</InquiryBadge>
            <InquiryBadge>{formatInquiryCategory(inquiry.aiCategory)}</InquiryBadge>
            <InquiryBadge>{formatInquiryStatus(inquiry.status)}</InquiryBadge>
          </div>

          <h3 className="mt-3 font-bold text-[#073540]">
            {inquiry.customerName}
          </h3>

          <div className="mt-1 text-sm font-semibold text-[#153F48]">
            {subject}
          </div>

          <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#456C75]">
            {summary}
          </p>

          <div className="mt-3 text-xs font-medium text-[#6B858C]">
            {inquiry.createdAt}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onOpen(inquiry.id)}
            className={actionStyles.openCase}
            title="Abrir caso"
          >
            Abrir caso
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </article>
  );
}
