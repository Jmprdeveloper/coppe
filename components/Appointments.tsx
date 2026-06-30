"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import {
  AlertTriangle,
  CalendarCheck2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  History,
  MapPin,
  Plus,
  Search,
  UserRound,
  X,
} from "lucide-react";

import {
  compareAppointmentsByScheduledAt,
  getAppointmentStatusLabel,
  isAppointmentPendingClosure,
  mapAppointmentRowToAppointment,
  type AppointmentRow,
} from "../lib/appointmentUtils";
import {
  addDaysToDateKey,
  formatAppointmentTimeRange,
  formatDateKey,
  getAppointmentConflictMessage,
  getLocalDateKey,
  getTodayDateKey,
} from "../lib/appointmentScheduling";
import { normalizeInquiryStatus } from "../lib/inquiryUtils";
import { createClient } from "../lib/supabase/client";
import { classNames } from "../lib/utils";
import { actionStyles } from "../lib/visualSystem";
import type { Appointment, AppointmentStatus } from "../types";

import { AutoDismissAlert } from "./AutoDismissAlert";
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

type AppointmentRowWithCompany = AppointmentRow & {
  company_id: string;
};

type AppointmentTeamMember = {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
};

type InternalAppointment = Appointment & {
  companyId: string;
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

type AppointmentColumnTone = "warning" | "appointment" | "success";

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
  row: AppointmentRowWithCompany,
  inquiryById: Map<string, InquiryOptionRow>,
): InternalAppointment {
  const appointment = mapAppointmentRowToAppointment(row);
  const relatedInquiry = row.inquiry_id
    ? inquiryById.get(row.inquiry_id)
    : undefined;

  return {
    ...appointment,
    companyId: row.company_id,
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
    return "border-[#6D9BA7] bg-white text-[#083640]";
  }

  if (status === "proposed") {
    return "border-[#8FB8C2] bg-white text-[#0B3F4C]";
  }

  if (status === "confirmed") {
    return "border-[#A7C9D1] bg-white text-[#0F4C5C]";
  }

  if (status === "completed") {
    return "border-[#B8D1D8] bg-white text-[#315F69]";
  }

  return "border-[#D2E4E8] bg-white text-[#5C7780]";
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
      className={classNames(
        isPendingClosure
          ? "inline-flex w-fit items-center whitespace-nowrap rounded-xl border px-3 py-2 text-xs font-bold shadow-sm shadow-[#0F4C5C]/10"
          : "inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        getStatusBadgeClassName(status, isPendingClosure),
      )}
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
    return {
      rail: "bg-[#083640]",
    };
  }

  if (tone === "appointment") {
    return {
      rail: "bg-[#0B3F4C]",
    };
  }

  return {
    rail: "bg-[#0F4C5C]",
  };
}

function getHistoryStatusClassName(status: AppointmentStatus) {
  if (status === "completed") {
    return "border-[#B8D1D8] bg-white text-[#0B3F4C]";
  }

  if (status === "cancelled") {
    return "border-[#D2E4E8] bg-white text-[#5C7780]";
  }

  return "border-[#D2E4E8] bg-white text-[#315F69]";
}

function MetricCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="h-[116px] animate-pulse rounded-2xl border border-[#D2E4E8] bg-[#EAF5F7] shadow-sm shadow-[#0F4C5C]/5"
        />
      ))}
    </div>
  );
}

type AppointmentAuditAction =
  | "create_appointment"
  | "update_appointment"
  | "confirm_appointment"
  | "complete_appointment"
  | "cancel_appointment"
  | "reopen_appointment";

type AppointmentAuditMetadata = {
  inquiry_id?: string;
  customer_id?: string;
  scheduled_at?: string;
  previous_status?: AppointmentStatus;
  next_status?: AppointmentStatus;
  changed_fields?: string[];
  title_length?: number;
};

function getAppointmentStatusAuditAction(
  previousStatus: AppointmentStatus | null | undefined,
  nextStatus: AppointmentStatus,
): AppointmentAuditAction {
  if (nextStatus === "confirmed") {
    return "confirm_appointment";
  }

  if (nextStatus === "completed") {
    return "complete_appointment";
  }

  if (nextStatus === "cancelled") {
    return "cancel_appointment";
  }

  if (nextStatus === "proposed" && previousStatus !== "proposed") {
    return "reopen_appointment";
  }

  return "update_appointment";
}

export function Appointments({ openInquiry }: AppointmentsProps) {
  const supabase = useMemo(() => createClient(), []);

  const createAppointmentAuditLog = async ({
    companyId,
    appointmentId,
    action,
    metadata,
  }: {
    companyId: string;
    appointmentId: string;
    action: AppointmentAuditAction;
    metadata: AppointmentAuditMetadata;
  }) => {
    const { error } = await supabase.rpc("create_audit_log", {
      target_company_id: companyId,
      audit_action: action,
      audit_entity_type: "appointment",
      audit_entity_id: appointmentId,
      audit_metadata: metadata,
    });

    if (error) {
      console.error(
        "Appointment updated, but could not create audit log:",
        error,
      );
    }
  };

  const [appointments, setAppointments] = useState<InternalAppointment[]>([]);
  const [inquiryOptions, setInquiryOptions] = useState<InquiryOptionRow[]>([]);
  const [teamMembers, setTeamMembers] = useState<AppointmentTeamMember[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editingAppointmentId, setEditingAppointmentId] = useState<
    string | null
  >(null);
  const [selectedInquiryId, setSelectedInquiryId] = useState("");
  const [title, setTitle] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [assignedTo, setAssignedTo] = useState("");
  const [location, setLocation] = useState("");
  const [bufferBeforeMinutes, setBufferBeforeMinutes] = useState(0);
  const [bufferAfterMinutes, setBufferAfterMinutes] = useState(0);
  const [timezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Madrid",
  );
  const [notes, setNotes] = useState("");
  const [selectedDay, setSelectedDay] = useState(() =>
    getTodayDateKey("Europe/Madrid"),
  );

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
  const [currentTimeMs, setCurrentTimeMs] = useState(0);

  useEffect(() => {
    async function loadAppointmentsAndInquiries() {
      setIsLoading(true);
      setErrorMessage("");
      setSuccessMessage("");
      setFormErrorMessage("");
      setCurrentTimeMs(Date.now());

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
              "company_id",
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
        (appointmentsData ?? []) as unknown as AppointmentRowWithCompany[]
      )
        .map((appointmentRow) =>
          mapAppointmentRowToInternalAppointment(appointmentRow, inquiryById),
        )
        .sort(compareAppointmentsByScheduledAt);

      setAppointments(mappedAppointments);
      setInquiryOptions(activeInquiryOptions);

      const companyId =
        mappedInquiries[0]?.company_id ?? mappedAppointments[0]?.companyId;

      if (companyId) {
        const [{ data: membersData }, { data: authData }] = await Promise.all([
          supabase.rpc("get_company_team_members", {
            target_company_id: companyId,
          }),
          supabase.auth.getUser(),
        ]);
        const members = (membersData ?? []) as AppointmentTeamMember[];
        const currentUserId = authData.user?.id ?? "";

        setTeamMembers(members);
        setAssignedTo((currentValue) => {
          if (
            currentValue &&
            members.some((member) => member.user_id === currentValue)
          ) {
            return currentValue;
          }

          return members.some((member) => member.user_id === currentUserId)
            ? currentUserId
            : members[0]?.user_id ?? "";
        });
      }

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

  const selectedDayAppointments = appointments.filter(
    (appointment) =>
      getLocalDateKey(appointment.scheduledAtIso, appointment.timezone) ===
      selectedDay,
  );

  const visibleDays = Array.from({ length: 7 }, (_, index) =>
    addDaysToDateKey(selectedDay, index - 3),
  );

  const getTeamMemberLabel = (userId: string) => {
    if (!userId) {
      return "Equipo (cita antigua)";
    }

    const member = teamMembers.find((candidate) => candidate.user_id === userId);

    return member?.full_name.trim() || member?.email || "Responsable no disponible";
  };

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
    setDurationMinutes(60);
    setLocation("");
    setBufferBeforeMinutes(0);
    setBufferAfterMinutes(0);
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
    setDurationMinutes(appointment.durationMinutes);
    setAssignedTo(appointment.assignedTo);
    setLocation(appointment.location);
    setBufferBeforeMinutes(appointment.bufferBeforeMinutes);
    setBufferAfterMinutes(appointment.bufferAfterMinutes);
    setNotes(appointment.notes);
  };

  const handleCancelForm = () => {
    if (isSaving) {
      return;
    }

    setShowForm(false);
    resetForm();
  };

  const handleClearCreateForm = () => {
    if (isSaving || isEditing) {
      return;
    }

    resetForm();
    setSelectedInquiryId("");
    setSuccessMessage("");
  };

  useEffect(() => {
    if (!showForm) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !isSaving) {
        setShowForm(false);
        setEditingAppointmentId(null);
        setTitle("");
        setScheduledAt("");
        setDurationMinutes(60);
        setLocation("");
        setBufferBeforeMinutes(0);
        setBufferAfterMinutes(0);
        setNotes("");
        setFormErrorMessage("");
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSaving, showForm]);

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

    if (!assignedTo) {
      setFormErrorMessage(
        "Selecciona a la persona responsable de atender la cita.",
      );
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
    const appointmentCompanyId =
      editingAppointment?.companyId ?? selectedInquiry?.company_id;

    if (!appointmentCompanyId) {
      setFormErrorMessage("No se pudo identificar la empresa de esta cita.");
      return;
    }

    setIsSaving(true);

    const { data: conflicts, error: availabilityError } = await supabase.rpc(
      "check_appointment_availability",
      {
        p_company_id: appointmentCompanyId,
        p_scheduled_at: scheduledAtIso,
        p_duration_minutes: durationMinutes,
        p_assigned_to: assignedTo,
        p_buffer_before_minutes: bufferBeforeMinutes,
        p_buffer_after_minutes: bufferAfterMinutes,
        p_exclude_appointment_id: editingAppointment?.id ?? null,
      },
    );

    if (availabilityError) {
      setIsSaving(false);
      setFormErrorMessage(
        `No se pudo comprobar la disponibilidad: ${
          availabilityError.message || "sin detalle del error"
        }`,
      );
      return;
    }

    if (Array.isArray(conflicts) && conflicts.length > 0) {
      setIsSaving(false);
      setFormErrorMessage(
        "Ese profesional ya tiene una cita o un tiempo de preparación protegido en ese intervalo. Elige otra hora o responsable.",
      );
      return;
    }

    if (editingAppointment) {
      const { data, error } = await supabase
        .from("appointments")
        .update({
          title: cleanTitle,
          scheduled_at: scheduledAtIso,
          duration_minutes: durationMinutes,
          assigned_to: assignedTo,
          timezone,
          location: location.trim() || null,
          buffer_before_minutes: bufferBeforeMinutes,
          buffer_after_minutes: bufferAfterMinutes,
          notes: notes.trim() || null,
        })
        .eq("id", editingAppointment.id)
        .select(
          [
            "id",
            "company_id",
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
          ].join(", "),
        )
        .single<AppointmentRowWithCompany>();

      setIsSaving(false);

      if (error || !data) {
        const conflictMessage = getAppointmentConflictMessage(error);

        setFormErrorMessage(
          conflictMessage ||
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

      const changedFields = [];

      if (editingAppointment.title !== mappedAppointment.title) {
        changedFields.push("title");
      }

      if (
        editingAppointment.scheduledAtIso !== mappedAppointment.scheduledAtIso
      ) {
        changedFields.push("scheduled_at");
      }

      if (editingAppointment.notes !== mappedAppointment.notes) {
        changedFields.push("notes");
      }

      if (
        editingAppointment.durationMinutes !==
        mappedAppointment.durationMinutes
      ) {
        changedFields.push("duration_minutes");
      }

      if (editingAppointment.assignedTo !== mappedAppointment.assignedTo) {
        changedFields.push("assigned_to");
      }

      await createAppointmentAuditLog({
        companyId: mappedAppointment.companyId,
        appointmentId: mappedAppointment.id,
        action: "update_appointment",
        metadata: {
          inquiry_id: mappedAppointment.inquiryId || undefined,
          customer_id: mappedAppointment.customerId || undefined,
          scheduled_at: mappedAppointment.scheduledAtIso,
          previous_status: editingAppointment.status,
          next_status: mappedAppointment.status,
          changed_fields: changedFields,
          title_length: mappedAppointment.title.length,
        },
      });

      setSuccessMessage("Cita interna actualizada correctamente.");

      window.setTimeout(() => {
        setShowForm(false);
        resetForm();
        setSuccessMessage("");
      }, 2200);

      return;
    }

    if (!selectedInquiry) {
      setFormErrorMessage("Selecciona un caso antes de crear la cita interna.");
      return;
    }

    const { data, error } = await supabase
      .from("appointments")
      .insert({
        company_id: selectedInquiry.company_id,
        customer_id: selectedInquiry.customer_id,
        inquiry_id: selectedInquiry.id,
        title: cleanTitle,
        scheduled_at: scheduledAtIso,
        duration_minutes: durationMinutes,
        assigned_to: assignedTo,
        timezone,
        location: location.trim() || null,
        buffer_before_minutes: bufferBeforeMinutes,
        buffer_after_minutes: bufferAfterMinutes,
        status: "proposed",
        notes: notes.trim() || null,
      })
      .select(
        [
          "id",
          "company_id",
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
        ].join(", "),
      )
      .single<AppointmentRowWithCompany>();

    setIsSaving(false);

    if (error || !data) {
      const conflictMessage = getAppointmentConflictMessage(error);

      setFormErrorMessage(
        conflictMessage ||
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

    await createAppointmentAuditLog({
      companyId: mappedAppointment.companyId,
      appointmentId: mappedAppointment.id,
      action: "create_appointment",
      metadata: {
        inquiry_id: mappedAppointment.inquiryId || undefined,
        customer_id: mappedAppointment.customerId || undefined,
        scheduled_at: mappedAppointment.scheduledAtIso,
        next_status: mappedAppointment.status,
        title_length: mappedAppointment.title.length,
      },
    });

    setSuccessMessage("Cita interna creada como pendiente de confirmar.");

    window.setTimeout(() => {
      setShowForm(false);
      resetForm();
      setSuccessMessage("");
    }, 2200);
  };

  const handleAppointmentFormKeyDown = (
    event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();

    if (isSaving || successMessage) {
      return;
    }

    handleSaveAppointment();
  };

  const handleUpdateAppointmentStatus = async (
    appointmentId: string,
    status: AppointmentStatus,
  ) => {
    setErrorMessage("");
    setSuccessMessage("");
    setFormErrorMessage("");
    setUpdatingAppointmentId(appointmentId);

    const previousAppointment = appointments.find(
      (appointment) => appointment.id === appointmentId,
    );

    const { data, error } = await supabase
      .from("appointments")
      .update({ status })
      .eq("id", appointmentId)
      .select(
        [
          "id",
          "company_id",
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
        ].join(", "),
      )
      .single<AppointmentRowWithCompany>();

    setUpdatingAppointmentId(null);

    if (error || !data) {
      const conflictMessage = getAppointmentConflictMessage(error);

      setErrorMessage(
        conflictMessage ||
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

    await createAppointmentAuditLog({
      companyId: mappedAppointment.companyId,
      appointmentId: mappedAppointment.id,
      action: getAppointmentStatusAuditAction(
        previousAppointment?.status,
        mappedAppointment.status,
      ),
      metadata: {
        inquiry_id: mappedAppointment.inquiryId || undefined,
        customer_id: mappedAppointment.customerId || undefined,
        scheduled_at: mappedAppointment.scheduledAtIso,
        previous_status: previousAppointment?.status,
        next_status: mappedAppointment.status,
      },
    });

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
    <Button
      className="min-h-10 min-w-[104px] px-4"
      variant={variant}
      onClick={onClick}
      disabled={isUpdating}
    >
      {label}
    </Button>
  );

  const renderActiveAppointmentCard = (
    appointment: InternalAppointment,
    tone: AppointmentColumnTone,
    isPendingClosure = false,
  ) => {
    const isUpdating = updatingAppointmentId === appointment.id;
    const cardClasses = getAppointmentCardClassName(tone, isPendingClosure);

    return (
      <article
        key={appointment.id}
        className="relative overflow-hidden rounded-2xl border border-[#B8D1D8] bg-white p-4 pl-5 shadow-sm shadow-[#0F4C5C]/10 transition hover:border-[#8FB8C2] hover:bg-[#F7FBFC] hover:shadow-md"
      >
        <span
          aria-hidden="true"
          className={classNames(
            "absolute inset-y-0 left-0 w-1",
            cardClasses.rail,
          )}
        />

        <div className="flex items-start justify-between gap-3">
          <AppointmentStatusBadge
            status={appointment.status}
            isPendingClosure={isPendingClosure}
          />

          {appointment.inquiryId ? (
            <button
              type="button"
              onClick={() => openInquiry(appointment.inquiryId)}
              className={actionStyles.openCase}
            >
              Abrir caso
              <ChevronRight size={14} />
            </button>
          ) : null}
        </div>

        <h3 className="mt-3 text-base font-bold text-[#073540]">
          {appointment.title}
        </h3>

        <div className="mt-1 text-sm font-medium text-[#456C75]">
          {appointment.scheduledAt}
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#315F69]">
          <span className="inline-flex items-center gap-1 rounded-full border border-[#D2E4E8] bg-[#F7FBFC] px-2.5 py-1">
            <Clock3 size={13} />
            {appointment.durationMinutes} min
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-[#D2E4E8] bg-[#F7FBFC] px-2.5 py-1">
            <UserRound size={13} />
            {getTeamMemberLabel(appointment.assignedTo)}
          </span>
          {appointment.location ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#D2E4E8] bg-[#F7FBFC] px-2.5 py-1">
              <MapPin size={13} />
              {appointment.location}
            </span>
          ) : null}
        </div>

        {isPendingClosure ? (
          <div className="mt-3 rounded-xl border border-[#A7C9D1] bg-[#F2FAFB] px-3 py-2 text-xs leading-5 text-[#0B3F4C]">
            Ya ha pasado y sigue activa. Cierra la cita como realizada o
            cancelada.
          </div>
        ) : null}

        <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
          <div className="rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2">
            <div className="font-semibold uppercase tracking-wide text-[#5C7780]">
              Caso asociado
            </div>
            <div className="mt-1 line-clamp-2 font-medium text-[#153F48]">
              {appointment.inquiryLabel}
            </div>
          </div>

          <div className="rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2">
            <div className="font-semibold uppercase tracking-wide text-[#5C7780]">
              Estado del caso
            </div>
            <div className="mt-1 font-medium text-[#153F48]">
              {appointment.inquiryStatus}
            </div>
          </div>
        </div>

        {appointment.notes ? (
          <div className="mt-3 rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-xs leading-5 text-[#456C75]">
            {appointment.notes}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#EAF5F7] pt-3">
          <div className="flex flex-wrap gap-2">
            {renderActionButton(
              "Editar",
              () => handleOpenEditForm(appointment),
              isUpdating,
            )}

            {appointment.status === "proposed" ? (
              <>
                {renderActionButton(
                  "Confirmar",
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
                  "secondary",
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
                  "secondary",
                )}
              </>
            ) : null}
          </div>
        </div>
      </article>
    );
  };

  const renderHistoryAppointmentRow = (appointment: InternalAppointment) => {
    const isUpdating = updatingAppointmentId === appointment.id;

    return (
      <article
        key={appointment.id}
        className="grid gap-3 rounded-2xl border border-[#D2E4E8] bg-white p-4 shadow-sm shadow-[#0F4C5C]/5 transition hover:border-[#B8D1D8] hover:bg-[#F7FBFC] lg:grid-cols-[160px_1fr_1fr_auto] lg:items-center"
      >
        <div>
          <span
            className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${getHistoryStatusClassName(
              appointment.status,
            )}`}
          >
            {getAppointmentStatusLabel(appointment.status)}
          </span>
          <div className="mt-2 text-xs font-medium text-[#6B858C]">
            {appointment.scheduledAt}
          </div>
        </div>

        <div className="min-w-0">
          <h3 className="font-semibold text-[#073540]">{appointment.title}</h3>
          {appointment.notes ? (
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#6B858C]">
              {appointment.notes}
            </p>
          ) : null}
        </div>

        <div className="rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-xs leading-5 text-[#456C75]">
          <div className="font-semibold text-[#153F48]">Caso asociado</div>
          <div className="line-clamp-1">{appointment.inquiryLabel}</div>
          <div className="mt-1 text-[#6B858C]">
            Estado del caso: {appointment.inquiryStatus}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          {appointment.inquiryId ? (
            <button
              type="button"
              className={actionStyles.openCase}
              onClick={() => openInquiry(appointment.inquiryId)}
              disabled={isUpdating}
            >
              Abrir caso
              <ChevronRight size={14} />
            </button>
          ) : null}

          <Button
            variant="secondary"
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
        <div className="rounded-2xl border border-[#D2E4E8] bg-white p-4 text-sm leading-6 text-[#456C75] shadow-sm shadow-[#0F4C5C]/5">
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
            tone="appointment"
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
            tone="note"
          />
        </div>
      )}

      <SectionCard
        className="mt-5"
        title="Agenda por día"
        description="Selecciona una fecha para ver, en orden, todas las citas y sus responsables."
        tone="appointment"
        action={
          <Button
            variant="secondary"
            onClick={() => setSelectedDay(getTodayDateKey("Europe/Madrid"))}
          >
            Hoy
          </Button>
        }
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Día anterior"
            title="Día anterior"
            onClick={() =>
              setSelectedDay((currentDay) =>
                addDaysToDateKey(currentDay, -1),
              )
            }
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#D2E4E8] bg-white text-[#315F69] transition hover:border-[#8FB8C2] hover:bg-[#F2FAFB]"
          >
            <ChevronLeft size={17} />
          </button>

          <div className="grid min-w-0 flex-1 grid-cols-3 gap-2 md:grid-cols-7">
            {visibleDays.map((dateKey) => {
              const count = appointments.filter(
                (appointment) =>
                  getLocalDateKey(
                    appointment.scheduledAtIso,
                    appointment.timezone,
                  ) === dateKey,
              ).length;
              const isSelected = dateKey === selectedDay;
              const [year, month, day] = dateKey.split("-").map(Number);
              const shortWeekday = new Intl.DateTimeFormat("es-ES", {
                weekday: "short",
                timeZone: "UTC",
              }).format(new Date(Date.UTC(year, month - 1, day, 12)));

              return (
                <button
                  key={dateKey}
                  type="button"
                  onClick={() => setSelectedDay(dateKey)}
                  className={classNames(
                    "min-w-0 rounded-2xl border px-2 py-3 text-center transition",
                    isSelected
                      ? "border-[#0F4C5C] bg-[#0F4C5C] text-white shadow-md shadow-[#0F4C5C]/15"
                      : "border-[#D2E4E8] bg-white text-[#315F69] hover:border-[#8FB8C2] hover:bg-[#F7FBFC]",
                    Math.abs(visibleDays.indexOf(dateKey) - 3) > 1 &&
                      "hidden md:block",
                  )}
                >
                  <span className="block text-[11px] font-bold uppercase tracking-wide">
                    {shortWeekday}
                  </span>
                  <span className="mt-1 block text-lg font-bold">{day}</span>
                  <span
                    className={classNames(
                      "mt-1 inline-flex min-w-5 justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                      isSelected
                        ? "bg-white/20 text-white"
                        : "bg-[#EAF5F7] text-[#315F69]",
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            aria-label="Día siguiente"
            title="Día siguiente"
            onClick={() =>
              setSelectedDay((currentDay) =>
                addDaysToDateKey(currentDay, 1),
              )
            }
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#D2E4E8] bg-white text-[#315F69] transition hover:border-[#8FB8C2] hover:bg-[#F2FAFB]"
          >
            <ChevronRight size={17} />
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-bold capitalize text-[#073540]">
              {formatDateKey(selectedDay)}
            </h3>
            <p className="mt-1 text-xs text-[#6B858C]">
              {selectedDayAppointments.length === 0
                ? "No hay citas en esta fecha."
                : `${selectedDayAppointments.length} ${
                    selectedDayAppointments.length === 1 ? "cita" : "citas"
                  } programadas.`}
            </p>
          </div>

          <input
            type="date"
            aria-label="Seleccionar fecha de agenda"
            value={selectedDay}
            onChange={(event) => setSelectedDay(event.target.value)}
            className="rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-sm text-[#153F48] outline-none focus:border-[#0F4C5C] focus:bg-white"
          />
        </div>

        <div className="mt-4 space-y-2">
          {selectedDayAppointments.map((appointment) => (
            <article
              key={appointment.id}
              className="grid gap-3 rounded-2xl border border-[#D2E4E8] bg-white p-4 shadow-sm shadow-[#0F4C5C]/5 md:grid-cols-[120px_1fr_auto] md:items-center"
            >
              <div>
                <div className="text-base font-bold text-[#0F4C5C]">
                  {formatAppointmentTimeRange(
                    appointment,
                    appointment.timezone,
                  )}
                </div>
                <div className="mt-1 text-xs text-[#6B858C]">
                  {appointment.durationMinutes} minutos
                </div>
              </div>

              <div className="min-w-0">
                <h4 className="truncate font-semibold text-[#073540]">
                  {appointment.title}
                </h4>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#456C75]">
                  <span className="inline-flex items-center gap-1">
                    <UserRound size={13} />
                    {getTeamMemberLabel(appointment.assignedTo)}
                  </span>
                  {appointment.location ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin size={13} />
                      {appointment.location}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-2 md:justify-end">
                <AppointmentStatusBadge status={appointment.status} />
                <Button
                  variant="secondary"
                  onClick={() => handleOpenEditForm(appointment)}
                >
                  Editar
                </Button>
              </div>
            </article>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        className="mt-5"
        title="Buscar y filtrar citas"
        description="Localiza citas internas por título, caso, estado o notas."
      >
        <div className="grid gap-4 md:grid-cols-[1fr_220px_auto] md:items-end">
          <label className="text-sm font-medium text-[#315F69]">
            Buscar cita
            <div className="mt-1 flex items-center gap-2 rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 focus-within:border-[#0F4C5C] focus-within:bg-white">
              <Search size={16} className="shrink-0 text-[#8AA5AC]" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full bg-transparent text-sm text-[#153F48] outline-none placeholder:text-[#8AA5AC]"
                placeholder="Buscar por título, caso o notas..."
              />
            </div>
          </label>

          <label className="text-sm font-medium text-[#315F69]">
            Estado
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as AppointmentStatusFilter)
              }
              className="mt-1 w-full rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-sm text-[#153F48] outline-none focus:border-[#0F4C5C] focus:bg-white"
            >
              <option value="all">Todas</option>
              <option value="proposed">Pendientes de confirmar</option>
              <option value="confirmed">Confirmadas</option>
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

        <p className="mt-3 text-xs text-[#6B858C]">
          Mostrando {filteredAppointments.length} de {appointments.length} citas
          internas.
        </p>
      </SectionCard>

      {showForm ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#062E36]/45 px-4 py-8 backdrop-blur-sm"
          onClick={handleCancelForm}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="appointment-modal-title"
            className="max-h-[calc(100vh-4rem)] w-full max-w-3xl overflow-y-auto rounded-3xl border border-[#B8D1D8] bg-white shadow-2xl shadow-[#062E36]/25"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#E5F0F2] px-6 py-5">
              <div>
                <div className="mb-2 inline-flex rounded-full border border-[#B8D1D8] bg-[#F2FAFB] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#0F4C5C]">
                  {isEditing ? "Editar cita interna" : "Crear cita interna"}
                </div>

                <h2
                  id="appointment-modal-title"
                  className="text-xl font-bold text-[#073540]"
                >
                  {isEditing ? "Editar cita interna" : "Crear cita interna"}
                </h2>

                <p className="mt-1 text-sm leading-6 text-[#456C75]">
                  {isEditing
                    ? "Actualiza el título, la fecha o las notas de esta cita interna."
                    : "Asocia una cita interna a un caso existente. COPPE no enviará ninguna confirmación automática al cliente."}
                </p>
              </div>

              <button
                type="button"
                onClick={handleCancelForm}
                disabled={isSaving}
                className="rounded-xl p-2 text-[#6B858C] transition hover:bg-[#F2FAFB] hover:text-[#0F4C5C] disabled:cursor-not-allowed disabled:opacity-50"
                title="Cerrar ventana"
                aria-label={
                  isEditing
                    ? "Cerrar formulario de edición de cita interna"
                    : "Cerrar formulario de nueva cita interna"
                }
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-5">
              <div className="grid gap-4 md:grid-cols-2">
                {isEditing ? (
                  <div className="text-sm font-medium text-[#315F69] md:col-span-2">
                    Caso asociado
                    <div className="mt-1 rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-sm font-normal text-[#456C75]">
                      {editingAppointment?.inquiryLabel || "Caso no indicado"}
                    </div>
                  </div>
                ) : (
                  <label className="text-sm font-medium text-[#315F69] md:col-span-2">
                    Caso asociado
                    <select
                      value={selectedInquiryId}
                      onKeyDown={handleAppointmentFormKeyDown}
                      onChange={(event) => {
                        setSelectedInquiryId(event.target.value);
                      }}
                      className="mt-1 w-full rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-sm text-[#153F48] outline-none transition focus:border-[#0F4C5C] focus:bg-white"
                    >
                      {inquiryOptions.length === 0 ? (
                        <option value="">
                          No hay casos activos disponibles
                        </option>
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

                <label className="text-sm font-medium text-[#315F69]">
                  Título
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    onKeyDown={handleAppointmentFormKeyDown}
                    className="mt-1 w-full rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-sm text-[#153F48] outline-none transition placeholder:text-[#8AA5AC] focus:border-[#0F4C5C] focus:bg-white"
                    placeholder="Escribe el título de la cita"
                    autoFocus
                  />
                </label>

                <label className="text-sm font-medium text-[#315F69]">
                  Fecha y hora
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(event) => setScheduledAt(event.target.value)}
                    onKeyDown={handleAppointmentFormKeyDown}
                    className="mt-1 w-full rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-sm text-[#153F48] outline-none transition focus:border-[#0F4C5C] focus:bg-white"
                  />
                </label>

                <label className="text-sm font-medium text-[#315F69]">
                  Duración
                  <select
                    value={durationMinutes}
                    onChange={(event) =>
                      setDurationMinutes(Number(event.target.value))
                    }
                    onKeyDown={handleAppointmentFormKeyDown}
                    className="mt-1 w-full rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-sm text-[#153F48] outline-none transition focus:border-[#0F4C5C] focus:bg-white"
                  >
                    {[15, 30, 45, 60, 90, 120, 180].map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes < 60
                          ? `${minutes} minutos`
                          : minutes % 60 === 0
                            ? `${minutes / 60} ${
                                minutes === 60 ? "hora" : "horas"
                              }`
                            : `${Math.floor(minutes / 60)} h ${
                                minutes % 60
                              } min`}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-medium text-[#315F69]">
                  Responsable
                  <select
                    value={assignedTo}
                    onChange={(event) => setAssignedTo(event.target.value)}
                    onKeyDown={handleAppointmentFormKeyDown}
                    className="mt-1 w-full rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-sm text-[#153F48] outline-none transition focus:border-[#0F4C5C] focus:bg-white"
                  >
                    <option value="">Selecciona un responsable</option>
                    {teamMembers.map((member) => (
                      <option key={member.user_id} value={member.user_id}>
                        {member.full_name.trim() || member.email}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-medium text-[#315F69]">
                  Preparación previa
                  <select
                    value={bufferBeforeMinutes}
                    onChange={(event) =>
                      setBufferBeforeMinutes(Number(event.target.value))
                    }
                    onKeyDown={handleAppointmentFormKeyDown}
                    className="mt-1 w-full rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-sm text-[#153F48] outline-none transition focus:border-[#0F4C5C] focus:bg-white"
                  >
                    {[0, 5, 10, 15, 30, 45, 60].map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes === 0 ? "Sin tiempo previo" : `${minutes} min`}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-medium text-[#315F69]">
                  Margen posterior
                  <select
                    value={bufferAfterMinutes}
                    onChange={(event) =>
                      setBufferAfterMinutes(Number(event.target.value))
                    }
                    onKeyDown={handleAppointmentFormKeyDown}
                    className="mt-1 w-full rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-sm text-[#153F48] outline-none transition focus:border-[#0F4C5C] focus:bg-white"
                  >
                    {[0, 5, 10, 15, 30, 45, 60].map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes === 0
                          ? "Sin margen posterior"
                          : `${minutes} min`}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-medium text-[#315F69] md:col-span-2">
                  Ubicación o enlace
                  <input
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                    onKeyDown={handleAppointmentFormKeyDown}
                    maxLength={300}
                    className="mt-1 w-full rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-sm text-[#153F48] outline-none transition placeholder:text-[#8AA5AC] focus:border-[#0F4C5C] focus:bg-white"
                    placeholder="Oficina, dirección, teléfono o enlace de videollamada"
                  />
                </label>

                <label className="text-sm font-medium text-[#315F69] md:col-span-2">
                  Notas
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    className="mt-1 min-h-[100px] w-full rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-sm text-[#153F48] outline-none transition placeholder:text-[#8AA5AC] focus:border-[#0F4C5C] focus:bg-white"
                    placeholder="Añade detalles relevantes para preparar la cita..."
                  />
                </label>
              </div>

              <div className="mt-4 rounded-2xl border border-[#D2E4E8] bg-[#F7FBFC] px-4 py-3 text-xs leading-5 text-[#456C75]">
                COPPE comprobará la duración, los márgenes protegidos y la
                disponibilidad del responsable en la zona horaria {timezone}.
                La base de datos volverá a validarlo al guardar para impedir
                dobles reservas concurrentes.
              </div>

              {formErrorMessage ? (
                <div className="mt-4 rounded-2xl border border-[#6D9BA7] bg-[#F2FAFB] px-4 py-3 text-sm text-[#083640]">
                  {formErrorMessage}
                </div>
              ) : null}

              <AutoDismissAlert
                className="mt-4 font-medium"
                message={successMessage}
                onDismiss={() => setSuccessMessage("")}
              />
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-[#E5F0F2] bg-[#F7FBFC] px-6 py-4 sm:flex-row sm:items-center sm:justify-end">
              <Button
                variant="secondary"
                onClick={handleCancelForm}
                disabled={isSaving}
              >
                Cancelar
              </Button>

              {!isEditing ? (
                <Button
                  variant="secondary"
                  onClick={handleClearCreateForm}
                  disabled={isSaving}
                >
                  Limpiar formulario
                </Button>
              ) : null}

              <Button
                onClick={handleSaveAppointment}
                disabled={
                  isSaving || (!isEditing && inquiryOptions.length === 0)
                }
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
          </section>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-5 rounded-2xl border border-[#6D9BA7] bg-[#F2FAFB] px-4 py-3 text-sm text-[#083640]">
          {errorMessage}
        </div>
      ) : null}

      <AutoDismissAlert
        className="mt-5"
        message={successMessage}
        onDismiss={() => setSuccessMessage("")}
      />

      {isLoading ? (
        <div className="mt-5 rounded-2xl border border-[#D2E4E8] bg-white p-6 text-sm text-[#456C75] shadow-sm shadow-[#0F4C5C]/5">
          Cargando agenda interna...
        </div>
      ) : null}

      {!isLoading && !errorMessage ? (
        <SectionCard
          className="mt-6"
          title="Agenda activa"
          description="Citas que todavía requieren validación, ejecución o cierre interno."
          tone="appointment"
          action={
            <div className="hidden items-center gap-2 rounded-full border border-[#B8D1D8] bg-white px-3 py-1 text-xs font-semibold text-[#315F69] shadow-sm shadow-[#0F4C5C]/5 md:flex">
              <CheckCircle2 size={15} />
              No se envía ninguna confirmación automática al cliente.
            </div>
          }
        >
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
              tone: "appointment",
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
        </SectionCard>
      ) : null}

      {!isLoading && !errorMessage ? (
        <SectionCard
          className="mt-6"
          title="Historial"
          description="Citas internas realizadas o canceladas, en formato compacto."
          tone="archived"
          action={
            <span className="rounded-full border border-[#B8D1D8] bg-white px-3 py-1 text-xs font-semibold text-[#315F69] shadow-sm shadow-[#0F4C5C]/5">
              {historyAppointments.length}
            </span>
          }
        >
          {historyAppointments.length === 0 ? (
            <div className="rounded-2xl border border-[#D2E4E8] bg-white p-6 text-sm text-[#456C75] shadow-sm shadow-[#0F4C5C]/5">
              {hasActiveFilters
                ? "No hay citas internas del historial que coincidan con los filtros."
                : "Todavía no hay citas internas realizadas o canceladas."}
            </div>
          ) : (
            <div className="space-y-3">
              {historyAppointments.map(renderHistoryAppointmentRow)}
            </div>
          )}
        </SectionCard>
      ) : null}
    </div>
  );
}
