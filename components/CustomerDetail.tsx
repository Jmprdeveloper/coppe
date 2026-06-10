"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";

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
import type { Appointment, CustomerStatus, FollowUp, Inquiry } from "../types";

import { Button } from "./Button";
import { FollowUpCard } from "./FollowUpCard";
import { InquiryCard } from "./InquiryCard";
import { PageHeader } from "./PageHeader";

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
  if (status === "new") {
    return "Nuevo";
  }

  if (status === "active") {
    return "Activo";
  }

  if (status === "inactive") {
    return "Inactivo";
  }

  if (status === "archived") {
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
  const [followUpMessage, setFollowUpMessage] = useState("");
  const [followUpErrorMessage, setFollowUpErrorMessage] = useState("");

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
      setFollowUpMessage("");
      setFollowUpErrorMessage("");
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
    setCustomerMessage("Datos del cliente guardados correctamente.");
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

    setNotes((currentNotes) => [data, ...currentNotes]);
    setNote("");
    setNoteMessage("Nota guardada correctamente.");
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

    setFollowUps((currentFollowUps) => [
      mapFollowUpRowToFollowUp(data),
      ...currentFollowUps,
    ]);

    setShowCreateFollowUpForm(false);
    setNewFollowUpTitle(`Revisar caso de ${customer.name}`);
    setNewFollowUpDueAt(getDefaultFollowUpDateTimeLocal());
    setCreateFollowUpMessage("Seguimiento creado correctamente.");
  };

  const handleUpdateFollowUpStatus = async (
    followUpId: string,
    status: "pending" | "completed" | "cancelled"
  ) => {
    setFollowUpMessage("");
    setFollowUpErrorMessage("");
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

    setFollowUps((currentFollowUps) =>
      currentFollowUps.map((followUp) =>
        followUp.id === followUpId ? mappedUpdatedFollowUp : followUp
      )
    );

    if (status === "pending") {
      setFollowUpMessage("Seguimiento reabierto correctamente.");
      return;
    }

    setFollowUpMessage(
      status === "completed"
        ? "Seguimiento completado correctamente."
        : "Seguimiento cancelado correctamente."
    );
  };

  if (isLoading) {
    return (
      <div>
        <button
          onClick={() => setActiveView("customers")}
          className="mb-3 text-sm font-semibold text-[#0F4C5C] hover:underline"
        >
          ← Volver a clientes
        </button>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          Cargando cliente...
        </div>
      </div>
    );
  }

  if (errorMessage || !customer) {
    return (
      <div>
        <button
          onClick={() => setActiveView("customers")}
          className="mb-3 text-sm font-semibold text-[#0F4C5C] hover:underline"
        >
          ← Volver a clientes
        </button>

        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
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

  const currentTimeMs = Date.now();

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
    return (
      <article
        key={appointment.id}
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
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
              className="text-left text-xs font-semibold text-[#0F4C5C] hover:underline sm:text-right"
            >
              Abrir caso
            </button>
          ) : null}
        </div>

        {isPendingClosure ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
            Esta cita interna ya ha pasado y sigue activa. Revísala desde la
            agenda interna o desde el caso asociado.
          </div>
        ) : null}

        {appointment.notes ? (
          <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-slate-600">
            {appointment.notes}
          </p>
        ) : null}
      </article>
    );
  };

  return (
    <div>
      <button
        onClick={() => setActiveView("customers")}
        className="mb-3 text-sm font-semibold text-[#0F4C5C] hover:underline"
      >
        ← Volver a clientes
      </button>

      <PageHeader
        title={customer.name}
        description={`${customer.email || "Sin email"} · ${
          customer.phone || "Sin teléfono"
        }`}
      />

      <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Casos totales
          </div>

          <div className="mt-2 text-2xl font-bold text-slate-950">
            {inquiries.length}
          </div>

          <div className="mt-1 text-xs text-slate-500">
            Historial completo del cliente
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Casos activos
          </div>

          <div className="mt-2 text-2xl font-bold text-slate-950">
            {activeInquiryCount}
          </div>

          <div className="mt-1 text-xs text-slate-500">
            Requieren seguimiento o respuesta
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Seguimientos
          </div>

          <div className="mt-2 text-2xl font-bold text-slate-950">
            {pendingFollowUpCount}
          </div>

          <div className="mt-1 text-xs text-slate-500">
            Pendientes de atender
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Citas internas
          </div>

          <div className="mt-2 text-2xl font-bold text-slate-950">
            {pendingAppointmentCount}
          </div>

          <div className="mt-1 text-xs text-slate-500">
            Activas o pendientes
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Último canal
          </div>

          <div className="mt-2 truncate text-sm font-bold text-slate-950">
            {latestSourceChannel}
          </div>

          <div className="mt-2 inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
            {formatCustomerStatus(customer.status)}
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <aside className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-slate-950">Datos del cliente</h3>

            <div className="mt-4 space-y-4 text-sm">
              <label className="block font-medium text-slate-700">
                Nombre
                <input
                  value={editName}
                  onChange={(event) => {
                    setEditName(event.target.value);
                    setCustomerMessage("");
                    setCustomerErrorMessage("");
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                />
              </label>

              <label className="block font-medium text-slate-700">
                Email
                <input
                  type="email"
                  value={editEmail}
                  onChange={(event) => {
                    setEditEmail(event.target.value);
                    setCustomerMessage("");
                    setCustomerErrorMessage("");
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                  placeholder="Sin email"
                />
              </label>

              <label className="block font-medium text-slate-700">
                Teléfono
                <input
                  type="tel"
                  value={editPhone}
                  onChange={(event) => {
                    setEditPhone(event.target.value);
                    setCustomerMessage("");
                    setCustomerErrorMessage("");
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                  placeholder="Sin teléfono"
                />
              </label>

              <label className="block font-medium text-slate-700">
                Idioma
                <select
                  value={editLanguage}
                  onChange={(event) => {
                    setEditLanguage(event.target.value);
                    setCustomerMessage("");
                    setCustomerErrorMessage("");
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                >
                  <option value="es">Español</option>
                  <option value="en">Inglés</option>
                </select>
              </label>

              <label className="block font-medium text-slate-700">
                Estado
                <select
                  value={editStatus}
                  onChange={(event) => {
                    setEditStatus(normalizeCustomerStatus(event.target.value));
                    setCustomerMessage("");
                    setCustomerErrorMessage("");
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                >
                  <option value="new">Nuevo</option>
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                  <option value="archived">Archivado</option>
                </select>
              </label>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-medium text-slate-500">
                  Última interacción
                </div>
                <div className="mt-1 font-medium text-slate-800">
                  {formatDateTime(
                    customer.last_interaction_at,
                    "Sin interacciones"
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-medium text-slate-500">
                  Estado actual
                </div>
                <div className="mt-1 font-medium text-slate-800">
                  {formatCustomerStatus(customer.status)} ·{" "}
                  {formatLanguage(customer.language)}
                </div>
              </div>
            </div>

            {customerErrorMessage ? (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {customerErrorMessage}
              </div>
            ) : null}

            {customerMessage ? (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {customerMessage}
              </div>
            ) : null}

            <Button
              className="mt-4 w-full"
              onClick={handleSaveCustomer}
              disabled={isSavingCustomer}
            >
              {isSavingCustomer ? "Guardando cambios..." : "Guardar cambios"}
            </Button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-slate-950">Nota rápida</h3>

            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="mt-3 min-h-[110px] w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-[#0F4C5C]"
              placeholder="Añadir nota sobre este cliente..."
            />

            {noteErrorMessage ? (
              <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {noteErrorMessage}
              </div>
            ) : null}

            {noteMessage ? (
              <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {noteMessage}
              </div>
            ) : null}

            <Button
              variant="secondary"
              className="mt-3 w-full"
              onClick={handleSaveNote}
              disabled={isSavingNote}
            >
              {isSavingNote ? "Guardando nota..." : "Guardar nota"}
            </Button>
          </div>
        </aside>

        <main className="space-y-5">
          <section>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">
                    Crear seguimiento
                  </h2>

                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Crea una tarea pendiente asociada a un caso activo de este cliente.
                  </p>
                </div>

                {!showCreateFollowUpForm && activeInquiries.length > 0 ? (
                  <Button onClick={handleOpenCreateFollowUpForm}>
                    <CalendarClock size={16} />
                    Nuevo seguimiento
                  </Button>
                ) : null}
              </div>

              {createFollowUpErrorMessage ? (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {createFollowUpErrorMessage}
                </div>
              ) : null}

              {createFollowUpMessage ? (
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {createFollowUpMessage}
                </div>
              ) : null}

              {activeInquiries.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                  Este cliente no tiene casos activos. Para crear un
                  seguimiento desde el cliente, primero debe existir un caso
                  nuevo, en seguimiento o esperando al cliente asociado a él.
                </div>
              ) : null}

              {showCreateFollowUpForm && activeInquiries.length > 0 ? (
                <div className="mt-5 space-y-4">
                  <label className="block text-sm font-medium text-slate-700">
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
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
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
                    <label className="block text-sm font-medium text-slate-700">
                      Título
                      <input
                        value={newFollowUpTitle}
                        onChange={(event) =>
                          setNewFollowUpTitle(event.target.value)
                        }
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                      />
                    </label>

                    <label className="block text-sm font-medium text-slate-700">
                      Fecha y hora
                      <input
                        type="datetime-local"
                        value={newFollowUpDueAt}
                        onChange={(event) =>
                          setNewFollowUpDueAt(event.target.value)
                        }
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
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
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-slate-950">
              Seguimientos del cliente
            </h2>

            {followUpErrorMessage ? (
              <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {followUpErrorMessage}
              </div>
            ) : null}

            {followUpMessage ? (
              <div className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {followUpMessage}
              </div>
            ) : null}

            {followUps.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
                Todavía no hay seguimientos asociados a este cliente.
              </div>
            ) : (
              <div className="space-y-5">
                {pendingFollowUps.length > 0 ? (
                  <section>
                    <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
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
                          isUpdating={updatingFollowUpId === followUp.id}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}

                {historyFollowUps.length > 0 ? (
                  <section>
                    <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
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
                          isUpdating={updatingFollowUpId === followUp.id}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-slate-950">
              Citas internas del cliente
            </h2>

            {appointments.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
                Todavía no hay citas internas asociadas a este cliente.
              </div>
            ) : (
              <div className="space-y-5">
                {pendingClosureAppointments.length > 0 ? (
                  <section>
                    <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
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
                    <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
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
                    <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
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
                    <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
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
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-slate-950">
              Notas internas
            </h2>

            {notes.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
                Todavía no hay notas internas para este cliente.
              </div>
            ) : (
              <div className="space-y-3">
                {notes.map((internalNote) => (
                  <article
                    key={internalNote.id}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {internalNote.body}
                    </p>

                    <div className="mt-3 text-xs text-slate-500">
                      {formatDateTime(internalNote.created_at)}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-slate-950">
              Casos del cliente
            </h2>

            {inquiries.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
                Todavía no hay casos asociados a este cliente.
              </div>
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
          </section>
        </main>
      </div>
    </div>
  );
}