"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  Inbox,
  MessageSquareText,
  Plus,
  XCircle,
} from "lucide-react";

import {
  compareAppointmentsByScheduledAt,
  getAppointmentStatusLabel,
  isAppointmentPendingClosure,
  mapAppointmentRowToAppointment,
  type AppointmentRow,
} from "../lib/appointmentUtils";
import {
  followUpUrgencyWeight,
  formatFollowUpDueAt,
  normalizeFollowUpStatus,
  resolveFollowUpUrgency,
} from "../lib/followUpUtils";
import { getCategoryLabel } from "../lib/inquiryCategories";
import { mapInquiryRowToInquiry, type InquiryRow } from "../lib/inquiryUtils";
import {
  formatSourceChannel,
  sourceChannelOptions,
} from "../lib/sourceChannels";
import { createClient } from "../lib/supabase/client";
import { classNames } from "../lib/utils";
import {
  actionStyles,
  type VisualTone,
  visualToneStyles,
} from "../lib/visualSystem";
import type { Appointment, FollowUp, Inquiry, Priority } from "../types";

import { BoardColumn } from "./BoardColumn";
import { Button } from "./Button";
import { MetricCard } from "./MetricCard";
import { PageHeader } from "./PageHeader";
import { SectionCard } from "./SectionCard";

type DashboardProps = {
  setActiveView: (view: string) => void;
  openInquiry: (id: string) => void;
};

type FollowUpRow = {
  id: string;
  title: string;
  due_at: string | null;
  status: string;
  urgency: string | null;
  inquiry_id: string | null;
  created_at: string;
  customer: {
    name: string | null;
  } | null;
};

type InquiryMessageActivityRow = {
  inquiry_id: string | null;
  created_at: string;
};

type DashboardInquiry = Inquiry & {
  latestActivityAt: string;
};

type DashboardFollowUp = FollowUp & {
  dueAtValue: string | null;
};

type DashboardAppointment = Appointment & {
  scheduledAtValue: string;
};

type ChannelSummary = {
  label: string;
  count: number;
  percentage: number;
};

function mapFollowUpRowToFollowUp(row: FollowUpRow): DashboardFollowUp {
  const status = normalizeFollowUpStatus(row.status);
  const urgency = resolveFollowUpUrgency(row.due_at, status, row.urgency);

  return {
    id: row.id,
    title: row.title,
    customerName: row.customer?.name || "Cliente no indicado",
    inquiryId: row.inquiry_id ?? "",
    dueAt: formatFollowUpDueAt(row.due_at, urgency),
    dueAtIso: row.due_at,
    dueAtValue: row.due_at,
    status,
    urgency,
  };
}

function mapAppointmentRowToDashboardAppointment(
  row: AppointmentRow
): DashboardAppointment {
  const appointment = mapAppointmentRowToAppointment(row);

  return {
    ...appointment,
    scheduledAtValue: row.scheduled_at,
  };
}

function priorityWeight(priority: Priority) {
  if (priority === "high") {
    return 3;
  }

  if (priority === "medium") {
    return 2;
  }

  return 1;
}

function appointmentDashboardWeight(
  appointment: DashboardAppointment,
  currentTimeMs: number
) {
  if (isAppointmentPendingClosure(appointment, currentTimeMs)) {
    return 3;
  }

  if (appointment.status === "proposed") {
    return 2;
  }

  if (appointment.status === "confirmed") {
    return 1;
  }

  return 0;
}

function needsCompanyAttention(inquiry: Inquiry) {
  return inquiry.status === "new" || inquiry.status === "pending";
}

function buildChannelSummaries(inquiries: DashboardInquiry[]): ChannelSummary[] {
  const countsByChannel = new Map<string, number>();

  inquiries.forEach((inquiry) => {
    const channelLabel = formatSourceChannel(inquiry.sourceChannel);

    countsByChannel.set(
      channelLabel,
      (countsByChannel.get(channelLabel) ?? 0) + 1
    );
  });

  const total = inquiries.length;

  const knownChannelSummaries = sourceChannelOptions
    .map((sourceChannelOption) => {
      const label = formatSourceChannel(sourceChannelOption.value);
      const count = countsByChannel.get(label) ?? 0;

      countsByChannel.delete(label);

      return {
        label,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      };
    })
    .filter((summary) => summary.count > 0);

  const unknownChannelSummaries = Array.from(countsByChannel.entries()).map(
    ([label, count]) => ({
      label,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    })
  );

  return [...knownChannelSummaries, ...unknownChannelSummaries]
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }

      return a.label.localeCompare(b.label);
    })
    .slice(0, 5);
}

function getMainChannelLabel(channelSummaries: ChannelSummary[]) {
  const [mainChannel] = channelSummaries;

  if (!mainChannel) {
    return "Sin actividad";
  }

  return `${mainChannel.label} · ${mainChannel.count}`;
}

function formatDashboardDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getAppointmentTone(
  appointment: DashboardAppointment,
  currentTimeMs: number
): VisualTone {
  if (isAppointmentPendingClosure(appointment, currentTimeMs)) {
    return "warning";
  }

  if (appointment.status === "confirmed") {
    return "success";
  }

  return "appointment";
}

function getDashboardInquiryCardClasses(inquiry: DashboardInquiry) {
  if (inquiry.aiPriority === "high") {
    return { rail: "bg-[#083640]" };
  }

  if (inquiry.status === "pending") {
    return { rail: "bg-[#0B3F4C]" };
  }

  if (inquiry.status === "new") {
    return { rail: "bg-[#0F4C5C]" };
  }

  return { rail: "bg-[#8FB8C2]" };
}

function getDashboardAppointmentCardClasses(tone: VisualTone) {
  if (tone === "warning") {
    return { rail: "bg-[#083640]" };
  }

  if (tone === "success") {
    return { rail: "bg-[#0B3F4C]" };
  }

  return { rail: "bg-[#0F4C5C]" };
}

function getDashboardInquiryColumnTone(
  inquiry: DashboardInquiry | undefined
): VisualTone {
  if (!inquiry) {
    return "neutral";
  }

  if (inquiry.aiPriority === "high") {
    return "danger";
  }

  if (inquiry.status === "pending") {
    return "case";
  }

  if (inquiry.status === "new") {
    return "case";
  }

  return "case";
}

function getDashboardFollowUpColumnTone(
  followUp: DashboardFollowUp | undefined
): VisualTone {
  if (!followUp) {
    return "neutral";
  }

  if (followUp.urgency === "overdue") {
    return "danger";
  }

  if (followUp.urgency === "today") {
    return "warning";
  }

  return "followUp";
}

function EmptyColumnState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#D2E4E8] bg-white px-4 py-5 text-sm leading-6 text-[#456C75] shadow-sm shadow-[#0F4C5C]/5">
      {children}
    </div>
  );
}

function DashboardBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center rounded-full border border-[#D2E4E8] bg-white px-2.5 py-1 text-xs font-semibold text-[#315F69] shadow-sm shadow-[#0F4C5C]/5">
      <span className="truncate">{children}</span>
    </span>
  );
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

function formatDashboardInquiryStatus(status: Inquiry["status"]) {
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

function DashboardInquiryCard({
  inquiry,
  onOpen,
}: {
  inquiry: DashboardInquiry;
  onOpen: (id: string) => void;
}) {
  const cardClasses = getDashboardInquiryCardClasses(inquiry);

  return (
    <article
      className={classNames(
        "relative w-full overflow-hidden rounded-2xl border border-[#B8D1D8] bg-white p-4 pl-5 text-left shadow-sm shadow-[#0F4C5C]/10 transition hover:border-[#8FB8C2] hover:bg-[#F7FBFC] hover:shadow-md"
      )}
    >
      <span
        aria-hidden="true"
        className={classNames("absolute inset-y-0 left-0 w-1", cardClasses.rail)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <DashboardBadge>
          {formatSourceChannel(inquiry.sourceChannel)}
        </DashboardBadge>

        <DashboardBadge>
          {formatPriorityLabel(inquiry.aiPriority)}
        </DashboardBadge>

        <DashboardBadge>
          {getCategoryLabel(inquiry.aiCategory)}
        </DashboardBadge>

        <DashboardBadge>
          {formatDashboardInquiryStatus(inquiry.status)}
        </DashboardBadge>
      </div>

      <div className="mt-3 font-bold text-[#073540]">
        {inquiry.customerName}
      </div>

      <div className="mt-1 text-sm font-semibold text-[#153F48]">
        {inquiry.subject || "Sin asunto"}
      </div>

      <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#456C75]">
        {inquiry.aiSummary ||
          inquiry.originalMessage ||
          "Sin resumen disponible"}
      </p>

      <div className="mt-3 text-xs font-medium text-[#6B858C]">
        Última actividad: {formatDashboardDate(inquiry.latestActivityAt)}
      </div>

      <div className="mt-4 flex justify-end">
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
    </article>
  );
}

function DashboardAppointmentCard({
  appointment,
  currentTimeMs,
  openInquiry,
}: {
  appointment: DashboardAppointment;
  currentTimeMs: number;
  openInquiry: (id: string) => void;
}) {
  const pendingClosure = isAppointmentPendingClosure(
    appointment,
    currentTimeMs
  );
  const tone = getAppointmentTone(appointment, currentTimeMs);
  const toneStyles = visualToneStyles[tone];
  const cardClasses = getDashboardAppointmentCardClasses(tone);

  return (
    <article
      className={classNames(
        "relative overflow-hidden rounded-2xl border border-[#B8D1D8] bg-white p-4 pl-5 shadow-sm shadow-[#0F4C5C]/10 transition hover:border-[#8FB8C2] hover:bg-[#F7FBFC] hover:shadow-md"
      )}
    >
      <span
        aria-hidden="true"
        className={classNames("absolute inset-y-0 left-0 w-1", cardClasses.rail)}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span
            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${toneStyles.badge}`}
          >
            {pendingClosure
              ? "Pendiente de cerrar"
              : getAppointmentStatusLabel(appointment.status)}
          </span>

          <h4 className="mt-3 font-bold text-[#073540]">
            {appointment.title}
          </h4>

          <p className="mt-1 text-sm text-[#456C75]">
            {appointment.scheduledAt}
          </p>
        </div>
      </div>

      {pendingClosure ? (
        <div className="mt-3 rounded-xl border border-[#A7C9D1] bg-[#F2FAFB] px-3 py-2 text-xs leading-5 text-[#0B3F4C]">
          Esta cita ya ha pasado y sigue activa.
        </div>
      ) : null}

      {appointment.notes ? (
        <p className="mt-3 line-clamp-2 rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-xs leading-5 text-[#456C75]">
          {appointment.notes}
        </p>
      ) : null}

      {appointment.inquiryId ? (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => openInquiry(appointment.inquiryId)}
            className={actionStyles.openCase}
          >
            Abrir caso
            <ChevronRight size={14} />
          </button>
        </div>
      ) : null}
    </article>
  );
}

function getDashboardFollowUpRail(followUp: DashboardFollowUp) {
  if (followUp.urgency === "overdue") {
    return "bg-[#083640]";
  }

  if (followUp.urgency === "today") {
    return "bg-[#0B3F4C]";
  }

  return "bg-[#0F4C5C]";
}

function getDashboardFollowUpLabel(followUp: DashboardFollowUp) {
  if (followUp.urgency === "overdue") {
    return "Vencido";
  }

  if (followUp.urgency === "today") {
    return "Para hoy";
  }

  return "Próximo";
}

function DashboardFollowUpCard({
  followUp,
  onOpen,
  onComplete,
  onCancel,
  isUpdating,
}: {
  followUp: DashboardFollowUp;
  onOpen: (id: string) => void;
  onComplete: (id: string) => void;
  onCancel: (id: string) => void;
  isUpdating: boolean;
}) {
  return (
    <article className="relative overflow-hidden rounded-2xl border border-[#B8D1D8] bg-white p-4 pl-5 text-left shadow-sm shadow-[#0F4C5C]/10 transition hover:border-[#8FB8C2] hover:bg-[#F7FBFC] hover:shadow-md">
      <span
        aria-hidden="true"
        className={classNames(
          "absolute inset-y-0 left-0 w-1",
          getDashboardFollowUpRail(followUp)
        )}
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-[#0F4C5C]" />

        <DashboardBadge>{getDashboardFollowUpLabel(followUp)}</DashboardBadge>
      </div>

      <h4 className="mt-3 line-clamp-2 text-sm font-bold text-[#073540]">
        {followUp.title}
      </h4>

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

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#D2E4E8] pt-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isUpdating}
            onClick={() => onComplete(followUp.id)}
            className="inline-flex min-h-9 min-w-[104px] items-center justify-center gap-2 rounded-xl border border-[#8FB8C2] bg-[#F2FAFB] px-3 py-2 text-xs font-semibold text-[#0B3F4C] transition hover:bg-[#DFF0F3] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <CheckCircle2 size={14} />
            Completar
          </button>

          <button
            type="button"
            disabled={isUpdating}
            onClick={() => onCancel(followUp.id)}
            className="inline-flex min-h-9 min-w-[104px] items-center justify-center gap-2 rounded-xl border border-[#B8D1D8] bg-white px-3 py-2 text-xs font-semibold text-[#315F69] transition hover:bg-[#F2FAFB] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <XCircle size={14} />
            Cancelar
          </button>
        </div>

        {followUp.inquiryId ? (
          <button
            type="button"
            onClick={() => onOpen(followUp.inquiryId)}
            className={actionStyles.openCase}
            title="Abrir caso"
          >
            Abrir caso
            <ChevronRight size={14} />
          </button>
        ) : null}
      </div>
    </article>
  );
}

function ChannelSummaryCard({
  channelSummary,
}: {
  channelSummary: ChannelSummary;
}) {
  return (
    <div className="rounded-2xl border border-[#B8D1D8] bg-white p-4 shadow-sm shadow-[#0F4C5C]/10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-[#073540]">
            {channelSummary.label}
          </div>

          <div className="mt-1 text-xs text-[#6B858C]">
            {channelSummary.count} caso{channelSummary.count === 1 ? "" : "s"}
          </div>
        </div>

        <span className="rounded-full border border-[#B8D1D8] bg-[#F2FAFB] px-2.5 py-1 text-xs font-bold text-[#0F4C5C]">
          {channelSummary.percentage}%
        </span>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#EAF5F7]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#0B3F4C] to-[#0F4C5C]"
          style={{
            width: `${Math.max(channelSummary.percentage, 4)}%`,
          }}
        />
      </div>
    </div>
  );
}

function MetricCardsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="h-[116px] animate-pulse rounded-2xl border border-[#D2E4E8] bg-[#EAF5F7] shadow-sm shadow-[#0F4C5C]/5"
        />
      ))}
    </div>
  );
}

function DashboardLoadingSkeleton() {
  return (
    <>
      <MetricCardsSkeleton />

      <SectionCard
        className="mt-6"
        title="Atención operativa"
        description="Cargando casos, citas y seguimientos..."
        tone="brand"
      >
        <div className="grid gap-4 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, columnIndex) => (
            <div
              key={columnIndex}
              className="rounded-3xl border border-[#D2E4E8] bg-white p-4 shadow-sm shadow-[#0F4C5C]/5"
            >
              <div className="mb-4 h-[76px] animate-pulse rounded-2xl border border-[#D2E4E8] bg-[#EAF5F7]" />

              <div className="space-y-3">
                {Array.from({ length: 2 }).map((__, cardIndex) => (
                  <div
                    key={cardIndex}
                    className="h-[132px] animate-pulse rounded-2xl border border-[#D2E4E8] bg-[#F2FAFB]"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        className="mt-6"
        title="Canales de entrada"
        description="Cargando distribución por canal..."
        tone="info"
      >
        <div className="grid justify-center gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,260px))]">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-[104px] animate-pulse rounded-2xl border border-[#D2E4E8] bg-[#F2FAFB] shadow-sm shadow-[#0F4C5C]/5"
            />
          ))}
        </div>
      </SectionCard>
    </>
  );
}

export function Dashboard({ setActiveView, openInquiry }: DashboardProps) {
  const supabase = useMemo(() => createClient(), []);

  const [inquiries, setInquiries] = useState<DashboardInquiry[]>([]);
  const [followUps, setFollowUps] = useState<DashboardFollowUp[]>([]);
  const [appointments, setAppointments] = useState<DashboardAppointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingFollowUpId, setUpdatingFollowUpId] = useState<string | null>(
    null
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [currentTimeMs, setCurrentTimeMs] = useState(0);

  useEffect(() => {
    async function loadDashboardData() {
      setIsLoading(true);
      setErrorMessage("");
      setSuccessMessage("");
      setCurrentTimeMs(Date.now());

      const { data: inquiriesData, error: inquiriesError } = await supabase
        .from("inquiries")
        .select(
          [
            "id",
            "customer_id",
            "customer_name",
            "source_channel",
            "subject",
            "original_message",
            "ai_summary",
            "ai_intent",
            "ai_category",
            "ai_priority",
            "ai_language",
            "sentiment",
            "missing_information",
            "recommended_action",
            "suggested_response",
            "status",
            "created_at",
          ].join(", ")
        )
        .order("created_at", { ascending: false });

      if (inquiriesError) {
        setErrorMessage(
          `No se pudieron cargar los casos del dashboard: ${
            inquiriesError.message || "sin detalle del error"
          }`
        );
        setIsLoading(false);
        return;
      }

      const inquiryRows = (inquiriesData ?? []) as unknown as InquiryRow[];
      const inquiryIds = inquiryRows.map((inquiry) => inquiry.id);
      const latestActivityByInquiryId = new Map<string, string>();

      if (inquiryIds.length > 0) {
        const {
          data: inquiryMessagesActivityData,
          error: inquiryMessagesActivityError,
        } = await supabase
          .from("inquiry_messages")
          .select("inquiry_id, created_at")
          .in("inquiry_id", inquiryIds)
          .order("created_at", { ascending: false });

        if (inquiryMessagesActivityError) {
          setErrorMessage(
            `No se pudo cargar la actividad reciente de los casos: ${
              inquiryMessagesActivityError.message || "sin detalle del error"
            }`
          );
          setIsLoading(false);
          return;
        }

        (
          (inquiryMessagesActivityData ??
            []) as unknown as InquiryMessageActivityRow[]
        ).forEach((messageActivity) => {
          if (!messageActivity.inquiry_id) {
            return;
          }

          const currentLatestActivity = latestActivityByInquiryId.get(
            messageActivity.inquiry_id
          );

          if (
            !currentLatestActivity ||
            messageActivity.created_at.localeCompare(currentLatestActivity) > 0
          ) {
            latestActivityByInquiryId.set(
              messageActivity.inquiry_id,
              messageActivity.created_at
            );
          }
        });
      }

      const { data: followUpsData, error: followUpsError } = await supabase
        .from("follow_ups")
        .select(
          [
            "id",
            "title",
            "due_at",
            "status",
            "urgency",
            "inquiry_id",
            "created_at",
            "customer:customers(name)",
          ].join(", ")
        )
        .order("due_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (followUpsError) {
        setErrorMessage(
          `No se pudieron cargar los seguimientos del dashboard: ${
            followUpsError.message || "sin detalle del error"
          }`
        );
        setIsLoading(false);
        return;
      }

      const { data: appointmentsData, error: appointmentsError } =
        await supabase
          .from("appointments")
          .select(
            [
              "id",
              "inquiry_id",
              "customer_id",
              "assigned_to",
              "title",
              "scheduled_at",
              "duration_minutes",
              "timezone",
              "location",
              "buffer_before_minutes",
              "buffer_after_minutes",
              "status",
              "notes",
              "created_at",
              "updated_at",
            ].join(", ")
          )
          .in("status", ["proposed", "confirmed"])
          .order("scheduled_at", { ascending: true });

      if (appointmentsError) {
        setErrorMessage(
          `No se pudieron cargar las citas internas del dashboard: ${
            appointmentsError.message || "sin detalle del error"
          }`
        );
        setIsLoading(false);
        return;
      }

      setInquiries(
        inquiryRows.map((inquiryRow) => {
          const inquiry = mapInquiryRowToInquiry(inquiryRow);

          return {
            ...inquiry,
            latestActivityAt:
              latestActivityByInquiryId.get(inquiry.id) ?? inquiry.createdAt,
          };
        })
      );

      setFollowUps(
        ((followUpsData ?? []) as unknown as FollowUpRow[]).map(
          mapFollowUpRowToFollowUp
        )
      );

      setAppointments(
        ((appointmentsData ?? []) as unknown as AppointmentRow[]).map(
          mapAppointmentRowToDashboardAppointment
        )
      );

      setIsLoading(false);
    }

    loadDashboardData();
  }, [supabase]);

  const handleUpdateFollowUpStatus = async (
    followUpId: string,
    status: "completed" | "cancelled"
  ) => {
    setErrorMessage("");
    setSuccessMessage("");
    setUpdatingFollowUpId(followUpId);

    const { data: updatedFollowUp, error } = await supabase
      .from("follow_ups")
      .update({ status })
      .eq("id", followUpId)
      .select(
        [
          "id",
          "title",
          "due_at",
          "status",
          "urgency",
          "inquiry_id",
          "created_at",
          "customer:customers(name)",
        ].join(", ")
      )
      .single<FollowUpRow>();

    setUpdatingFollowUpId(null);

    if (error || !updatedFollowUp) {
      setErrorMessage(
        `No se pudo actualizar el seguimiento: ${
          error?.message || "sin detalle del error"
        }`
      );
      return;
    }

    const mappedUpdatedFollowUp = mapFollowUpRowToFollowUp(updatedFollowUp);

    setFollowUps((currentFollowUps) =>
      currentFollowUps.map((followUp) =>
        followUp.id === followUpId ? mappedUpdatedFollowUp : followUp
      )
    );

    setSuccessMessage(
      status === "completed"
        ? "Seguimiento completado correctamente."
        : "Seguimiento cancelado correctamente."
    );
  };

  const newCount = inquiries.filter((inquiry) => inquiry.status === "new")
    .length;

  const pendingCount = inquiries.filter(
    (inquiry) => inquiry.status === "pending"
  ).length;

  const waitingCustomerCount = inquiries.filter(
    (inquiry) => inquiry.status === "waiting_customer"
  ).length;

  const pendingFollowUps = followUps.filter(
    (followUp) => followUp.status === "pending"
  );

  const urgentFollowUps = pendingFollowUps.filter(
    (followUp) =>
      followUp.urgency === "overdue" || followUp.urgency === "today"
  ).length;

  const appointmentsPendingClosure = appointments.filter((appointment) =>
    isAppointmentPendingClosure(appointment, currentTimeMs)
  ).length;

  const appointmentsPendingConfirmation = appointments.filter(
    (appointment) =>
      appointment.status === "proposed" &&
      !isAppointmentPendingClosure(appointment, currentTimeMs)
  ).length;

  const appointmentsNeedAttention =
    appointmentsPendingClosure + appointmentsPendingConfirmation;

  const priorityItems = [...inquiries]
    .filter((inquiry) => needsCompanyAttention(inquiry))
    .sort((a, b) => {
      const priorityDifference =
        priorityWeight(b.aiPriority) - priorityWeight(a.aiPriority);

      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      const activityDifference = b.latestActivityAt.localeCompare(
        a.latestActivityAt
      );

      if (activityDifference !== 0) {
        return activityDifference;
      }

      return b.createdAt.localeCompare(a.createdAt);
    });

  const nextFollowUps = [...pendingFollowUps]
    .sort((a, b) => {
      const urgencyDifference =
        followUpUrgencyWeight(b.urgency) - followUpUrgencyWeight(a.urgency);

      if (urgencyDifference !== 0) {
        return urgencyDifference;
      }

      const firstDate = a.dueAtValue ? new Date(a.dueAtValue).getTime() : 0;
      const secondDate = b.dueAtValue ? new Date(b.dueAtValue).getTime() : 0;

      return firstDate - secondDate;
    })
    .slice(0, 4);

  const nextAppointments = [...appointments]
    .sort((a, b) => {
      const statusDifference =
        appointmentDashboardWeight(b, currentTimeMs) -
        appointmentDashboardWeight(a, currentTimeMs);

      if (statusDifference !== 0) {
        return statusDifference;
      }

      return compareAppointmentsByScheduledAt(a, b);
    })
    .slice(0, 4);

  const visiblePriorityItems = priorityItems.slice(0, 3);
  const priorityColumnTone = getDashboardInquiryColumnTone(
    visiblePriorityItems[0]
  );
  const appointmentColumnTone = nextAppointments[0]
    ? getAppointmentTone(nextAppointments[0], currentTimeMs)
    : "neutral";
  const followUpColumnTone = getDashboardFollowUpColumnTone(nextFollowUps[0]);
  const channelSummaries = buildChannelSummaries(inquiries);
  const mainChannelLabel = getMainChannelLabel(channelSummaries);
  const hasChannelActivity = channelSummaries.length > 0;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Vista rápida de los casos, citas internas, canales y seguimientos que necesitan atención ahora."
        action={
          <Button onClick={() => setActiveView("InquiryForm")}>
            <Plus size={16} /> Registrar mensaje
          </Button>
        }
      />

      {errorMessage ? (
        <div className="mb-4 rounded-2xl border border-[#6D9BA7] bg-[#F2FAFB] px-4 py-3 text-sm font-medium text-[#083640]">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="mb-4 rounded-2xl border border-[#8FB8C2] bg-[#F2FAFB] px-4 py-3 text-sm font-medium text-[#0B3F4C]">
          {successMessage}
        </div>
      ) : null}

      {isLoading ? (
        <DashboardLoadingSkeleton />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              title="Nuevos casos"
              value={newCount}
              icon={Inbox}
              tone="case"
              caption="Recibidos sin revisar"
            />

            <MetricCard
              title="En seguimiento"
              value={pendingCount}
              icon={ClipboardList}
              tone="ai"
              caption="Necesitan respuesta o revisión"
            />

            <MetricCard
              title="Esperando al cliente"
              value={waitingCustomerCount}
              icon={MessageSquareText}
              tone="customer"
              caption="La empresa ya respondió"
            />

            <MetricCard
              title="Citas pendientes"
              value={appointmentsNeedAttention}
              icon={CalendarClock}
              tone="appointment"
              caption={
                appointmentsPendingClosure > 0
                  ? `${appointmentsPendingClosure} pendientes de cerrar`
                  : "Pendientes de validación interna"
              }
            />

            <MetricCard
              title="Seguimientos urgentes"
              value={urgentFollowUps}
              icon={Clock3}
              tone={urgentFollowUps > 0 ? "danger" : "followUp"}
              caption="Vencidos o para hoy"
            />
          </div>

          <SectionCard
            className="mt-6"
            title="Atención operativa"
            description="Casos, citas y seguimientos que requieren revisión o acción."
            tone="brand"
            action={
              <div className="flex flex-wrap gap-2 text-sm">
                <button
                  onClick={() => setActiveView("inquiries")}
                  className="font-semibold text-[#0F4C5C] hover:underline"
                >
                  Ver casos
                </button>

                <span className="text-[#8FB8C2]">·</span>

                <button
                  onClick={() => setActiveView("appointments")}
                  className="font-semibold text-[#0F4C5C] hover:underline"
                >
                  Ver agenda
                </button>

                <span className="text-[#8FB8C2]">·</span>

                <button
                  onClick={() => setActiveView("followups")}
                  className="font-semibold text-[#0F4C5C] hover:underline"
                >
                  Ver seguimientos
                </button>
              </div>
            }
          >
            <div className="grid gap-4 xl:grid-cols-3">
              <BoardColumn
                title="Casos a revisar"
                description="Entradas nuevas o en seguimiento."
                count={priorityItems.length}
                tone={priorityColumnTone}
              >
                {visiblePriorityItems.length === 0 ? (
                  <EmptyColumnState>
                    No hay casos que necesiten acción de la empresa.
                  </EmptyColumnState>
                ) : (
                  visiblePriorityItems.map((inquiry) => (
                    <DashboardInquiryCard
                      key={inquiry.id}
                      inquiry={inquiry}
                      onOpen={openInquiry}
                    />
                  ))
                )}
              </BoardColumn>

              <BoardColumn
                title="Citas internas"
                description="Validación, ejecución o cierre interno."
                count={nextAppointments.length}
                tone={appointmentColumnTone}
              >
                {nextAppointments.length === 0 ? (
                  <EmptyColumnState>
                    No hay citas internas pendientes.
                  </EmptyColumnState>
                ) : (
                  nextAppointments.map((appointment) => (
                    <DashboardAppointmentCard
                      key={appointment.id}
                      appointment={appointment}
                      currentTimeMs={currentTimeMs}
                      openInquiry={openInquiry}
                    />
                  ))
                )}
              </BoardColumn>

              <BoardColumn
                title="Seguimientos"
                description="Tareas pendientes para no perder casos."
                count={pendingFollowUps.length}
                tone={followUpColumnTone}
              >
                {nextFollowUps.length === 0 ? (
                  <EmptyColumnState>
                    No hay seguimientos pendientes.
                  </EmptyColumnState>
                ) : (
                  nextFollowUps.map((followUp) => (
                    <DashboardFollowUpCard
                      key={followUp.id}
                      followUp={followUp}
                      onOpen={openInquiry}
                      onComplete={(id) =>
                        handleUpdateFollowUpStatus(id, "completed")
                      }
                      onCancel={(id) =>
                        handleUpdateFollowUpStatus(id, "cancelled")
                      }
                      isUpdating={updatingFollowUpId === followUp.id}
                    />
                  ))
                )}
              </BoardColumn>
            </div>
          </SectionCard>

          <SectionCard
            className="mt-6"
            title="Canales de entrada"
            description="Distribución de casos por canal registrado en el espacio activo."
            tone="info"
            action={
              <div className="rounded-full border border-[#B8D1D8] bg-white px-3 py-1 text-xs font-bold text-[#315F69] shadow-sm shadow-[#0F4C5C]/5">
                Principal: {mainChannelLabel}
              </div>
            }
          >
            {hasChannelActivity ? (
              <div className="grid justify-center gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,260px))]">
                {channelSummaries.map((channelSummary) => (
                  <ChannelSummaryCard
                    key={channelSummary.label}
                    channelSummary={channelSummary}
                  />
                ))}
              </div>
            ) : (
              <EmptyColumnState>
                Todavía no hay actividad por canal. Cuando entren mensajes por
                Formulario web, Chat web, WhatsApp u otros canales, aparecerán
                aquí.
              </EmptyColumnState>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
