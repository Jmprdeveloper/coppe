"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  ClipboardList,
  Inbox,
  MessageSquareText,
  Plus,
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
import {
  mapInquiryRowToInquiry,
  type InquiryRow,
} from "../lib/inquiryUtils";
import {
  formatSourceChannel,
  sourceChannelOptions,
} from "../lib/sourceChannels";
import { createClient } from "../lib/supabase/client";
import type { Appointment, FollowUp, Inquiry, Priority } from "../types";

import { Button } from "./Button";
import { FollowUpCard } from "./FollowUpCard";
import { InquiryCard } from "./InquiryCard";
import { PageHeader } from "./PageHeader";
import { StatCard } from "./StatCard";

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

    countsByChannel.set(channelLabel, (countsByChannel.get(channelLabel) ?? 0) + 1);
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
    .slice(0, 3);

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
    .slice(0, 3);

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
        <StatCard
          title="Nuevos casos"
          value={newCount}
          icon={Inbox}
          caption="Recibidos sin revisar"
        />

        <StatCard
          title="En seguimiento"
          value={pendingCount}
          icon={ClipboardList}
          caption="Necesitan respuesta o revisión"
        />

        <StatCard
          title="Esperando al cliente"
          value={waitingCustomerCount}
          icon={MessageSquareText}
          caption="La empresa ya respondió"
        />

        <StatCard
          title="Citas pendientes"
          value={appointmentsNeedAttention}
          icon={CalendarClock}
          caption={
            appointmentsPendingClosure > 0
              ? `${appointmentsPendingClosure} pendientes de cerrar`
              : "Pendientes de validación interna"
          }
        />

        <StatCard
          title="Seguimientos urgentes"
          value={urgentFollowUps}
          icon={CalendarClock}
          caption="Vencidos o para hoy"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-950">
              Casos que necesitan atención
            </h2>

            <button
              onClick={() => setActiveView("inquiries")}
              className="text-sm font-semibold text-[#0F4C5C] hover:underline"
            >
              Ver todos
            </button>
          </div>

          {priorityItems.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
              No hay casos que necesiten acción de la empresa.
            </div>
          ) : (
            <div className="space-y-3">
              {priorityItems.map((inquiry) => (
                <InquiryCard
                  key={inquiry.id}
                  inquiry={inquiry}
                  onOpen={openInquiry}
                />
              ))}
            </div>
          )}
        </section>

        <div className="space-y-6">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-950">
                Actividad por canal
              </h2>

              <button
                onClick={() => setActiveView("inquiries")}
                className="text-sm font-semibold text-[#0F4C5C] hover:underline"
              >
                Ver casos
              </button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              {hasChannelActivity ? (
                <>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Canal principal
                    </div>

                    <div className="mt-1 text-sm font-bold text-slate-950">
                      {mainChannelLabel}
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {channelSummaries.map((channelSummary) => (
                      <div key={channelSummary.label}>
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-medium text-slate-700">
                            {channelSummary.label}
                          </span>

                          <span className="text-xs font-semibold text-slate-500">
                            {channelSummary.count} ·{" "}
                            {channelSummary.percentage}%
                          </span>
                        </div>

                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-[#0F4C5C]"
                            style={{
                              width: `${Math.max(
                                channelSummary.percentage,
                                4
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <p className="mt-4 text-xs leading-5 text-slate-500">
                    Distribución calculada sobre todos los casos registrados en
                    el espacio activo.
                  </p>
                </>
              ) : (
                <div className="text-sm leading-6 text-slate-600">
                  Todavía no hay actividad por canal. Cuando entren mensajes por
                  Formulario web, Chat web, WhatsApp u otros canales, aparecerán
                  aquí.
                </div>
              )}
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-950">
                Citas internas
              </h2>

              <button
                onClick={() => setActiveView("appointments")}
                className="text-sm font-semibold text-[#0F4C5C] hover:underline"
              >
                Ver agenda
              </button>
            </div>

            {nextAppointments.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
                No hay citas internas pendientes.
              </div>
            ) : (
              <div className="space-y-3">
                {nextAppointments.map((appointment) => {
                  const appointmentPendingClosure =
                    isAppointmentPendingClosure(appointment, currentTimeMs);

                  return (
                    <article
                      key={appointment.id}
                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <div className="text-sm font-semibold text-slate-950">
                        {appointment.title}
                      </div>

                      <p className="mt-1 text-xs text-slate-500">
                        {appointment.scheduledAt} ·{" "}
                        {getAppointmentStatusLabel(appointment.status)}
                      </p>

                      {appointmentPendingClosure ? (
                        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                          Pendiente de cerrar. Esta cita interna ya ha pasado y
                          sigue activa.
                        </div>
                      ) : null}

                      {appointment.notes ? (
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">
                          {appointment.notes}
                        </p>
                      ) : null}

                      {appointment.inquiryId ? (
                        <button
                          type="button"
                          onClick={() => openInquiry(appointment.inquiryId)}
                          className="mt-3 text-xs font-semibold text-[#0F4C5C] hover:underline"
                        >
                          Abrir caso
                        </button>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-950">
                Seguimientos que atender
              </h2>

              <button
                onClick={() => setActiveView("followups")}
                className="text-sm font-semibold text-[#0F4C5C] hover:underline"
              >
                Ver agenda
              </button>
            </div>

            {nextFollowUps.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
                No hay seguimientos pendientes.
              </div>
            ) : (
              <div className="space-y-3">
                {nextFollowUps.map((followUp) => (
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
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}