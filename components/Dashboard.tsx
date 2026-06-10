"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Inbox,
  MessageSquareText,
  Plus,
  type LucideIcon,
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
import { mapInquiryRowToInquiry, type InquiryRow } from "../lib/inquiryUtils";
import {
  formatSourceChannel,
  sourceChannelOptions,
} from "../lib/sourceChannels";
import { createClient } from "../lib/supabase/client";
import type { Appointment, FollowUp, Inquiry, Priority } from "../types";

import { Button } from "./Button";
import { CategoryBadge } from "./CategoryBadge";
import { FollowUpCard } from "./FollowUpCard";
import { PageHeader } from "./PageHeader";
import { PriorityBadge } from "./PriorityBadge";
import { StatusBadge } from "./StatusBadge";

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

type DashboardTheme = "amber" | "sky" | "emerald" | "slate" | "red" | "teal";

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

function getThemeClasses(theme: DashboardTheme) {
  if (theme === "red") {
    return {
      card: "border-slate-200 bg-white",
      icon: "bg-rose-50 text-rose-600",
      text: "text-slate-950",
      muted: "text-slate-500",
      column: "border-slate-200 bg-[#FBF8F8]",
      columnHeader: "border border-rose-100 bg-white text-slate-950",
      badge: "bg-rose-50 text-rose-700",
      bar: "bg-rose-400",
    };
  }

  if (theme === "amber") {
    return {
      card: "border-slate-200 bg-white",
      icon: "bg-stone-100 text-stone-600",
      text: "text-slate-950",
      muted: "text-slate-500",
      column: "border-slate-200 bg-[#FAF9F5]",
      columnHeader: "border border-stone-100 bg-white text-slate-950",
      badge: "bg-stone-100 text-stone-700",
      bar: "bg-stone-400",
    };
  }

  if (theme === "sky") {
    return {
      card: "border-slate-200 bg-white",
      icon: "bg-[#EAF4F6] text-[#0F4C5C]",
      text: "text-slate-950",
      muted: "text-slate-500",
      column: "border-slate-200 bg-[#F6FAFB]",
      columnHeader: "border border-cyan-100 bg-white text-slate-950",
      badge: "bg-[#EAF4F6] text-[#0F4C5C]",
      bar: "bg-[#0F4C5C]",
    };
  }

  if (theme === "emerald") {
    return {
      card: "border-slate-200 bg-white",
      icon: "bg-emerald-50 text-emerald-600",
      text: "text-slate-950",
      muted: "text-slate-500",
      column: "border-slate-200 bg-[#F7FBF8]",
      columnHeader: "border border-emerald-100 bg-white text-slate-950",
      badge: "bg-emerald-50 text-emerald-700",
      bar: "bg-emerald-400",
    };
  }

  if (theme === "teal") {
    return {
      card: "border-slate-200 bg-white",
      icon: "bg-[#EAF4F6] text-[#0F4C5C]",
      text: "text-slate-950",
      muted: "text-slate-500",
      column: "border-slate-200 bg-[#F6FAFB]",
      columnHeader: "border border-cyan-100 bg-white text-slate-950",
      badge: "bg-[#EAF4F6] text-[#0F4C5C]",
      bar: "bg-[#0F4C5C]",
    };
  }

  return {
    card: "border-slate-200 bg-white",
    icon: "bg-slate-100 text-slate-600",
    text: "text-slate-950",
    muted: "text-slate-500",
    column: "border-slate-200 bg-[#F8FAFA]",
    columnHeader: "border border-slate-200 bg-white text-slate-950",
    badge: "bg-slate-100 text-slate-700",
    bar: "bg-slate-500",
  };
}

function DashboardMetricCard({
  title,
  value,
  caption,
  icon: Icon,
  theme,
}: {
  title: string;
  value: number;
  caption: string;
  icon: LucideIcon;
  theme: DashboardTheme;
}) {
  const classes = getThemeClasses(theme);

  return (
    <article
      className={`rounded-2xl border p-4 shadow-sm transition hover:border-[#0F4C5C]/20 ${classes.card}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {title}
          </div>

          <div className={`mt-2 text-2xl font-bold ${classes.text}`}>
            {value}
          </div>
        </div>

        <div className={`rounded-2xl p-2.5 ${classes.icon}`}>
          <Icon size={18} />
        </div>
      </div>

      <div className={`mt-3 text-xs leading-5 ${classes.muted}`}>
        {caption}
      </div>
    </article>
  );
}

function DashboardColumn({
  title,
  description,
  count,
  theme,
  children,
}: {
  title: string;
  description: string;
  count: number;
  theme: DashboardTheme;
  children: ReactNode;
}) {
  const classes = getThemeClasses(theme);

  return (
    <section className={`rounded-3xl border p-3 shadow-sm ${classes.column}`}>
      <div
        className={`rounded-2xl px-4 py-3 ${classes.columnHeader}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold">{title}</h3>

            <p className="mt-1 text-xs leading-5 opacity-80">
              {description}
            </p>
          </div>

          <span
            className={`inline-flex min-w-7 items-center justify-center rounded-full px-2 py-1 text-xs font-bold shadow-sm ${classes.badge}`}
          >
            {count}
          </span>
        </div>
      </div>

      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function EmptyColumnState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-5 text-sm leading-6 text-slate-600 shadow-sm">
      {children}
    </div>
  );
}

function DashboardInquiryCard({
  inquiry,
  onOpen,
}: {
  inquiry: DashboardInquiry;
  onOpen: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(inquiry.id)}
      className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-[#0F4C5C]/25 hover:shadow-md"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
          {formatSourceChannel(inquiry.sourceChannel)}
        </span>

        <PriorityBadge priority={inquiry.aiPriority} />
        <CategoryBadge category={inquiry.aiCategory} />
        <StatusBadge status={inquiry.status} />
      </div>

      <div className="mt-3 font-bold text-slate-950">
        {inquiry.customerName}
      </div>

      <div className="mt-1 text-sm font-semibold text-slate-800">
        {inquiry.subject || "Sin asunto"}
      </div>

      <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">
        {inquiry.aiSummary ||
          inquiry.originalMessage ||
          "Sin resumen disponible"}
      </p>

      <div className="mt-3 text-xs font-medium text-slate-400">
        Última actividad: {inquiry.latestActivityAt}
      </div>
    </button>
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

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={
                pendingClosure
                  ? "rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800"
                  : "rounded-full border border-cyan-100 bg-[#EAF4F6] px-2.5 py-1 text-xs font-semibold text-[#0F4C5C]"
              }
            >
              {pendingClosure
                ? "Pendiente de cerrar"
                : getAppointmentStatusLabel(appointment.status)}
            </span>
          </div>

          <h4 className="mt-3 font-bold text-slate-950">
            {appointment.title}
          </h4>

          <p className="mt-1 text-sm text-slate-600">
            {appointment.scheduledAt}
          </p>
        </div>

        {appointment.inquiryId ? (
          <button
            type="button"
            onClick={() => openInquiry(appointment.inquiryId)}
            className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Abrir caso
          </button>
        ) : null}
      </div>

      {pendingClosure ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
          Esta cita ya ha pasado y sigue activa.
        </div>
      ) : null}

      {appointment.notes ? (
        <p className="mt-3 line-clamp-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
          {appointment.notes}
        </p>
      ) : null}
    </article>
  );
}

function ChannelSummaryCard({
  channelSummary,
}: {
  channelSummary: ChannelSummary;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-slate-950">
            {channelSummary.label}
          </div>

          <div className="mt-1 text-xs text-slate-500">
            {channelSummary.count} caso{channelSummary.count === 1 ? "" : "s"}
          </div>
        </div>

        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700">
          {channelSummary.percentage}%
        </span>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-[#0F4C5C]"
          style={{
            width: `${Math.max(channelSummary.percentage, 4)}%`,
          }}
        />
      </div>
    </div>
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

  useEffect(() => {
    async function loadDashboardData() {
      setIsLoading(true);
      setErrorMessage("");
      setSuccessMessage("");

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
              "title",
              "scheduled_at",
              "duration_minutes",
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

  const currentTimeMs = Date.now();

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
    })
    .slice(0, 4);

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
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </div>
      ) : null}

      {isLoading ? (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          Cargando dashboard...
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <DashboardMetricCard
          title="Nuevos casos"
          value={newCount}
          icon={Inbox}
          theme="sky"
          caption="Recibidos sin revisar"
        />

        <DashboardMetricCard
          title="En seguimiento"
          value={pendingCount}
          icon={ClipboardList}
          theme="amber"
          caption="Necesitan respuesta o revisión"
        />

        <DashboardMetricCard
          title="Esperando al cliente"
          value={waitingCustomerCount}
          icon={MessageSquareText}
          theme="slate"
          caption="La empresa ya respondió"
        />

        <DashboardMetricCard
          title="Citas pendientes"
          value={appointmentsNeedAttention}
          icon={CalendarClock}
          theme={appointmentsPendingClosure > 0 ? "red" : "sky"}
          caption={
            appointmentsPendingClosure > 0
              ? `${appointmentsPendingClosure} pendientes de cerrar`
              : "Pendientes de validación interna"
          }
        />

        <DashboardMetricCard
          title="Seguimientos urgentes"
          value={urgentFollowUps}
          icon={Clock3}
          theme={urgentFollowUps > 0 ? "red" : "emerald"}
          caption="Vencidos o para hoy"
        />
      </div>

      <section className="mt-6">
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Atención operativa
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Casos, citas y seguimientos que requieren revisión o acción.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-sm">
            <button
              onClick={() => setActiveView("inquiries")}
              className="font-semibold text-[#0F4C5C] hover:underline"
            >
              Ver casos
            </button>

            <span className="text-slate-300">·</span>

            <button
              onClick={() => setActiveView("appointments")}
              className="font-semibold text-[#0F4C5C] hover:underline"
            >
              Ver agenda
            </button>

            <span className="text-slate-300">·</span>

            <button
              onClick={() => setActiveView("followups")}
              className="font-semibold text-[#0F4C5C] hover:underline"
            >
              Ver seguimientos
            </button>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <DashboardColumn
            title="Casos a revisar"
            description="Entradas nuevas o en seguimiento."
            count={priorityItems.length}
            theme="amber"
          >
            {priorityItems.length === 0 ? (
              <EmptyColumnState>
                No hay casos que necesiten acción de la empresa.
              </EmptyColumnState>
            ) : (
              priorityItems.map((inquiry) => (
                <DashboardInquiryCard
                  key={inquiry.id}
                  inquiry={inquiry}
                  onOpen={openInquiry}
                />
              ))
            )}
          </DashboardColumn>

          <DashboardColumn
            title="Citas internas"
            description="Validación, ejecución o cierre interno."
            count={nextAppointments.length}
            theme="sky"
          >
            {nextAppointments.length === 0 ? (
              <EmptyColumnState>No hay citas internas pendientes.</EmptyColumnState>
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
          </DashboardColumn>

          <DashboardColumn
            title="Seguimientos"
            description="Tareas pendientes para no perder casos."
            count={nextFollowUps.length}
            theme={urgentFollowUps > 0 ? "red" : "emerald"}
          >
            {nextFollowUps.length === 0 ? (
              <EmptyColumnState>No hay seguimientos pendientes.</EmptyColumnState>
            ) : (
              nextFollowUps.map((followUp) => (
                <FollowUpCard
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
          </DashboardColumn>
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Canales de entrada
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Distribución de casos por canal registrado en el espacio activo.
            </p>
          </div>

          <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-700">
            Principal: {mainChannelLabel}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-[#F8FAFA] p-4 shadow-sm">
          {hasChannelActivity ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
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
        </div>
      </section>
    </div>
  );
}
