"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";

import {
  getAppointmentStatusLabel,
  mapAppointmentRowToAppointment,
  type AppointmentRow,
} from "../lib/appointmentUtils";
import { normalizeInquiryStatus } from "../lib/inquiryUtils";
import { createClient } from "../lib/supabase/client";
import type { Appointment, AppointmentStatus } from "../types";

import { Button } from "./Button";
import { PageHeader } from "./PageHeader";

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
    status === "new" ||
    status === "pending" ||
    status === "waiting_customer"
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
  inquiryById: Map<string, InquiryOptionRow>
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

function sortAppointmentsByDate(
  first: InternalAppointment,
  second: InternalAppointment
) {
  return (
    new Date(first.scheduledAtValue).getTime() -
    new Date(second.scheduledAtValue).getTime()
  );
}

function isAppointmentPendingClosure(
  appointment: InternalAppointment,
  currentTimeMs: number
) {
  if (
    appointment.status !== "proposed" &&
    appointment.status !== "confirmed"
  ) {
    return false;
  }

  const appointmentTime = new Date(appointment.scheduledAtValue).getTime();

  if (Number.isNaN(appointmentTime)) {
    return false;
  }

  return appointmentTime < currentTimeMs;
}

function matchesAppointmentSearch(
  appointment: InternalAppointment,
  searchTerm: string
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
    ].join(" ")
  );

  return searchableContent.includes(cleanSearchTerm);
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
          }`
        );
        setIsLoading(false);
        return;
      }

      const mappedInquiries = (inquiriesData ??
        []) as unknown as InquiryOptionRow[];

      const inquiryById = new Map(
        mappedInquiries.map((inquiry) => [inquiry.id, inquiry])
      );

      const activeInquiryOptions = mappedInquiries.filter(isActiveInquiryOption);

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
          .order("scheduled_at", { ascending: true });

      if (appointmentsError) {
        setErrorMessage(
          `No se pudieron cargar las citas internas: ${
            appointmentsError.message || "sin detalle del error"
          }`
        );
        setIsLoading(false);
        return;
      }

      const mappedAppointments = (
        (appointmentsData ?? []) as unknown as AppointmentRow[]
      )
        .map((appointmentRow) =>
          mapAppointmentRowToInternalAppointment(appointmentRow, inquiryById)
        )
        .sort(sortAppointmentsByDate);

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
    (inquiry) => inquiry.id === selectedInquiryId
  );

  const editingAppointment = appointments.find(
    (appointment) => appointment.id === editingAppointmentId
  );

  const isEditing = Boolean(editingAppointment);

  const filteredAppointments = appointments.filter((appointment) => {
    const matchesStatus =
      statusFilter === "all" || appointment.status === statusFilter;

    return matchesStatus && matchesAppointmentSearch(appointment, searchTerm);
  });

  const currentTimeMs = Date.now();

  const pendingClosureAppointments = filteredAppointments.filter(
    (appointment) => isAppointmentPendingClosure(appointment, currentTimeMs)
  );

  const pendingConfirmationAppointments = filteredAppointments.filter(
    (appointment) =>
      appointment.status === "proposed" &&
      !isAppointmentPendingClosure(appointment, currentTimeMs)
  );

  const confirmedAppointments = filteredAppointments.filter(
    (appointment) =>
      appointment.status === "confirmed" &&
      !isAppointmentPendingClosure(appointment, currentTimeMs)
  );

  const historyAppointments = filteredAppointments.filter(
    (appointment) =>
      appointment.status === "completed" || appointment.status === "cancelled"
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
        "No puedes guardar una cita interna en una fecha pasada."
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
          ].join(", ")
        )
        .single<AppointmentRow>();

      setIsSaving(false);

      if (error || !data) {
        setFormErrorMessage(
          `No se pudo actualizar la cita interna: ${
            error?.message || "sin detalle del error"
          }`
        );
        return;
      }

      const inquiryById = new Map(
        inquiryOptions.map((inquiry) => [inquiry.id, inquiry])
      );
      const mappedAppointment = mapAppointmentRowToInternalAppointment(
        data,
        inquiryById
      );

      setAppointments((currentAppointments) =>
        currentAppointments
          .map((appointment) =>
            appointment.id === editingAppointment.id
              ? mappedAppointment
              : appointment
          )
          .sort(sortAppointmentsByDate)
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
        ].join(", ")
      )
      .single<AppointmentRow>();

    setIsSaving(false);

    if (error || !data) {
      setFormErrorMessage(
        `No se pudo crear la cita interna: ${
          error?.message || "sin detalle del error"
        }`
      );
      return;
    }

    const inquiryById = new Map(
      inquiryOptions.map((inquiry) => [inquiry.id, inquiry])
    );
    const mappedAppointment = mapAppointmentRowToInternalAppointment(
      data,
      inquiryById
    );

    setAppointments((currentAppointments) =>
      [...currentAppointments, mappedAppointment].sort(sortAppointmentsByDate)
    );

    setShowForm(false);
    resetForm();
    setSuccessMessage("Cita interna creada como pendiente de confirmar.");
  };

  const handleUpdateAppointmentStatus = async (
    appointmentId: string,
    status: AppointmentStatus
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
        ].join(", ")
      )
      .single<AppointmentRow>();

    setUpdatingAppointmentId(null);

    if (error || !data) {
      setErrorMessage(
        `No se pudo actualizar la cita interna: ${
          error?.message || "sin detalle del error"
        }`
      );
      return;
    }

    const inquiryById = new Map(
      inquiryOptions.map((inquiry) => [inquiry.id, inquiry])
    );
    const mappedAppointment = mapAppointmentRowToInternalAppointment(
      data,
      inquiryById
    );

    setAppointments((currentAppointments) =>
      currentAppointments
        .map((appointment) =>
          appointment.id === appointmentId ? mappedAppointment : appointment
        )
        .sort(sortAppointmentsByDate)
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

  const renderAppointmentCard = (
    appointment: InternalAppointment,
    isHistory = false,
    isPendingClosure = false
  ) => {
    const isUpdating = updatingAppointmentId === appointment.id;

    return (
      <article
        key={appointment.id}
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-950">
              {appointment.title}
            </h3>

            <p className="mt-1 text-xs text-slate-500">
              {appointment.scheduledAt} ·{" "}
              {getAppointmentStatusLabel(appointment.status)}
            </p>
          </div>

          {appointment.inquiryId ? (
            <button
              type="button"
              onClick={() => openInquiry(appointment.inquiryId)}
              className="text-left text-xs font-semibold text-[#0F4C5C] hover:underline md:text-right"
            >
              Abrir caso
            </button>
          ) : null}
        </div>

        {isPendingClosure ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
            Esta cita interna ya ha pasado y sigue activa. Revísala y márcala
            como realizada o cancelada.
          </div>
        ) : null}

        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
          <div className="font-semibold text-slate-700">Caso asociado</div>
          <div>{appointment.inquiryLabel}</div>
          <div className="mt-1 text-slate-500">
            Estado del caso: {appointment.inquiryStatus}
          </div>
        </div>

        {appointment.notes ? (
          <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-slate-600">
            {appointment.notes}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {!isHistory ? (
            <Button
              variant="secondary"
              onClick={() => handleOpenEditForm(appointment)}
              disabled={isUpdating}
            >
              Editar
            </Button>
          ) : null}

          {appointment.status === "proposed" ? (
            <>
              <Button
                variant="secondary"
                onClick={() =>
                  handleUpdateAppointmentStatus(appointment.id, "confirmed")
                }
                disabled={isUpdating}
              >
                Marcar como confirmada
              </Button>

              <Button
                variant="ghost"
                onClick={() =>
                  handleUpdateAppointmentStatus(appointment.id, "cancelled")
                }
                disabled={isUpdating}
              >
                Cancelar
              </Button>
            </>
          ) : null}

          {appointment.status === "confirmed" ? (
            <>
              <Button
                variant="secondary"
                onClick={() =>
                  handleUpdateAppointmentStatus(appointment.id, "completed")
                }
                disabled={isUpdating}
              >
                Completar
              </Button>

              <Button
                variant="ghost"
                onClick={() =>
                  handleUpdateAppointmentStatus(appointment.id, "cancelled")
                }
                disabled={isUpdating}
              >
                Cancelar
              </Button>
            </>
          ) : null}

          {isHistory ? (
            <Button
              variant="secondary"
              onClick={() =>
                handleUpdateAppointmentStatus(appointment.id, "proposed")
              }
              disabled={isUpdating}
            >
              Reabrir como pendiente
            </Button>
          ) : null}
        </div>
      </article>
    );
  };

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

      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-[1fr_220px_auto] md:items-end">
          <label className="text-sm font-medium text-slate-700">
            Buscar cita
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
              placeholder="Buscar por título, caso o notas..."
            />
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
      </div>

      {showForm ? (
        <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                {isEditing ? "Editar cita interna" : "Crear cita interna"}
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                {isEditing
                  ? "Actualiza el título, la fecha o las notas de esta cita interna."
                  : "Asocia una cita interna a un caso existente. No se enviará ninguna confirmación automática al cliente."}
              </p>
            </div>

            <button
              type="button"
              onClick={handleCancelForm}
              className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="Cerrar formulario"
            >
              <X size={18} />
            </button>
          </div>

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
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
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
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                placeholder="Ej. Cita con cliente"
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Fecha y hora
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
              />
            </label>

            <label className="text-sm font-medium text-slate-700 md:col-span-2">
              Notas
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="mt-1 min-h-[100px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                placeholder="Ej. Detalles relevantes para preparar la cita..."
              />
            </label>
          </div>

          {formErrorMessage ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formErrorMessage}
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
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

            <Button variant="secondary" onClick={handleCancelForm}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

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
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          Cargando agenda interna...
        </div>
      ) : null}

      {!isLoading && !errorMessage ? (
        <>
          <section>
            <h2 className="mb-3 text-lg font-bold text-slate-950">
              Pendientes de cerrar
            </h2>

            {pendingClosureAppointments.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
                {hasActiveFilters
                  ? "No hay citas internas pendientes de cerrar que coincidan con los filtros."
                  : "No hay citas internas activas con fecha pasada."}
              </div>
            ) : (
              <div className="space-y-3">
                {pendingClosureAppointments.map((appointment) =>
                  renderAppointmentCard(appointment, false, true)
                )}
              </div>
            )}
          </section>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <section>
              <h2 className="mb-3 text-lg font-bold text-slate-950">
                Pendientes de confirmar
              </h2>

              {pendingConfirmationAppointments.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
                  {hasActiveFilters
                    ? "No hay citas internas pendientes que coincidan con los filtros."
                    : "No hay citas internas pendientes de confirmar."}
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingConfirmationAppointments.map((appointment) =>
                    renderAppointmentCard(appointment)
                  )}
                </div>
              )}
            </section>

            <section>
              <h2 className="mb-3 text-lg font-bold text-slate-950">
                Confirmadas internamente
              </h2>

              {confirmedAppointments.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
                  {hasActiveFilters
                    ? "No hay citas internas confirmadas que coincidan con los filtros."
                    : "No hay citas internas confirmadas."}
                </div>
              ) : (
                <div className="space-y-3">
                  {confirmedAppointments.map((appointment) =>
                    renderAppointmentCard(appointment)
                  )}
                </div>
              )}
            </section>
          </div>
        </>
      ) : null}

      {!isLoading && !errorMessage ? (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold text-slate-950">Historial</h2>

          {historyAppointments.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
              {hasActiveFilters
                ? "No hay citas internas del historial que coincidan con los filtros."
                : "Todavía no hay citas internas realizadas o canceladas."}
            </div>
          ) : (
            <div className="space-y-3">
              {historyAppointments.map((appointment) =>
                renderAppointmentCard(appointment, true)
              )}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
