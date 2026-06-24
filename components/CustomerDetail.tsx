"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  MessageSquareText,
  NotebookText,
  UserRound,
} from "lucide-react";

import {
  compareAppointmentsByScheduledAt,
  getAppointmentStatusLabel,
  isAppointmentPendingClosure,
  mapAppointmentRowToAppointment,
  type AppointmentRow,
} from "../lib/appointmentUtils";
import {
  formatFollowUpDueAt,
  normalizeFollowUpStatus,
  resolveFollowUpUrgency,
} from "../lib/followUpUtils";
import {
  getCustomerDatabaseErrorMessage,
  isValidEmail,
  isValidPhone,
  normalizePhoneForComparison,
} from "../lib/customerValidation";
import { normalizeCustomerStatus } from "../lib/customerUtils";
import {
  formatDateTime,
  mapInquiryRowToInquiry,
  normalizeInquiryStatus,
  type InquiryRow,
} from "../lib/inquiryUtils";
import { createClient } from "../lib/supabase/client";
import { formatSourceChannel } from "../lib/sourceChannels";
import { actionStyles } from "../lib/visualSystem";
import type { Appointment, CustomerStatus, FollowUp, Inquiry } from "../types";

import { AutoDismissAlert } from "./AutoDismissAlert";
import { BoardColumn } from "./BoardColumn";
import { Button } from "./Button";
import { FollowUpCard } from "./FollowUpCard";
import { InquiryCard } from "./InquiryCard";
import { MetricCard } from "./MetricCard";
import { PageHeader } from "./PageHeader";
import { SectionCard } from "./SectionCard";

type CustomerDetailProps = {
  customerId: string;
  setActiveView: (view: string) => void;
  openInquiry: (id: string) => void;
};

type CustomerRow = {
  id: string;
  company_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  language: string | null;
  status: string;
  last_interaction_at: string | null;
  created_at: string;
};

type InternalNoteRow = {
  id: string;
  body: string;
  created_at: string;
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

type CustomerAppointment = Appointment & {
  scheduledAtValue: string;
};

type FollowUpActionMessage = {
  followUpId: string;
  message: string;
  updatedFollowUp: FollowUp;
};

function mapFollowUpRowToFollowUp(row: FollowUpRow): FollowUp {
  const status = normalizeFollowUpStatus(row.status);
  const urgency = resolveFollowUpUrgency(row.due_at, status, row.urgency);

  return {
    id: row.id,
    title: row.title,
    customerName: row.customer?.name || "Cliente no indicado",
    inquiryId: row.inquiry_id ?? "",
    dueAt: formatFollowUpDueAt(row.due_at, urgency),
    dueAtIso: row.due_at,
    status,
    urgency,
  };
}

function mapAppointmentRowToCustomerAppointment(
  row: AppointmentRow
): CustomerAppointment {
  const appointment = mapAppointmentRowToAppointment(row);

  return {
    ...appointment,
    scheduledAtValue: row.scheduled_at,
  };
}

function getDefaultFollowUpDateTimeLocal() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatLanguage(language: string | null) {
  if (language === "es") {
    return "Español";
  }

  if (language === "en") {
    return "Inglés";
  }

  return language || "No indicado";
}

function formatCustomerStatus(status: string) {
  const normalizedStatus = normalizeCustomerStatus(status);

  if (normalizedStatus === "active") {
    return "Activo";
  }

  if (normalizedStatus === "inactive") {
    return "Inactivo";
  }

  if (normalizedStatus === "archived") {
    return "Archivado";
  }

  return "Activo";
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

function getFollowUpStatusAuditAction(
  previousStatus: FollowUp["status"],
  nextStatus: FollowUp["status"]
) {
  if (nextStatus === "pending") {
    return "reopen_follow_up";
  }

  if (nextStatus === "completed") {
    return "complete_follow_up";
  }

  if (nextStatus === "cancelled") {
    return "cancel_follow_up";
  }

  if (previousStatus !== nextStatus) {
    return "update_follow_up_status";
  }

  return "update_follow_up";
}

function isActiveInquiry(inquiry: Inquiry) {
  const status = normalizeInquiryStatus(inquiry.status);

  return (
    status === "new" ||
    status === "pending" ||
    status === "waiting_customer"
  );
}

function getLatestSourceChannel(inquiries: Inquiry[]) {
  const latestInquiry = [...inquiries].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  )[0];

  if (!latestInquiry) {
    return "Sin canal todavía";
  }

  return formatSourceChannel(latestInquiry.sourceChannel);
}

function EmptyActivityCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#D2E4E8] bg-white px-4 py-5 text-sm leading-6 text-[#456C75] shadow-sm shadow-[#0F4C5C]/5">
      {children}
    </div>
  );
}

function CustomerInfoItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-[#B8D1D8] bg-gradient-to-br from-[#E2F0F3] via-[#F2FAFB] to-white px-4 py-3 shadow-sm shadow-[#0F4C5C]/10">
      <div className="text-xs font-semibold uppercase tracking-wide text-[#315F69]">
        {label}
      </div>

      <div className="mt-1 truncate text-sm font-bold text-[#073540]">
        {value}
      </div>
    </div>
  );
}

function NoteCard({ note }: { note: InternalNoteRow }) {
  return (
    <article className="rounded-2xl border border-[#B8D1D8] bg-[#F7FBFC] p-4 shadow-sm shadow-[#0F4C5C]/5">
      <p className="whitespace-pre-wrap text-sm leading-6 text-[#153F48]">
        {note.body}
      </p>

      <div className="mt-3 text-xs font-medium text-[#6B858C]">
        {formatDateTime(note.created_at)}
      </div>
    </article>
  );
}

function MetricCardsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="h-[116px] animate-pulse rounded-2xl border border-[#D2E4E8] bg-[#EAF5F7] shadow-sm shadow-[#0F4C5C]/5"
        />
      ))}
    </div>
  );
}

function getAppointmentCardStyles(
  appointment: CustomerAppointment,
  isPendingClosure: boolean
) {
  if (isPendingClosure) {
    return {
      rail: "bg-[#083640]",
      card: "border-[#8FB8C2] shadow-[#0F4C5C]/10",
      badge: "border-[#6D9BA7] bg-white text-[#083640]",
    };
  }

  if (appointment.status === "confirmed") {
    return {
      rail: "bg-[#0F4C5C]",
      card: "border-[#B8D1D8] shadow-[#0F4C5C]/10",
      badge: "border-[#A7C9D1] bg-white text-[#0F4C5C]",
    };
  }

  if (appointment.status === "proposed") {
    return {
      rail: "bg-[#0B3F4C]",
      card: "border-[#A7C9D1] shadow-[#0F4C5C]/10",
      badge: "border-[#8FB8C2] bg-white text-[#0B3F4C]",
    };
  }

  return {
    rail: "bg-[#B8D1D8]",
    card: "border-[#D2E4E8] shadow-[#0F4C5C]/5",
    badge: "border-[#D2E4E8] bg-white text-[#5C7780]",
  };
}

export function CustomerDetail({
  customerId,
  setActiveView,
  openInquiry,
}: CustomerDetailProps) {
  const supabase = useMemo(() => createClient(), []);

  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [notes, setNotes] = useState<InternalNoteRow[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [appointments, setAppointments] = useState<CustomerAppointment[]>([]);
  const [note, setNote] = useState("");

  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editLanguage, setEditLanguage] = useState("es");
  const [editStatus, setEditStatus] = useState<CustomerStatus>("active");

  const [showCreateFollowUpForm, setShowCreateFollowUpForm] = useState(false);
  const [selectedInquiryId, setSelectedInquiryId] = useState("");
  const [newFollowUpTitle, setNewFollowUpTitle] = useState("");
  const [newFollowUpDueAt, setNewFollowUpDueAt] = useState(
    getDefaultFollowUpDateTimeLocal()
  );

  const [isLoading, setIsLoading] = useState(true);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [isCreatingFollowUp, setIsCreatingFollowUp] = useState(false);
  const [updatingFollowUpId, setUpdatingFollowUpId] = useState<string | null>(
    null
  );

  const [errorMessage, setErrorMessage] = useState("");
  const [customerMessage, setCustomerMessage] = useState("");
  const [customerErrorMessage, setCustomerErrorMessage] = useState("");
  const [noteMessage, setNoteMessage] = useState("");
  const [noteErrorMessage, setNoteErrorMessage] = useState("");
  const [createFollowUpMessage, setCreateFollowUpMessage] = useState("");
  const [createFollowUpErrorMessage, setCreateFollowUpErrorMessage] =
    useState("");
  const [followUpActionMessage, setFollowUpActionMessage] =
    useState<FollowUpActionMessage | null>(null);
  const [followUpErrorMessage, setFollowUpErrorMessage] = useState("");
  const [currentTimeMs, setCurrentTimeMs] = useState(0);

  useEffect(() => {
    async function loadCustomerData() {
      setIsLoading(true);
      setErrorMessage("");
      setCustomerMessage("");
      setCustomerErrorMessage("");
      setNoteMessage("");
      setNoteErrorMessage("");
      setCreateFollowUpMessage("");
      setCreateFollowUpErrorMessage("");
      setFollowUpActionMessage(null);
      setFollowUpErrorMessage("");
      setCurrentTimeMs(Date.now());
      setCustomer(null);
      setNotes([]);
      setInquiries([]);
      setFollowUps([]);
      setAppointments([]);
      setNote("");
      setShowCreateFollowUpForm(false);
      setSelectedInquiryId("");
      setNewFollowUpTitle("");
      setNewFollowUpDueAt(getDefaultFollowUpDateTimeLocal());

      const { data: customerData, error: customerError } = await supabase
        .from("customers")
        .select(
          "id, company_id, name, email, phone, language, status, last_interaction_at, created_at"
        )
        .eq("id", customerId)
        .maybeSingle<CustomerRow>();

      if (customerError) {
        setErrorMessage(
          `No se pudo cargar el cliente: ${
            customerError.message || "sin detalle del error"
          }`
        );
        setIsLoading(false);
        return;
      }

      if (!customerData) {
        setErrorMessage(
          "No se encontró este cliente o no pertenece a tu empresa."
        );
        setIsLoading(false);
        return;
      }

      const { data: notesData, error: notesError } = await supabase
        .from("internal_notes")
        .select("id, body, created_at")
        .eq("customer_id", customerData.id)
        .is("inquiry_id", null)
        .order("created_at", { ascending: false });

      if (notesError) {
        setErrorMessage(
          `Se cargó el cliente, pero no se pudieron cargar sus notas: ${
            notesError.message || "sin detalle del error"
          }`
        );
        setIsLoading(false);
        return;
      }

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
        .eq("customer_id", customerData.id)
        .order("created_at", { ascending: false });

      if (inquiriesError) {
        setErrorMessage(
          `Se cargó el cliente, pero no se pudieron cargar sus casos: ${
            inquiriesError.message || "sin detalle del error"
          }`
        );
        setIsLoading(false);
        return;
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
        .eq("customer_id", customerData.id)
        .order("due_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (followUpsError) {
        setErrorMessage(
          `Se cargó el cliente, pero no se pudieron cargar sus seguimientos: ${
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
          .eq("customer_id", customerData.id)
          .order("scheduled_at", { ascending: true });

      if (appointmentsError) {
        setErrorMessage(
          `Se cargó el cliente, pero no se pudieron cargar sus citas internas: ${
            appointmentsError.message || "sin detalle del error"
          }`
        );
        setIsLoading(false);
        return;
      }

      const mappedInquiries = (
        (inquiriesData ?? []) as unknown as InquiryRow[]
      ).map(mapInquiryRowToInquiry);

      const activeInquiries = mappedInquiries.filter(isActiveInquiry);

      setCustomer(customerData);
      setEditName(customerData.name);
      setEditEmail(customerData.email ?? "");
      setEditPhone(customerData.phone ?? "");
      setEditLanguage(customerData.language ?? "es");
      setEditStatus(normalizeCustomerStatus(customerData.status));
      setNotes((notesData ?? []) as InternalNoteRow[]);
      setInquiries(mappedInquiries);
      setFollowUps(
        ((followUpsData ?? []) as unknown as FollowUpRow[]).map(
          mapFollowUpRowToFollowUp
        )
      );
      setAppointments(
        ((appointmentsData ?? []) as unknown as AppointmentRow[])
          .map(mapAppointmentRowToCustomerAppointment)
          .sort(compareAppointmentsByScheduledAt)
      );
      setSelectedInquiryId(activeInquiries[0]?.id ?? "");
      setNewFollowUpTitle(`Revisar caso de ${customerData.name}`);
      setNewFollowUpDueAt(getDefaultFollowUpDateTimeLocal());
      setIsLoading(false);
    }

    loadCustomerData();
  }, [customerId, supabase]);

  const activeInquiries = inquiries.filter(isActiveInquiry);

  const selectedInquiry =
    activeInquiries.find((inquiry) => inquiry.id === selectedInquiryId) ??
    activeInquiries[0] ??
    null;

  const applyFollowUpActionMessage = () => {
    if (!followUpActionMessage) {
      return;
    }

    setFollowUps((currentFollowUps) =>
      currentFollowUps.map((followUp) =>
        followUp.id === followUpActionMessage.followUpId
          ? followUpActionMessage.updatedFollowUp
          : followUp
      )
    );
    setFollowUpActionMessage(null);
  };

  const dismissFollowUpActionMessage = (followUpId: string) => {
    if (followUpActionMessage?.followUpId !== followUpId) {
      return;
    }

    setFollowUps((currentFollowUps) =>
      currentFollowUps.map((followUp) =>
        followUp.id === followUpActionMessage.followUpId
          ? followUpActionMessage.updatedFollowUp
          : followUp
      )
    );
    setFollowUpActionMessage(null);
  };

  const handleSaveCustomer = async () => {
    setCustomerMessage("");
    setCustomerErrorMessage("");

    if (!customer) {
      setCustomerErrorMessage(
        "No se puede guardar porque no hay cliente cargado."
      );
      return;
    }

    const cleanName = editName.trim();
    const cleanEmail = editEmail.trim().toLowerCase();
    const cleanPhone = editPhone.trim();
    const cleanLanguage = editLanguage.trim() || "es";
    const cleanStatus = normalizeCustomerStatus(editStatus);

    if (!cleanName) {
      setCustomerErrorMessage("El nombre del cliente es obligatorio.");
      return;
    }

    if (!cleanEmail && !cleanPhone) {
      setCustomerErrorMessage(
        "Introduce al menos un email o un teléfono para poder identificar al cliente."
      );
      return;
    }

    if (cleanEmail && !isValidEmail(cleanEmail)) {
      setCustomerErrorMessage("El email no tiene un formato válido.");
      return;
    }

    if (cleanPhone && !isValidPhone(cleanPhone)) {
      setCustomerErrorMessage(
        "El teléfono no tiene un formato válido. Usa un número real, por ejemplo +34 600 000 000."
      );
      return;
    }

    setIsSavingCustomer(true);

    if (cleanEmail) {
      const { data: existingCustomer, error: existingCustomerError } =
        await supabase
          .from("customers")
          .select("id")
          .eq("company_id", customer.company_id)
          .eq("email", cleanEmail)
          .neq("id", customer.id)
          .limit(1)
          .maybeSingle<{ id: string }>();

      if (existingCustomerError) {
        setIsSavingCustomer(false);
        setCustomerErrorMessage(
          `No se pudo comprobar si el email ya existe: ${
            existingCustomerError.message || "sin detalle del error"
          }`
        );
        return;
      }

      if (existingCustomer) {
        setIsSavingCustomer(false);
        setCustomerErrorMessage(
          "Ya existe otro cliente con ese email en esta empresa."
        );
        return;
      }
    }

    if (cleanPhone) {
      const { data: existingCustomersByPhone, error: existingPhoneError } =
        await supabase
          .from("customers")
          .select("id, phone")
          .eq("company_id", customer.company_id)
          .neq("id", customer.id);

      if (existingPhoneError) {
        setIsSavingCustomer(false);
        setCustomerErrorMessage(
          `No se pudo comprobar si el teléfono ya existe: ${
            existingPhoneError.message || "sin detalle del error"
          }`
        );
        return;
      }

      const normalizedNewPhone = normalizePhoneForComparison(cleanPhone);

      const duplicatedPhoneCustomer = (
        (existingCustomersByPhone ?? []) as Pick<CustomerRow, "id" | "phone">[]
      ).find((existingCustomer) => {
        return (
          normalizePhoneForComparison(existingCustomer.phone) ===
          normalizedNewPhone
        );
      });

      if (duplicatedPhoneCustomer) {
        setIsSavingCustomer(false);
        setCustomerErrorMessage(
          "Ya existe otro cliente con ese teléfono en esta empresa."
        );
        return;
      }
    }

    const previousName = customer.name;
    const previousEmail = customer.email ?? "";
    const previousPhone = customer.phone ?? "";
    const previousLanguage = customer.language ?? "es";
    const previousStatus = normalizeCustomerStatus(customer.status);

    const { data: updatedCustomer, error: updateCustomerError } = await supabase
      .from("customers")
      .update({
        name: cleanName,
        email: cleanEmail || null,
        phone: cleanPhone || null,
        language: cleanLanguage,
        status: cleanStatus,
      })
      .eq("id", customer.id)
      .select(
        "id, company_id, name, email, phone, language, status, last_interaction_at, created_at"
      )
      .single<CustomerRow>();

    if (updateCustomerError || !updatedCustomer) {
      setIsSavingCustomer(false);
      setCustomerErrorMessage(
        `No se pudieron guardar los cambios: ${getCustomerDatabaseErrorMessage(
          updateCustomerError?.message ?? ""
        )}`
      );
      return;
    }

    const changedFields: string[] = [];

    if (cleanName !== previousName) {
      changedFields.push("name");
    }

    if (cleanEmail !== previousEmail) {
      changedFields.push("email");
    }

    if (cleanPhone !== previousPhone) {
      changedFields.push("phone");
    }

    if (cleanLanguage !== previousLanguage) {
      changedFields.push("language");
    }

    if (cleanStatus !== previousStatus) {
      changedFields.push("status");
    }

    let auditWarningMessage = "";

    if (changedFields.length > 0) {
      const { error: auditLogError } = await supabase.rpc("create_audit_log", {
        target_company_id: customer.company_id,
        audit_action:
          changedFields.length === 1 && changedFields[0] === "status"
            ? "update_customer_status"
            : "update_customer",
        audit_entity_type: "customer",
        audit_entity_id: customer.id,
        audit_metadata: {
          changed_fields: changedFields,
          previous_status: previousStatus,
          next_status: cleanStatus,
          name_changed: changedFields.includes("name"),
          email_changed: changedFields.includes("email"),
          phone_changed: changedFields.includes("phone"),
          language_changed: changedFields.includes("language"),
          status_changed: changedFields.includes("status"),
          source: "customer_detail",
        },
      });

      if (auditLogError) {
        console.error(
          "Customer updated, but could not create audit log:",
          auditLogError
        );

        auditWarningMessage =
          " Advertencia: no se pudo registrar la auditoría del cliente.";
      }
    }

    if (cleanName !== previousName) {
      const { error: updateInquiriesError } = await supabase
        .from("inquiries")
        .update({
          customer_name: cleanName,
        })
        .eq("customer_id", customer.id);

      if (updateInquiriesError) {
        setIsSavingCustomer(false);
        setCustomer(updatedCustomer);
        setInquiries((currentInquiries) =>
          currentInquiries.map((inquiry) => ({
            ...inquiry,
            customerName: cleanName,
          }))
        );
        setFollowUps((currentFollowUps) =>
          currentFollowUps.map((followUp) => ({
            ...followUp,
            customerName: cleanName,
          }))
        );
        setCustomerErrorMessage(
          `El cliente se guardó, pero no se pudo actualizar el nombre en sus casos: ${
            updateInquiriesError.message || "sin detalle del error"
          }`
        );
        return;
      }
    }

    setIsSavingCustomer(false);
    setCustomer(updatedCustomer);
    setEditName(updatedCustomer.name);
    setEditEmail(updatedCustomer.email ?? "");
    setEditPhone(updatedCustomer.phone ?? "");
    setEditLanguage(updatedCustomer.language ?? "es");
    setEditStatus(normalizeCustomerStatus(updatedCustomer.status));
    setInquiries((currentInquiries) =>
      currentInquiries.map((inquiry) => ({
        ...inquiry,
        customerName: cleanName,
      }))
    );
    setFollowUps((currentFollowUps) =>
      currentFollowUps.map((followUp) => ({
        ...followUp,
        customerName: cleanName,
      }))
    );
    setNewFollowUpTitle(`Revisar caso de ${cleanName}`);
    setCustomerMessage(
      `Datos del cliente guardados correctamente.${auditWarningMessage}`
    );
  };

  const handleSaveNote = async () => {
    setNoteMessage("");
    setNoteErrorMessage("");

    if (!customer) {
      setNoteErrorMessage(
        "No se puede guardar la nota porque no hay cliente cargado."
      );
      return;
    }

    const cleanNote = note.trim();

    if (!cleanNote) {
      setNoteErrorMessage("Escribe una nota antes de guardarla.");
      return;
    }

    setIsSavingNote(true);

    const { data, error } = await supabase
      .from("internal_notes")
      .insert({
        company_id: customer.company_id,
        customer_id: customer.id,
        inquiry_id: null,
        body: cleanNote,
      })
      .select("id, body, created_at")
      .single<InternalNoteRow>();

    setIsSavingNote(false);

    if (error) {
      setNoteErrorMessage(
        `No se pudo guardar la nota: ${
          error.message || "sin detalle del error"
        }`
      );
      return;
    }

    let auditWarningMessage = "";

    const { error: auditLogError } = await supabase.rpc("create_audit_log", {
      target_company_id: customer.company_id,
      audit_action: "create_internal_note",
      audit_entity_type: "internal_note",
      audit_entity_id: data.id,
      audit_metadata: {
        customer_id: customer.id,
        inquiry_id: null,
        body_length: cleanNote.length,
        source: "customer_detail",
      },
    });

    if (auditLogError) {
      console.error(
        "Internal note created, but could not create audit log:",
        auditLogError
      );

      auditWarningMessage =
        " Advertencia: no se pudo registrar la auditoría de la nota.";
    }

    setNotes((currentNotes) => [data, ...currentNotes]);
    setNote("");
    setNoteMessage(`Nota guardada correctamente.${auditWarningMessage}`);
  };

  const handleOpenCreateFollowUpForm = () => {
    setCreateFollowUpMessage("");
    setCreateFollowUpErrorMessage("");

    if (selectedInquiry) {
      setSelectedInquiryId(selectedInquiry.id);
    }

    setNewFollowUpTitle(`Revisar caso de ${customer?.name || "cliente"}`);
    setNewFollowUpDueAt(getDefaultFollowUpDateTimeLocal());
    setShowCreateFollowUpForm(true);
  };

  const handleCancelCreateFollowUpForm = () => {
    setShowCreateFollowUpForm(false);
    setCreateFollowUpErrorMessage("");
  };

  const handleCreateFollowUp = async () => {
    setCreateFollowUpMessage("");
    setCreateFollowUpErrorMessage("");

    if (!customer) {
      setCreateFollowUpErrorMessage(
        "No se puede crear el seguimiento porque no hay cliente cargado."
      );
      return;
    }

    if (!selectedInquiry) {
      setCreateFollowUpErrorMessage(
        "Selecciona un caso activo antes de crear el seguimiento."
      );
      return;
    }

    const cleanTitle = newFollowUpTitle.trim();

    if (!cleanTitle) {
      setCreateFollowUpErrorMessage(
        "El título del seguimiento es obligatorio."
      );
      return;
    }

    if (!newFollowUpDueAt) {
      setCreateFollowUpErrorMessage(
        "La fecha y hora del seguimiento son obligatorias."
      );
      return;
    }

    const dueDate = new Date(newFollowUpDueAt);

    if (Number.isNaN(dueDate.getTime())) {
      setCreateFollowUpErrorMessage("La fecha indicada no es válida.");
      return;
    }

    const dueAt = dueDate.toISOString();

    setIsCreatingFollowUp(true);

    const { data, error } = await supabase
      .from("follow_ups")
      .insert({
        company_id: customer.company_id,
        customer_id: customer.id,
        inquiry_id: selectedInquiry.id,
        title: cleanTitle,
        due_at: dueAt,
        status: "pending",
        urgency: resolveFollowUpUrgency(dueAt, "pending", null),
      })
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

    setIsCreatingFollowUp(false);

    if (error || !data) {
      setCreateFollowUpErrorMessage(
        `No se pudo crear el seguimiento: ${
          error?.message || "sin detalle del error"
        }`
      );
      return;
    }

    let auditWarningMessage = "";

    const { error: auditLogError } = await supabase.rpc("create_audit_log", {
      target_company_id: customer.company_id,
      audit_action: "create_follow_up",
      audit_entity_type: "follow_up",
      audit_entity_id: data.id,
      audit_metadata: {
        inquiry_id: selectedInquiry.id,
        customer_id: customer.id,
        status: "pending",
        due_at: dueAt,
        title_length: cleanTitle.length,
        source: "customer_detail",
      },
    });

    if (auditLogError) {
      console.error(
        "Follow-up created, but could not create audit log:",
        auditLogError
      );

      auditWarningMessage =
        " Advertencia: no se pudo registrar la auditoría del seguimiento.";
    }

    setFollowUps((currentFollowUps) => [
      mapFollowUpRowToFollowUp(data),
      ...currentFollowUps,
    ]);

    setShowCreateFollowUpForm(false);
    setNewFollowUpTitle(`Revisar caso de ${customer.name}`);
    setNewFollowUpDueAt(getDefaultFollowUpDateTimeLocal());
    setCreateFollowUpMessage(
      `Seguimiento creado correctamente.${auditWarningMessage}`
    );
  };

  const handleUpdateFollowUpStatus = async (
    followUpId: string,
    status: "pending" | "completed" | "cancelled"
  ) => {
    applyFollowUpActionMessage();
    setFollowUpErrorMessage("");

    if (!customer) {
      setFollowUpErrorMessage(
        "No se puede actualizar el seguimiento porque no hay cliente cargado."
      );
      return;
    }

    const currentFollowUp = followUps.find(
      (followUp) => followUp.id === followUpId
    );

    if (!currentFollowUp) {
      setFollowUpErrorMessage(
        "No se puede actualizar el seguimiento porque no se encontró en pantalla."
      );
      return;
    }

    const previousStatus = currentFollowUp.status;

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
      setFollowUpErrorMessage(
        `No se pudo actualizar el seguimiento: ${
          error?.message || "sin detalle del error"
        }`
      );
      return;
    }

    const mappedUpdatedFollowUp = mapFollowUpRowToFollowUp(updatedFollowUp);
    let auditWarningMessage = "";

    if (previousStatus !== mappedUpdatedFollowUp.status) {
      const { error: auditLogError } = await supabase.rpc("create_audit_log", {
        target_company_id: customer.company_id,
        audit_action: getFollowUpStatusAuditAction(
          previousStatus,
          mappedUpdatedFollowUp.status
        ),
        audit_entity_type: "follow_up",
        audit_entity_id: followUpId,
        audit_metadata: {
          inquiry_id: updatedFollowUp.inquiry_id,
          customer_id: customer.id,
          previous_status: previousStatus,
          next_status: mappedUpdatedFollowUp.status,
          due_at: updatedFollowUp.due_at ?? null,
          source: "customer_detail",
        },
      });

      if (auditLogError) {
        console.error(
          "Follow-up status updated, but could not create audit log:",
          auditLogError
        );

        auditWarningMessage =
          " Advertencia: no se pudo registrar la auditoría del seguimiento.";
      }
    }

    if (mappedUpdatedFollowUp.status === "pending") {
      setFollowUpActionMessage({
        followUpId,
        message: `Seguimiento reabierto correctamente.${auditWarningMessage}`,
        updatedFollowUp: mappedUpdatedFollowUp,
      });
      return;
    }

    setFollowUpActionMessage({
      followUpId,
      message:
        mappedUpdatedFollowUp.status === "completed"
          ? `Seguimiento completado correctamente.${auditWarningMessage}`
          : `Seguimiento cancelado correctamente.${auditWarningMessage}`,
      updatedFollowUp: mappedUpdatedFollowUp,
    });
  };

  if (isLoading) {
    return (
      <div>
        <Button
          variant="secondary"
          onClick={() => setActiveView("customers")}
          className="mb-4"
        >
          <ChevronLeft size={16} />
          Volver a clientes
        </Button>

        <PageHeader
          title="Detalle de cliente"
          description="Cargando información, actividad y métricas del cliente."
        />

        <MetricCardsSkeleton />

        <div className="rounded-2xl border border-[#B8D1D8] bg-white p-6 text-sm font-medium text-[#456C75] shadow-md shadow-[#0F4C5C]/10">
          Cargando cliente...
        </div>
      </div>
    );
  }

  if (errorMessage || !customer) {
    return (
      <div>
        <Button
          variant="secondary"
          onClick={() => setActiveView("customers")}
          className="mb-4"
        >
          <ChevronLeft size={16} />
          Volver a clientes
        </Button>

        <div className="rounded-2xl border border-[#6D9BA7] bg-[#F2FAFB] px-4 py-3 text-sm text-[#083640] shadow-sm shadow-[#0F4C5C]/10">
          {errorMessage || "No se pudo cargar el cliente."}
        </div>
      </div>
    );
  }

  const pendingFollowUps = followUps.filter(
    (followUp) => followUp.status === "pending"
  );

  const historyFollowUps = followUps.filter(
    (followUp) =>
      followUp.status === "completed" || followUp.status === "cancelled"
  );

  const pendingClosureAppointments = appointments.filter((appointment) =>
    isAppointmentPendingClosure(appointment, currentTimeMs)
  );

  const pendingConfirmationAppointments = appointments.filter(
    (appointment) =>
      appointment.status === "proposed" &&
      !isAppointmentPendingClosure(appointment, currentTimeMs)
  );

  const confirmedAppointments = appointments.filter(
    (appointment) =>
      appointment.status === "confirmed" &&
      !isAppointmentPendingClosure(appointment, currentTimeMs)
  );

  const historyAppointments = appointments.filter(
    (appointment) =>
      appointment.status === "completed" || appointment.status === "cancelled"
  );

  const activeInquiryCount = activeInquiries.length;
  const pendingFollowUpCount = pendingFollowUps.length;
  const pendingAppointmentCount =
    pendingClosureAppointments.length +
    pendingConfirmationAppointments.length +
    confirmedAppointments.length;
  const latestSourceChannel = getLatestSourceChannel(inquiries);

  const renderAppointmentCard = (
    appointment: CustomerAppointment,
    isPendingClosure = false
  ) => {
    const appointmentCardStyles = getAppointmentCardStyles(
      appointment,
      isPendingClosure
    );

    return (
      <article
        key={appointment.id}
        className={`relative overflow-hidden rounded-2xl border bg-white p-4 pl-5 shadow-sm ${appointmentCardStyles.card}`}
      >
        <span
          aria-hidden="true"
          className={`absolute inset-y-0 left-0 w-1 ${appointmentCardStyles.rail}`}
        />

        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <span
              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${appointmentCardStyles.badge}`}
            >
              {isPendingClosure
                ? "Pendiente de cerrar"
                : getAppointmentStatusLabel(appointment.status)}
            </span>

            <h3 className="mt-3 text-sm font-bold text-[#073540]">
              {appointment.title}
            </h3>

            <p className="mt-1 text-xs text-[#6B858C]">
              {appointment.scheduledAt}
            </p>
          </div>

          {appointment.inquiryId ? (
            <button
              type="button"
              onClick={() => openInquiry(appointment.inquiryId)}
              className={`${actionStyles.openCase} shrink-0`}
            >
              Abrir caso
              <ChevronRight size={14} />
            </button>
          ) : null}
        </div>

        {isPendingClosure ? (
          <div className="mt-3 rounded-xl border border-[#8FB8C2] bg-[#F2FAFB] px-3 py-2 text-xs leading-5 text-[#0B3F4C]">
            Esta cita interna ya ha pasado y sigue activa. Revísala desde la
            agenda interna o desde el caso asociado.
          </div>
        ) : null}

        {appointment.notes ? (
          <p className="mt-3 rounded-xl border border-[#D2E4E8] bg-[#F7FBFC]/80 px-3 py-2 text-xs leading-5 text-[#456C75]">
            {appointment.notes}
          </p>
        ) : null}
      </article>
    );
  };

  return (
    <div>
      <Button
        variant="secondary"
        onClick={() => setActiveView("customers")}
        className="mb-4"
      >
        <ChevronLeft size={16} />
        Volver a clientes
      </Button>

      <PageHeader
        title={customer.name}
        description={`${customer.email || "Sin email"} · ${
          customer.phone || "Sin teléfono"
        }`}
      />

      <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          title="Casos totales"
          value={inquiries.length}
          caption="Historial completo del cliente"
          icon={ClipboardList}
          tone="case"
        />

        <MetricCard
          title="Casos activos"
          value={activeInquiryCount}
          caption="Requieren seguimiento o respuesta"
          icon={MessageSquareText}
          tone="case"
        />

        <MetricCard
          title="Seguimientos"
          value={pendingFollowUpCount}
          caption="Pendientes de atender"
          icon={CalendarClock}
          tone="followUp"
        />

        <MetricCard
          title="Citas internas"
          value={pendingAppointmentCount}
          caption="Activas o pendientes"
          icon={NotebookText}
          tone="appointment"
        />

        <MetricCard
          title="Último canal"
          value={latestSourceChannel}
          caption={`${formatCustomerStatus(customer.status)} · ${formatLanguage(
            customer.language
          )}`}
          icon={UserRound}
          tone="customer"
        />
      </div>

      <SectionCard
        title="Ficha del cliente"
        description="Información principal, estado interno y último canal de contacto."
        className="mb-5"
        tone="customer"
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <CustomerInfoItem
            label="Última interacción"
            value={formatDateTime(
              customer.last_interaction_at,
              "Sin interacciones"
            )}
          />

          <CustomerInfoItem
            label="Estado"
            value={formatCustomerStatus(customer.status)}
          />

          <CustomerInfoItem
            label="Idioma"
            value={formatLanguage(customer.language)}
          />

          <CustomerInfoItem label="Canal" value={latestSourceChannel} />
        </div>
      </SectionCard>

      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <aside className="space-y-5">
          <SectionCard
            title="Datos del cliente"
            description="Edita la información de contacto y estado interno."
            tone="customer"
          >
            <div className="space-y-4 text-sm">
              <label className="block font-medium text-[#315F69]">
                Nombre
                <input
                  value={editName}
                  onChange={(event) => {
                    setEditName(event.target.value);
                    setCustomerMessage("");
                    setCustomerErrorMessage("");
                  }}
                  className="mt-1 w-full rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-sm text-[#153F48] outline-none transition focus:border-[#0F4C5C] focus:bg-white"
                />
              </label>

              <label className="block font-medium text-[#315F69]">
                Email
                <input
                  type="email"
                  value={editEmail}
                  onChange={(event) => {
                    setEditEmail(event.target.value);
                    setCustomerMessage("");
                    setCustomerErrorMessage("");
                  }}
                  className="mt-1 w-full rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-sm text-[#153F48] outline-none transition focus:border-[#0F4C5C] focus:bg-white"
                  placeholder="Sin email"
                />
              </label>

              <label className="block font-medium text-[#315F69]">
                Teléfono
                <input
                  type="tel"
                  value={editPhone}
                  onChange={(event) => {
                    setEditPhone(event.target.value);
                    setCustomerMessage("");
                    setCustomerErrorMessage("");
                  }}
                  className="mt-1 w-full rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-sm text-[#153F48] outline-none transition focus:border-[#0F4C5C] focus:bg-white"
                  placeholder="Sin teléfono"
                />
              </label>

              <label className="block font-medium text-[#315F69]">
                Idioma
                <select
                  value={editLanguage}
                  onChange={(event) => {
                    setEditLanguage(event.target.value);
                    setCustomerMessage("");
                    setCustomerErrorMessage("");
                  }}
                  className="mt-1 w-full rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-sm text-[#153F48] outline-none transition focus:border-[#0F4C5C] focus:bg-white"
                >
                  <option value="es">Español</option>
                  <option value="en">Inglés</option>
                </select>
              </label>

              <label className="block font-medium text-[#315F69]">
                Estado
                <select
                  value={editStatus}
                  onChange={(event) => {
                    setEditStatus(normalizeCustomerStatus(event.target.value));
                    setCustomerMessage("");
                    setCustomerErrorMessage("");
                  }}
                  className="mt-1 w-full rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-sm text-[#153F48] outline-none transition focus:border-[#0F4C5C] focus:bg-white"
                >
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                  <option value="archived">Archivado</option>
                </select>
              </label>
            </div>

            {customerErrorMessage ? (
              <div className="mt-4 rounded-2xl border border-[#6D9BA7] bg-[#F2FAFB] px-4 py-3 text-sm text-[#083640]">
                {customerErrorMessage}
              </div>
            ) : null}

            <AutoDismissAlert
              className="mt-4 font-medium"
              message={customerMessage}
              onDismiss={() => setCustomerMessage("")}
            />

            <Button
              className="mt-4 w-full"
              onClick={handleSaveCustomer}
              disabled={isSavingCustomer}
            >
              {isSavingCustomer ? "Guardando cambios..." : "Guardar cambios"}
            </Button>
          </SectionCard>

          <SectionCard
            title="Nota rápida"
            description="Guarda información interna útil para futuras gestiones."
            tone="note"
          >
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="min-h-[120px] w-full rounded-2xl border border-[#D2E4E8] bg-[#F7FBFC] p-3 text-sm text-[#153F48] outline-none transition focus:border-[#0F4C5C] focus:bg-white"
              placeholder="Añadir nota sobre este cliente..."
            />

            {noteErrorMessage ? (
              <div className="mt-3 rounded-2xl border border-[#6D9BA7] bg-[#F2FAFB] px-4 py-3 text-sm text-[#083640]">
                {noteErrorMessage}
              </div>
            ) : null}

            <AutoDismissAlert
              className="mt-3 font-medium"
              message={noteMessage}
              onDismiss={() => setNoteMessage("")}
            />

            <Button
              variant="secondary"
              className="mt-3 w-full"
              onClick={handleSaveNote}
              disabled={isSavingNote}
            >
              {isSavingNote ? "Guardando nota..." : "Guardar nota"}
            </Button>
          </SectionCard>
        </aside>

        <main className="space-y-6">
          <SectionCard
            title="Crear seguimiento"
            description="Crea una tarea pendiente asociada a un caso activo de este cliente."
            tone="followUp"
            action={
              !showCreateFollowUpForm && activeInquiries.length > 0 ? (
                <Button onClick={handleOpenCreateFollowUpForm}>
                  <CalendarClock size={16} />
                  Nuevo seguimiento
                </Button>
              ) : null
            }
          >
            {createFollowUpErrorMessage ? (
              <div className="mb-4 rounded-2xl border border-[#6D9BA7] bg-[#F2FAFB] px-4 py-3 text-sm text-[#083640]">
                {createFollowUpErrorMessage}
              </div>
            ) : null}

            <AutoDismissAlert
              className="mb-4 font-medium"
              message={createFollowUpMessage}
              onDismiss={() => setCreateFollowUpMessage("")}
            />

            {activeInquiries.length === 0 ? (
              <div className="rounded-2xl border border-[#D2E4E8] bg-[#F7FBFC] p-4 text-sm leading-6 text-[#456C75]">
                Este cliente no tiene casos activos. Para crear un seguimiento
                desde el cliente, primero debe existir un caso nuevo, en
                seguimiento o esperando al cliente asociado a él.
              </div>
            ) : null}

            {showCreateFollowUpForm && activeInquiries.length > 0 ? (
              <div className="space-y-4">
                <label className="block text-sm font-medium text-[#315F69]">
                  Caso asociado
                  <select
                    value={selectedInquiry?.id ?? ""}
                    onChange={(event) => {
                      const nextInquiryId = event.target.value;
                      const nextInquiry = activeInquiries.find(
                        (inquiry) => inquiry.id === nextInquiryId
                      );

                      setSelectedInquiryId(nextInquiryId);

                      if (nextInquiry) {
                        setNewFollowUpTitle(
                          `Revisar caso de ${nextInquiry.customerName}`
                        );
                      }
                    }}
                    className="mt-1 w-full rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-sm text-[#153F48] outline-none transition focus:border-[#0F4C5C] focus:bg-white"
                  >
                    {activeInquiries.map((inquiry) => (
                      <option key={inquiry.id} value={inquiry.id}>
                        {inquiry.subject || "Sin asunto"} ·{" "}
                        {formatInquiryStatus(inquiry.status)}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block text-sm font-medium text-[#315F69]">
                    Título
                    <input
                      value={newFollowUpTitle}
                      onChange={(event) =>
                        setNewFollowUpTitle(event.target.value)
                      }
                      className="mt-1 w-full rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-sm text-[#153F48] outline-none transition focus:border-[#0F4C5C] focus:bg-white"
                    />
                  </label>

                  <label className="block text-sm font-medium text-[#315F69]">
                    Fecha y hora
                    <input
                      type="datetime-local"
                      value={newFollowUpDueAt}
                      onChange={(event) =>
                        setNewFollowUpDueAt(event.target.value)
                      }
                      className="mt-1 w-full rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-sm text-[#153F48] outline-none transition focus:border-[#0F4C5C] focus:bg-white"
                    />
                  </label>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    className="w-full"
                    onClick={handleCreateFollowUp}
                    disabled={isCreatingFollowUp}
                  >
                    <CalendarClock size={16} />
                    {isCreatingFollowUp
                      ? "Creando seguimiento..."
                      : "Guardar seguimiento"}
                  </Button>

                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={handleCancelCreateFollowUpForm}
                    disabled={isCreatingFollowUp}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : null}
          </SectionCard>

          <SectionCard
            title="Operativa pendiente"
            description="Seguimientos y citas internas que todavía pueden requerir acción."
            tone="brand"
          >
            {followUpErrorMessage ? (
              <div className="mb-4 rounded-2xl border border-[#6D9BA7] bg-[#F2FAFB] px-4 py-3 text-sm text-[#083640]">
                {followUpErrorMessage}
              </div>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-2">
              <BoardColumn
                title="Seguimientos"
                description="Tareas pendientes e historial de seguimiento."
                count={followUps.length}
                tone={pendingFollowUps.length > 0 ? "followUp" : "neutral"}
              >
                {followUps.length === 0 ? (
                  <EmptyActivityCard>
                    Todavía no hay seguimientos asociados a este cliente.
                  </EmptyActivityCard>
                ) : (
                  <div className="space-y-4">
                    {pendingFollowUps.length > 0 ? (
                      <section>
                        <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-[#6B858C]">
                          Pendientes
                        </h3>

                        <div className="space-y-3">
                          {pendingFollowUps.map((followUp) => (
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
                              isUpdating={
                                updatingFollowUpId === followUp.id ||
                                followUpActionMessage?.followUpId ===
                                  followUp.id
                              }
                              successMessage={
                                followUpActionMessage?.followUpId ===
                                followUp.id
                                  ? followUpActionMessage.message
                                  : ""
                              }
                              onDismissSuccessMessage={() =>
                                dismissFollowUpActionMessage(followUp.id)
                              }
                            />
                          ))}
                        </div>
                      </section>
                    ) : null}

                    {historyFollowUps.length > 0 ? (
                      <section>
                        <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-[#6B858C]">
                          Historial
                        </h3>

                        <div className="space-y-3">
                          {historyFollowUps.map((followUp) => (
                            <FollowUpCard
                              key={followUp.id}
                              followUp={followUp}
                              onOpen={openInquiry}
                              onReopen={(id) =>
                                handleUpdateFollowUpStatus(id, "pending")
                              }
                              isUpdating={
                                updatingFollowUpId === followUp.id ||
                                followUpActionMessage?.followUpId ===
                                  followUp.id
                              }
                              successMessage={
                                followUpActionMessage?.followUpId ===
                                followUp.id
                                  ? followUpActionMessage.message
                                  : ""
                              }
                              onDismissSuccessMessage={() =>
                                dismissFollowUpActionMessage(followUp.id)
                              }
                            />
                          ))}
                        </div>
                      </section>
                    ) : null}
                  </div>
                )}
              </BoardColumn>

              <BoardColumn
                title="Citas internas"
                description="Validaciones, cierres e historial de agenda."
                count={appointments.length}
                tone={pendingAppointmentCount > 0 ? "appointment" : "neutral"}
              >
                {appointments.length === 0 ? (
                  <EmptyActivityCard>
                    Todavía no hay citas internas asociadas a este cliente.
                  </EmptyActivityCard>
                ) : (
                  <div className="space-y-4">
                    {pendingClosureAppointments.length > 0 ? (
                      <section>
                        <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-[#6B858C]">
                          Pendientes de cerrar
                        </h3>

                        <div className="space-y-3">
                          {pendingClosureAppointments.map((appointment) =>
                            renderAppointmentCard(appointment, true)
                          )}
                        </div>
                      </section>
                    ) : null}

                    {pendingConfirmationAppointments.length > 0 ? (
                      <section>
                        <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-[#6B858C]">
                          Pendientes de confirmar
                        </h3>

                        <div className="space-y-3">
                          {pendingConfirmationAppointments.map((appointment) =>
                            renderAppointmentCard(appointment)
                          )}
                        </div>
                      </section>
                    ) : null}

                    {confirmedAppointments.length > 0 ? (
                      <section>
                        <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-[#6B858C]">
                          Confirmadas internamente
                        </h3>

                        <div className="space-y-3">
                          {confirmedAppointments.map((appointment) =>
                            renderAppointmentCard(appointment)
                          )}
                        </div>
                      </section>
                    ) : null}

                    {historyAppointments.length > 0 ? (
                      <section>
                        <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-[#6B858C]">
                          Historial
                        </h3>

                        <div className="space-y-3">
                          {historyAppointments.map((appointment) =>
                            renderAppointmentCard(appointment)
                          )}
                        </div>
                      </section>
                    ) : null}
                  </div>
                )}
              </BoardColumn>
            </div>
          </SectionCard>

          <SectionCard
            title="Historial y conocimiento"
            description="Notas internas y casos asociados al cliente."
            tone="archived"
          >
            <div className="grid gap-4 xl:grid-cols-2">
              <BoardColumn
                title="Notas internas"
                description="Información privada del equipo sobre este cliente."
                count={notes.length}
                tone={notes.length > 0 ? "note" : "neutral"}
              >
                {notes.length === 0 ? (
                  <EmptyActivityCard>
                    Todavía no hay notas internas para este cliente.
                  </EmptyActivityCard>
                ) : (
                  <div className="space-y-3">
                    {notes.map((internalNote) => (
                      <NoteCard key={internalNote.id} note={internalNote} />
                    ))}
                  </div>
                )}
              </BoardColumn>

              <BoardColumn
                title="Casos del cliente"
                description="Historial de casos asociados y estado actual."
                count={inquiries.length}
                tone={inquiries.length > 0 ? "case" : "neutral"}
              >
                {inquiries.length === 0 ? (
                  <EmptyActivityCard>
                    Todavía no hay casos asociados a este cliente.
                  </EmptyActivityCard>
                ) : (
                  <div className="space-y-3">
                    {inquiries.map((inquiry) => (
                      <InquiryCard
                        key={inquiry.id}
                        inquiry={inquiry}
                        onOpen={openInquiry}
                      />
                    ))}
                  </div>
                )}
              </BoardColumn>
            </div>
          </SectionCard>
        </main>
      </div>
    </div>
  );
}
