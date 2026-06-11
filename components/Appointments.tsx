"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  History,
  Plus,
  Search,
  X,
} from "lucide-react";

import {
  compareAppointmentsByScheduledAt,
  getAppointmentStatusLabel,
  isAppointmentPendingClosure,
  mapAppointmentRowToAppointment,
  type AppointmentRow,
} from "../lib/appointmentUtils";
import { normalizeInquiryStatus } from "../lib/inquiryUtils";
import { createClient } from "../lib/supabase/client";
import type { Appointment, AppointmentStatus } from "../types";

import { BoardColumn } from "./BoardColumn";
import { Button } from "./Button";
import { MetricCard } from "./MetricCard";
import { PageHeader } from "./PageHeader";
import { SectionCard } from "./SectionCard";

type AppointmentsProps = {
  openInquiry: (id: string) => void;
};

type InquiryOptionRow = {
  id: string;
  company_id: string;
  customer_id: string | null;
  customer_name: string;
  subject: string | null;
  status: string;
};

type InternalAppointment = Appointment & {
  inquiryLabel: string;
  inquiryStatus: string;
  scheduledAtValue: string;
};

type AppointmentStatusFilter =
  | "all"
  | "proposed"
  | "confirmed"
  | "completed"
  | "cancelled";

type AppointmentColumnTone = "warning" | "info" | "success";

function getDefaultDateTimeLocal() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatDateTimeLocalFromIso(value: string | null) {
  if (!value) {
    return getDefaultDateTimeLocal();
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return getDefaultDateTimeLocal();
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function normalizeSearchText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isActiveInquiryOption(inquiry: InquiryOptionRow) {
  const status = normalizeInquiryStatus(inquiry.status);

  return (
    status === "new" || status === "pending" || status === "waiting_customer"
  );
}

function formatInquiryStatus(status: string) {
  const normalizedStatus = normalizeInquiryStatus(status);

  if (normalizedStatus === "new") {
    return "Nuevo";
  }

  if (normalizedStatus === "pending") {
    return "En seguimiento";
  }

  if (normalizedStatus === "waiting_customer") {
    return "Esperando al cliente";
  }

  if (normalizedStatus === "replied") {
    return "Respondido";
  }

  if (normalizedStatus === "closed") {
    return "Cerrado";
  }

  if (normalizedStatus === "discarded") {
    return "Descartado";
  }

  return "Estado no indicado";
}

function buildInquiryLabel(inquiry: InquiryOptionRow | undefined) {
  if (!inquiry) {
    return "Caso no indicado";
  }

  return `${inquiry.customer_name} · ${inquiry.subject || "Sin asunto"}`;
}

function mapAppointmentRowToInternalAppointment(
  row: AppointmentRow,
  inquiryById: Map<string, InquiryOptionRow>,
): InternalAppointment {
  const appointment = mapAppointmentRowToAppointment(row);
  const relatedInquiry = row.inquiry_id
    ? inquiryById.get(row.inquiry_id)
    : undefined;

  return {
    ...appointment,
    inquiryLabel: buildInquiryLabel(relatedInquiry),
    inquiryStatus: relatedInquiry
      ? formatInquiryStatus(relatedInquiry.status)
      : "Estado no indicado",
    scheduledAtValue: row.scheduled_at,
  };
}

function matchesAppointmentSearch(
  appointment: InternalAppointment,
  searchTerm: string,
) {
  const cleanSearchTerm = normalizeSearchText(searchTerm);

  if (!cleanSearchTerm) {
    return true;
  }

  const searchableContent = normalizeSearchText(
    [
      appointment.title,
      appointment.scheduledAt,
      getAppointmentStatusLabel(appointment.status),
      appointment.inquiryLabel,
      appointment.inquiryStatus,
      appointment.notes,
    ].join(" "),
  );

  return searchableContent.includes(cleanSearchTerm);
}

function getStatusBadgeClassName(
  status: AppointmentStatus,
  isPendingClosure = false,
) {
  if (isPendingClosure) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (status === "proposed") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  if (status === "confirmed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "completed") {
    return "border-teal-200 bg-teal-50 text-teal-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-600";
}

function AppointmentStatusBadge({
  status,
  isPendingClosure = false,
}: {
  status: AppointmentStatus;
  isPendingClosure?: boolean;
}) {
  return (
    <span
      className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusBadgeClassName(
        status,
        isPendingClosure,
      )}`}
    >
      {isPendingClosure
        ? "Pendiente de cerrar"
        : getAppointmentStatusLabel(status)}
    </span>
  );
}

function getAppointmentCardClassName(
  tone: AppointmentColumnTone,
  isPendingClosure = false,
) {
  if (isPendingClosure || tone === "warning") {
    return "border-amber-200 bg-white shadow-sm ring-1 ring-amber-100";
  }

  if (tone === "info") {
    return "border-sky-200 bg-white shadow-sm ring-1 ring-sky-100";
  }

  return "border-emerald-200 bg-white shadow-sm ring-1 ring-emerald-100";
}

function getHistoryStatusClassName(status: AppointmentStatus) {
  if (status === "completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "cancelled") {
    return "border-slate-200 bg-slate-50 text-slate-600";
  }

  return "border-slate-200 bg-white text-slate-600";
}

function MetricCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="h-[116px] animate-pulse rounded-2xl border border-slate-200 bg-slate-100/80 shadow-sm shadow-slate-200/60"
        />
      ))}
    </div>
  );
}

export function Appointments({ openInquiry }: AppointmentsProps) {
  const supabase = useMemo(() => createClient(), []);

  const [appointments, setAppointments] = useState<InternalAppointment[]>([]);
  const [inquiryOptions, setInquiryOptions] = useState<InquiryOptionRow[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editingAppointmentId, setEditingAppointmentId] = useState<
    string | null
  >(null);
  const [selectedInquiryId, setSelectedInquiryId] = useState("");
  const [title, setTitle] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [notes, setNotes] = useState("");

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<AppointmentStatusFilter>("all");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [updatingAppointmentId, setUpdatingAppointmentId] = useState<
    string | null
  >(null);

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [formErrorMessage, setFormErrorMessage] = useState("");

  useEffect(() => {
    async function loadAppointmentsAndInquiries() {
      setIsLoading(true);
      setErrorMessage("");
      setSuccessMessage("");
      setFormErrorMessage("");

      const { data: inquiriesData, error: inquiriesError } = await supabase
        .from("inquiries")
        .select("id, company_id, customer_id, customer_name, subject, status")
        .order("created_at", { ascending: false });

      if (inquiriesError) {
        setErrorMessage(
          `No se pudieron cargar los casos para la agenda interna: ${
            inquiriesError.message || "sin detalle del error"
          }`,
        );
        setIsLoading(false);
        return;
      }

      const mappedInquiries = (inquiriesData ??
        []) as unknown as InquiryOptionRow[];

      const inquiryById = new Map(
        mappedInquiries.map((inquiry) => [inquiry.id, inquiry]),
      );

      const activeInquiryOptions = mappedInquiries.filter(
        isActiveInquiryOption,
      );

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
            ].join(", "),
          )
          .order("scheduled_at", { ascending: true });

      if (appointmentsError) {
        setErrorMessage(
          `No se pudieron cargar las citas internas: ${
            appointmentsError.message || "sin detalle del error"
          }`,
        );
        setIsLoading(false);
        return;
      }

      const mappedAppointments = (
        (appointmentsData ?? []) as unknown as AppointmentRow[]
      )
        .map((appointmentRow) =>
          mapAppointmentRowToInternalAppointment(appointmentRow, inquiryById),
        )
        .sort(compareAppointmentsByScheduledAt);

      setAppointments(mappedAppointments);
      setInquiryOptions(activeInquiryOptions);

      setSelectedInquiryId((currentValue) => {
        if (
          currentValue &&
          activeInquiryOptions.some((inquiry) => inquiry.id === currentValue)
        ) {
          return currentValue;
        }

        return "";
      });

      setIsLoading(false);
    }

    loadAppointmentsAndInquiries();
  }, [supabase]);

  const selectedInquiry = inquiryOptions.find(
    (inquiry) => inquiry.id === selectedInquiryId,
  );

  const editingAppointment = appointments.find(
    (appointment) => appointment.id === editingAppointmentId,
  );

  const isEditing = Boolean(editingAppointment);

  const filteredAppointments = appointments.filter((appointment) => {
    const matchesStatus =
      statusFilter === "all" || appointment.status === statusFilter;

    return matchesStatus && matchesAppointmentSearch(appointment, searchTerm);
  });

  const currentTimeMs = Date.now();

  const totalPendingClosureAppointments = appointments.filter((appointment) =>
    isAppointmentPendingClosure(appointment, currentTimeMs),
  );

  const totalPendingConfirmationAppointments = appointments.filter(
    (appointment) =>
      appointment.status === "proposed" &&
      !isAppointmentPendingClosure(appointment, currentTimeMs),
  );

  const totalConfirmedAppointments = appointments.filter(
    (appointment) =>
      appointment.status === "confirmed" &&
      !isAppointmentPendingClosure(appointment, currentTimeMs),
  );

  const totalHistoryAppointments = appointments.filter(
    (appointment) =>
      appointment.status === "completed" || appointment.status === "cancelled",
  );

  const pendingClosureAppointments = filteredAppointments.filter(
    (appointment) => isAppointmentPendingClosure(appointment, currentTimeMs),
  );

  const pendingConfirmationAppointments = filteredAppointments.filter(
    (appointment) =>
      appointment.status === "proposed" &&
      !isAppointmentPendingClosure(appointment, currentTimeMs),
  );

  const confirmedAppointments = filteredAppointments.filter(
    (appointment) =>
      appointment.status === "confirmed" &&
      !isAppointmentPendingClosure(appointment, currentTimeMs),
  );

  const historyAppointments = filteredAppointments.filter(
    (appointment) =>
      appointment.status === "completed" || appointment.status === "cancelled",
  );

  const hasActiveFilters =
    searchTerm.trim().length > 0 || statusFilter !== "all";

  const resetForm = () => {
    setEditingAppointmentId(null);
    setTitle("");
    setScheduledAt("");
    setNotes("");
    setFormErrorMessage("");
  };

  const handleOpenCreateForm = () => {
    resetForm();
    setSelectedInquiryId("");
    setShowForm(true);
    setSuccessMessage("");
    setErrorMessage("");
  };

  const handleOpenEditForm = (appointment: InternalAppointment) => {
    setEditingAppointmentId(appointment.id);
    setShowForm(true);
    setSuccessMessage("");
    setErrorMessage("");
    setFormErrorMessage("");
    setSelectedInquiryId(appointment.inquiryId);
    setTitle(appointment.title);
    setScheduledAt(formatDateTimeLocalFromIso(appointment.scheduledAtIso));
    setNotes(appointment.notes);
  };

  const handleCancelForm = () => {
    setShowForm(false);
    resetForm();
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
  };

  const handleSaveAppointment = async () => {
    setSuccessMessage("");
    setFormErrorMessage("");

    const cleanTitle = title.trim();

    if (!cleanTitle) {
      setFormErrorMessage("El título de la cita interna es obligatorio.");
      return;
    }

    if (!scheduledAt) {
      setFormErrorMessage("La fecha y hora de la cita son obligatorias.");
      return;
    }

    const scheduledDate = new Date(scheduledAt);

    if (Number.isNaN(scheduledDate.getTime())) {
      setFormErrorMessage("La fecha indicada no es válida.");
      return;
    }

    if (scheduledDate.getTime() < Date.now() - 60 * 1000) {
      setFormErrorMessage(
        "No puedes guardar una cita interna en una fecha pasada.",
      );
      return;
    }

    const scheduledAtIso = scheduledDate.toISOString();

    if (editingAppointment) {
      setIsSaving(true);

      const { data, error } = await supabase
        .from("appointments")
        .update({
          title: cleanTitle,
          scheduled_at: scheduledAtIso,
          notes: notes.trim() || null,
        })
        .eq("id", editingAppointment.id)
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
          ].join(", "),
        )
        .single<AppointmentRow>();

      setIsSaving(false);

      if (error || !data) {
        setFormErrorMessage(
          `No se pudo actualizar la cita interna: ${
            error?.message || "sin detalle del error"
          }`,
        );
        return;
      }

      const inquiryById = new Map(
        inquiryOptions.map((inquiry) => [inquiry.id, inquiry]),
      );
      const mappedAppointment = mapAppointmentRowToInternalAppointment(
        data,
        inquiryById,
      );

      setAppointments((currentAppointments) =>
        currentAppointments
          .map((appointment) =>
            appointment.id === editingAppointment.id
              ? mappedAppointment
              : appointment,
          )
          .sort(compareAppointmentsByScheduledAt),
      );

      setShowForm(false);
      resetForm();
      setSuccessMessage("Cita interna actualizada correctamente.");
      return;
    }

    if (!selectedInquiry) {
      setFormErrorMessage("Selecciona un caso antes de crear la cita interna.");
      return;
    }

    setIsSaving(true);

    const { data, error } = await supabase
      .from("appointments")
      .insert({
        company_id: selectedInquiry.company_id,
        customer_id: selectedInquiry.customer_id,
        inquiry_id: selectedInquiry.id,
        title: cleanTitle,
        scheduled_at: scheduledAtIso,
        status: "proposed",
        notes: notes.trim() || null,
      })
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
        ].join(", "),
      )
      .single<AppointmentRow>();

    setIsSaving(false);

    if (error || !data) {
      setFormErrorMessage(
        `No se pudo crear la cita interna: ${
          error?.message || "sin detalle del error"
        }`,
      );
      return;
    }

    const inquiryById = new Map(
      inquiryOptions.map((inquiry) => [inquiry.id, inquiry]),
    );
    const mappedAppointment = mapAppointmentRowToInternalAppointment(
      data,
      inquiryById,
    );

    setAppointments((currentAppointments) =>
      [...currentAppointments, mappedAppointment].sort(
        compareAppointmentsByScheduledAt,
      ),
    );

    setShowForm(false);
    resetForm();
    setSuccessMessage("Cita interna creada como pendiente de confirmar.");
  };

  const handleUpdateAppointmentStatus = async (
    appointmentId: string,
    status: AppointmentStatus,
  ) => {
    setErrorMessage("");
    setSuccessMessage("");
    setFormErrorMessage("");
    setUpdatingAppointmentId(appointmentId);

    const { data, error } = await supabase
      .from("appointments")
      .update({ status })
      .eq("id", appointmentId)
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
        ].join(", "),
      )
      .single<AppointmentRow>();

    setUpdatingAppointmentId(null);

    if (error || !data) {
      setErrorMessage(
        `No se pudo actualizar la cita interna: ${
          error?.message || "sin detalle del error"
        }`,
      );
      return;
    }

    const inquiryById = new Map(
      inquiryOptions.map((inquiry) => [inquiry.id, inquiry]),
    );
    const mappedAppointment = mapAppointmentRowToInternalAppointment(
      data,
      inquiryById,
    );

    setAppointments((currentAppointments) =>
      currentAppointments
        .map((appointment) =>
          appointment.id === appointmentId ? mappedAppointment : appointment,
        )
        .sort(compareAppointmentsByScheduledAt),
    );

    if (status === "proposed") {
      setSuccessMessage("Cita interna reabierta como pendiente.");
      return;
    }

    if (status === "confirmed") {
      setSuccessMessage("Cita interna marcada como confirmada internamente.");
      return;
    }

    if (status === "completed") {
      setSuccessMessage("Cita interna marcada como realizada.");
      return;
    }

    setSuccessMessage("Cita interna cancelada correctamente.");
  };

  const renderActionButton = (
    label: string,
    onClick: () => void,
    isUpdating: boolean,
    variant: "primary" | "secondary" | "ghost" = "secondary",
  ) => (
    <Button variant={variant} onClick={onClick} disabled={isUpdating}>
      {label}
    </Button>
  );

  const renderActiveAppointmentCard = (
    appointment: InternalAppointment,
    tone: AppointmentColumnTone,
    isPendingClosure = false,
  ) => {
    const isUpdating = updatingAppointmentId === appointment.id;

    return (
      <article
        key={appointment.id}
        className={`rounded-2xl border p-4 ${getAppointmentCardClassName(
          tone,
          isPendingClosure,
        )}`}
      >
        <div className="flex items-start justify-between gap-3">
          <AppointmentStatusBadge
            status={appointment.status}
            isPendingClosure={isPendingClosure}
          />

          {appointment.inquiryId ? (
            <button
              type="button"
              onClick={() => openInquiry(appointment.inquiryId)}
              className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#0F4C5C] transition hover:bg-slate-50"
            >
              Abrir caso
            </button>
          ) : null}
        </div>

        <h3 className="mt-3 text-base font-bold text-slate-950">
          {appointment.title}
        </h3>

        <div className="mt-1 text-sm font-medium text-slate-700">
          {appointment.scheduledAt}
        </div>

        {isPendingClosure ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
            Ya ha pasado y sigue activa. Cierra la cita como realizada o
            cancelada.
          </div>
        ) : null}

        <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="font-semibold uppercase tracking-wide text-slate-500">
              Caso asociado
            </div>
            <div className="mt-1 line-clamp-2 font-medium text-slate-700">
              {appointment.inquiryLabel}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="font-semibold uppercase tracking-wide text-slate-500">
              Estado del caso
            </div>
            <div className="mt-1 font-medium text-slate-700">
              {appointment.inquiryStatus}
            </div>
          </div>
        </div>

        {appointment.notes ? (
          <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-600">
            {appointment.notes}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          {renderActionButton(
            "Editar",
            () => handleOpenEditForm(appointment),
            isUpdating,
          )}

          {appointment.status === "proposed" ? (
            <>
              {renderActionButton(
                "Confirmar internamente",
                () =>
                  handleUpdateAppointmentStatus(appointment.id, "confirmed"),
                isUpdating,
                "primary",
              )}
              {renderActionButton(
                "Cancelar",
                () =>
                  handleUpdateAppointmentStatus(appointment.id, "cancelled"),
                isUpdating,
                "ghost",
              )}
            </>
          ) : null}

          {appointment.status === "confirmed" ? (
            <>
              {renderActionButton(
                "Marcar realizada",
                () =>
                  handleUpdateAppointmentStatus(appointment.id, "completed"),
                isUpdating,
                "primary",
              )}
              {renderActionButton(
                "Cancelar",
                () =>
                  handleUpdateAppointmentStatus(appointment.id, "cancelled"),
                isUpdating,
                "ghost",
              )}
            </>
          ) : null}
        </div>
      </article>
    );
  };

  const renderHistoryAppointmentRow = (appointment: InternalAppointment) => {
    const isUpdating = updatingAppointmentId === appointment.id;

    return (
      <article
        key={appointment.id}
        className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[160px_1fr_1fr_auto] lg:items-center"
      >
        <div>
          <span
            className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${getHistoryStatusClassName(
              appointment.status,
            )}`}
          >
            {getAppointmentStatusLabel(appointment.status)}
          </span>
          <div className="mt-2 text-xs font-medium text-slate-500">
            {appointment.scheduledAt}
          </div>
        </div>

        <div className="min-w-0">
          <h3 className="font-semibold text-slate-950">{appointment.title}</h3>
          {appointment.notes ? (
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
              {appointment.notes}
            </p>
          ) : null}
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
          <div className="font-semibold text-slate-700">Caso asociado</div>
          <div className="line-clamp-1">{appointment.inquiryLabel}</div>
          <div className="mt-1 text-slate-500">
            Estado del caso: {appointment.inquiryStatus}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          {appointment.inquiryId ? (
            <Button
              variant="secondary"
              onClick={() => openInquiry(appointment.inquiryId)}
              disabled={isUpdating}
            >
              Abrir caso
            </Button>
          ) : null}

          <Button
            variant="ghost"
            onClick={() =>
              handleUpdateAppointmentStatus(appointment.id, "proposed")
            }
            disabled={isUpdating}
          >
            Reabrir
          </Button>
        </div>
      </article>
    );
  };

  const renderAppointmentColumn = ({
    title,
    description,
    count,
    tone,
    appointments: columnAppointments,
    emptyMessage,
    isPendingClosure = false,
  }: {
    title: string;
    description: string;
    count: number;
    tone: AppointmentColumnTone;
    appointments: InternalAppointment[];
    emptyMessage: string;
    isPendingClosure?: boolean;
  }) => (
    <BoardColumn
      title={title}
      description={description}
      count={count}
      tone={tone}
    >
      {columnAppointments.length === 0 ? (
        <div className="rounded-2xl border border-white/70 bg-white/75 p-4 text-sm leading-6 text-slate-600 shadow-sm">
          {emptyMessage}
        </div>
      ) : (
        columnAppointments.map((appointment) =>
          renderActiveAppointmentCard(appointment, tone, isPendingClosure),
        )
      )}
    </BoardColumn>
  );

  return (
    <div>
      <PageHeader
        title="Agenda interna"
        description="Control interno de citas asociadas a casos. COPPE no confirma citas automáticamente al cliente."
        action={
          <Button onClick={handleOpenCreateForm}>
            <Plus size={16} /> Crear cita interna
          </Button>
        }
      />

      {isLoading ? (
        <MetricCardsSkeleton />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Pendientes de cerrar"
            value={totalPendingClosureAppointments.length}
            caption="Citas activas con fecha pasada"
            icon={AlertTriangle}
            tone="warning"
          />

          <MetricCard
            title="Por confirmar"
            value={totalPendingConfirmationAppointments.length}
            caption="Citas internas todavía no validadas"
            icon={Clock3}
            tone="info"
          />

          <MetricCard
            title="Confirmadas"
            value={totalConfirmedAppointments.length}
            caption="Citas internas activas y programadas"
            icon={CalendarCheck2}
            tone="success"
          />

          <MetricCard
            title="Historial"
            value={totalHistoryAppointments.length}
            caption="Realizadas o canceladas"
            icon={History}
            tone="neutral"
          />
        </div>
      )}

      <SectionCard className="mt-5">
        <div className="grid gap-4 md:grid-cols-[1fr_220px_auto] md:items-end">
          <label className="text-sm font-medium text-slate-700">
            Buscar cita
            <div className="mt-1 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 focus-within:border-[#0F4C5C]">
              <Search size={16} className="shrink-0 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                placeholder="Buscar por título, caso o notas..."
              />
            </div>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Estado
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as AppointmentStatusFilter)
              }
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
            >
              <option value="all">Todas</option>
              <option value="proposed">Pendientes de confirmar</option>
              <option value="confirmed">Confirmadas internamente</option>
              <option value="completed">Realizadas</option>
              <option value="cancelled">Canceladas</option>
            </select>
          </label>

          <Button
            variant="secondary"
            onClick={handleClearFilters}
            disabled={!hasActiveFilters}
          >
            Limpiar filtros
          </Button>
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Mostrando {filteredAppointments.length} de {appointments.length} citas
          internas.
        </p>
      </SectionCard>

      {showForm ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="appointment-modal-title"
          onClick={handleCancelForm}
        >
          <div
            className="max-h-[calc(100vh-3rem)] w-full max-w-3xl overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <div className="mb-2 inline-flex rounded-full border border-[#0F4C5C]/15 bg-[#0F4C5C]/[0.06] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#0F4C5C]">
                  {isEditing ? "Editar cita interna" : "Crear cita interna"}
                </div>

                <h2
                  id="appointment-modal-title"
                  className="text-xl font-bold text-slate-950"
                >
                  {isEditing ? "Editar cita interna" : "Crear cita interna"}
                </h2>

                <p className="mt-1 text-sm leading-6 text-slate-500">
                  {isEditing
                    ? "Actualiza el título, la fecha o las notas de esta cita interna."
                    : "Asocia una cita interna a un caso existente. COPPE no enviará ninguna confirmación automática al cliente."}
                </p>
              </div>

              <button
                type="button"
                onClick={handleCancelForm}
                className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                title="Cerrar ventana"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-5">
              <div className="grid gap-4 md:grid-cols-2">
                {isEditing ? (
                  <div className="text-sm font-medium text-slate-700 md:col-span-2">
                    Caso asociado
                    <div className="mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-600">
                      {editingAppointment?.inquiryLabel || "Caso no indicado"}
                    </div>
                  </div>
                ) : (
                  <label className="text-sm font-medium text-slate-700 md:col-span-2">
                    Caso asociado
                    <select
                      value={selectedInquiryId}
                      onChange={(event) => {
                        setSelectedInquiryId(event.target.value);
                      }}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-[#0F4C5C] focus:bg-white"
                    >
                      {inquiryOptions.length === 0 ? (
                        <option value="">No hay casos activos disponibles</option>
                      ) : (
                        <>
                          <option value="">Selecciona un caso asociado</option>

                          {inquiryOptions.map((inquiry) => (
                            <option key={inquiry.id} value={inquiry.id}>
                              {inquiry.customer_name} ·{" "}
                              {inquiry.subject || "Sin asunto"} ·{" "}
                              {formatInquiryStatus(inquiry.status)}
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                  </label>
                )}

                <label className="text-sm font-medium text-slate-700">
                  Título
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-[#0F4C5C] focus:bg-white"
                    placeholder="Escribe el título de la cita"
                    autoFocus
                  />
                </label>

                <label className="text-sm font-medium text-slate-700">
                  Fecha y hora
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(event) => setScheduledAt(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-[#0F4C5C] focus:bg-white"
                  />
                </label>

                <label className="text-sm font-medium text-slate-700 md:col-span-2">
                  Notas
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    className="mt-1 min-h-[100px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-[#0F4C5C] focus:bg-white"
                    placeholder="Añade detalles relevantes para preparar la cita..."
                  />
                </label>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
                Esta cita es solo de uso interno. El cliente no recibe ninguna
                confirmación automática desde COPPE.
              </div>

              {formErrorMessage ? (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {formErrorMessage}
                </div>
              ) : null}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/70 px-6 py-4 sm:flex-row sm:items-center sm:justify-end">
              <Button variant="ghost" onClick={handleCancelForm}>
                Cancelar
              </Button>

              <Button
                onClick={handleSaveAppointment}
                disabled={isSaving || (!isEditing && inquiryOptions.length === 0)}
              >
                {isSaving
                  ? isEditing
                    ? "Guardando cambios..."
                    : "Creando cita..."
                  : isEditing
                    ? "Guardar cambios"
                    : "Guardar cita interna"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </div>
      ) : null}

      {isLoading ? (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          Cargando agenda interna...
        </div>
      ) : null}

      {!isLoading && !errorMessage ? (
        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Agenda activa
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Citas que todavía requieren validación, ejecución o cierre
                interno.
              </p>
            </div>

            <div className="hidden items-center gap-2 text-xs text-slate-500 md:flex">
              <CheckCircle2 size={15} />
              No se envía ninguna confirmación automática al cliente.
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            {renderAppointmentColumn({
              title: "Pendientes de cerrar",
              description: "Ya han pasado y siguen activas.",
              count: pendingClosureAppointments.length,
              tone: "warning",
              appointments: pendingClosureAppointments,
              emptyMessage: hasActiveFilters
                ? "No hay citas pendientes de cerrar con estos filtros."
                : "No hay citas activas con fecha pasada.",
              isPendingClosure: true,
            })}

            {renderAppointmentColumn({
              title: "Por confirmar",
              description: "Citas creadas pero aún no validadas internamente.",
              count: pendingConfirmationAppointments.length,
              tone: "info",
              appointments: pendingConfirmationAppointments,
              emptyMessage: hasActiveFilters
                ? "No hay citas pendientes con estos filtros."
                : "No hay citas pendientes de confirmar.",
            })}

            {renderAppointmentColumn({
              title: "Confirmadas",
              description: "Citas internas activas y programadas.",
              count: confirmedAppointments.length,
              tone: "success",
              appointments: confirmedAppointments,
              emptyMessage: hasActiveFilters
                ? "No hay citas confirmadas con estos filtros."
                : "No hay citas internas confirmadas.",
            })}
          </div>
        </section>
      ) : null}

      {!isLoading && !errorMessage ? (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Historial</h2>
              <p className="mt-1 text-sm text-slate-500">
                Citas internas realizadas o canceladas, en formato compacto.
              </p>
            </div>

            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500">
              {historyAppointments.length}
            </span>
          </div>

          {historyAppointments.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
              {hasActiveFilters
                ? "No hay citas internas del historial que coincidan con los filtros."
                : "Todavía no hay citas internas realizadas o canceladas."}
            </div>
          ) : (
            <div className="space-y-3">
              {historyAppointments.map(renderHistoryAppointmentRow)}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
