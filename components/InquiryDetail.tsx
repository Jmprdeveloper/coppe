"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, XCircle } from "lucide-react";

import { createClient } from "../lib/supabase/client";
import type {
  Inquiry,
  InquiryCategory,
  InquiryStatus,
  Priority,
} from "../types";

import { AIBlock } from "./AIBlock";
import { Button } from "./Button";
import { CategoryBadge } from "./CategoryBadge";
import { PriorityBadge } from "./PriorityBadge";
import { ResponseEditor } from "./ResponseEditor";
import { StatusBadge } from "./StatusBadge";

type InquiryDetailProps = {
  inquiryId: string;
  setActiveView: (view: string) => void;
};

type InquiryRow = {
  id: string;
  company_id: string;
  customer_id: string | null;
  customer_name: string;
  source_channel: string;
  subject: string | null;
  original_message: string;
  ai_summary: string | null;
  ai_intent: string | null;
  ai_category: string | null;
  ai_priority: string | null;
  ai_language: string | null;
  sentiment: string | null;
  missing_information: string[] | null;
  recommended_action: string | null;
  suggested_response: string | null;
  status: string;
  created_at: string;
};

type CustomerRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

type InternalNoteRow = {
  id: string;
  body: string;
  created_at: string;
};

function normalizeInquiryStatus(status: string): InquiryStatus {
  if (
    status === "new" ||
    status === "pending" ||
    status === "replied" ||
    status === "closed" ||
    status === "discarded"
  ) {
    return status;
  }

  return "new";
}

function normalizePriority(priority: string | null): Priority {
  if (priority === "low" || priority === "medium" || priority === "high") {
    return priority;
  }

  return "medium";
}

function normalizeCategory(category: string | null): InquiryCategory {
  if (
    category === "sales_inquiry" ||
    category === "appointment_request" ||
    category === "quote_request" ||
    category === "booking" ||
    category === "incident" ||
    category === "general_info" ||
    category === "follow_up" ||
    category === "cancellation" ||
    category === "complaint" ||
    category === "other"
  ) {
    return category;
  }

  return "other";
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Fecha no disponible";
  }

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function mapInquiryRowToInquiry(row: InquiryRow): Inquiry {
  return {
    id: row.id,
    customerId: row.customer_id ?? "",
    customerName: row.customer_name,
    sourceChannel: row.source_channel,
    subject: row.subject ?? "Sin asunto",
    originalMessage: row.original_message,
    aiSummary: row.ai_summary ?? "Sin resumen disponible.",
    aiIntent: row.ai_intent ?? "No identificado",
    aiCategory: normalizeCategory(row.ai_category),
    aiPriority: normalizePriority(row.ai_priority),
    aiLanguage: row.ai_language ?? "No indicado",
    sentiment: row.sentiment ?? "No indicado",
    missingInformation: row.missing_information ?? [],
    recommendedAction:
      row.recommended_action ?? "No hay acción recomendada disponible.",
    suggestedResponse:
      row.suggested_response ?? "No hay respuesta sugerida disponible.",
    status: normalizeInquiryStatus(row.status),
    createdAt: formatDateTime(row.created_at),
  };
}

export function InquiryDetail({
  inquiryId,
  setActiveView,
}: InquiryDetailProps) {
  const supabase = useMemo(() => createClient(), []);

  const [inquiry, setInquiry] = useState<Inquiry | null>(null);
  const [rawInquiry, setRawInquiry] = useState<InquiryRow | null>(null);
  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [notes, setNotes] = useState<InternalNoteRow[]>([]);
  const [note, setNote] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isCreatingFollowUp, setIsCreatingFollowUp] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [statusErrorMessage, setStatusErrorMessage] = useState("");
  const [noteMessage, setNoteMessage] = useState("");
  const [noteErrorMessage, setNoteErrorMessage] = useState("");
  const [followUpMessage, setFollowUpMessage] = useState("");
  const [followUpErrorMessage, setFollowUpErrorMessage] = useState("");

  useEffect(() => {
    async function loadInquiry() {
      setIsLoading(true);
      setErrorMessage("");
      setStatusMessage("");
      setStatusErrorMessage("");
      setNoteMessage("");
      setNoteErrorMessage("");
      setFollowUpMessage("");
      setFollowUpErrorMessage("");
      setInquiry(null);
      setRawInquiry(null);
      setCustomer(null);
      setNotes([]);
      setNote("");

      const { data: inquiryData, error: inquiryError } = await supabase
        .from("inquiries")
        .select(
          [
            "id",
            "company_id",
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
        .eq("id", inquiryId)
        .maybeSingle<InquiryRow>();

      if (inquiryError) {
        setErrorMessage(
          `No se pudo cargar la consulta: ${
            inquiryError.message || "sin detalle del error"
          }`
        );
        setIsLoading(false);
        return;
      }

      if (!inquiryData) {
        setErrorMessage(
          "No se encontró esta consulta o no pertenece a tu empresa."
        );
        setIsLoading(false);
        return;
      }

      setInquiry(mapInquiryRowToInquiry(inquiryData));
      setRawInquiry(inquiryData);

      if (inquiryData.customer_id) {
        const { data: customerData, error: customerError } = await supabase
          .from("customers")
          .select("id, name, email, phone")
          .eq("id", inquiryData.customer_id)
          .maybeSingle<CustomerRow>();

        if (!customerError && customerData) {
          setCustomer(customerData);
        }
      }

      const { data: notesData, error: notesError } = await supabase
        .from("internal_notes")
        .select("id, body, created_at")
        .eq("inquiry_id", inquiryData.id)
        .order("created_at", { ascending: false });

      if (notesError) {
        setErrorMessage(
          `Se cargó la consulta, pero no se pudieron cargar sus notas: ${
            notesError.message || "sin detalle del error"
          }`
        );
        setIsLoading(false);
        return;
      }

      setNotes((notesData ?? []) as InternalNoteRow[]);
      setIsLoading(false);
    }

    loadInquiry();
  }, [inquiryId, supabase]);

  const handleUpdateStatus = async (newStatus: InquiryStatus) => {
    if (!inquiry) {
      return;
    }

    setStatusMessage("");
    setStatusErrorMessage("");

    if (
      newStatus === "discarded" &&
      !window.confirm(
        "¿Seguro que quieres descartar esta consulta? No se eliminará del historial, pero dejará de tratarse como pendiente."
      )
    ) {
      return;
    }

    if (
      newStatus === "pending" &&
      (inquiry.status === "replied" ||
        inquiry.status === "closed" ||
        inquiry.status === "discarded") &&
      !window.confirm(
        "¿Seguro que quieres reabrir esta consulta? Volverá a tratarse como pendiente."
      )
    ) {
      return;
    }

    setIsUpdatingStatus(true);

    const { error } = await supabase
      .from("inquiries")
      .update({
        status: newStatus,
      })
      .eq("id", inquiry.id);

    setIsUpdatingStatus(false);

    if (error) {
      setStatusErrorMessage(
        `No se pudo actualizar el estado: ${
          error.message || "sin detalle del error"
        }`
      );
      return;
    }

    setInquiry({
      ...inquiry,
      status: newStatus,
    });

    if (newStatus === "pending") {
      setStatusMessage("Consulta reabierta correctamente.");
      return;
    }

    if (newStatus === "replied") {
      setStatusMessage("Consulta marcada como respondida.");
      return;
    }

    if (newStatus === "closed") {
      setStatusMessage("Consulta cerrada correctamente.");
      return;
    }

    if (newStatus === "discarded") {
      setStatusMessage("Consulta descartada correctamente.");
      return;
    }

    setStatusMessage("Estado actualizado correctamente.");
  };

  const handleSaveNote = async () => {
    setNoteMessage("");
    setNoteErrorMessage("");

    if (!rawInquiry) {
      setNoteErrorMessage(
        "No se puede guardar la nota porque no hay consulta cargada."
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
        company_id: rawInquiry.company_id,
        customer_id: rawInquiry.customer_id,
        inquiry_id: rawInquiry.id,
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
    setNoteMessage("Nota interna guardada correctamente.");
  };

  const handleCreateFollowUp = async () => {
    setFollowUpMessage("");
    setFollowUpErrorMessage("");

    if (!rawInquiry || !inquiry) {
      setFollowUpErrorMessage(
        "No se puede crear el seguimiento porque no hay consulta cargada."
      );
      return;
    }

    if (inquiry.status !== "new" && inquiry.status !== "pending") {
      setFollowUpErrorMessage(
        "No se puede crear un seguimiento sobre una consulta finalizada. Reabre la consulta primero."
      );
      return;
    }

    const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const title = `Revisar consulta de ${inquiry.customerName}`;

    setIsCreatingFollowUp(true);

    const { error } = await supabase.from("follow_ups").insert({
      company_id: rawInquiry.company_id,
      customer_id: rawInquiry.customer_id,
      inquiry_id: rawInquiry.id,
      title,
      due_at: dueAt,
      status: "pending",
      urgency: "upcoming",
    });

    setIsCreatingFollowUp(false);

    if (error) {
      setFollowUpErrorMessage(
        `No se pudo crear el seguimiento: ${
          error.message || "sin detalle del error"
        }`
      );
      return;
    }

    setFollowUpMessage(
      "Seguimiento creado correctamente para dentro de 24 horas."
    );
  };

  if (isLoading) {
    return (
      <div>
        <button
          onClick={() => setActiveView("inquiries")}
          className="mb-3 text-sm font-semibold text-[#0F4C5C] hover:underline"
        >
          ← Volver a consultas
        </button>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          Cargando consulta desde Supabase...
        </div>
      </div>
    );
  }

  if (errorMessage || !inquiry) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <XCircle className="mx-auto text-slate-400" />

        <h2 className="mt-3 font-bold text-slate-950">
          Consulta no encontrada
        </h2>

        <p className="mt-2 text-sm text-slate-500">
          {errorMessage || "No se pudo cargar esta consulta."}
        </p>

        <Button className="mt-4" onClick={() => setActiveView("inquiries")}>
          Volver a consultas
        </Button>
      </div>
    );
  }

  const canReopenInquiry =
    inquiry.status === "replied" ||
    inquiry.status === "closed" ||
    inquiry.status === "discarded";

  const canCreateFollowUp =
    inquiry.status === "new" || inquiry.status === "pending";

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <button
            onClick={() => setActiveView("inquiries")}
            className="mb-3 text-sm font-semibold text-[#0F4C5C] hover:underline"
          >
            ← Volver a consultas
          </button>

          <h1 className="text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">
            Consulta de {inquiry.customerName}
          </h1>

          <div className="mt-2 text-sm font-medium text-slate-600">
            {inquiry.subject}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <PriorityBadge priority={inquiry.aiPriority} />
            <CategoryBadge category={inquiry.aiCategory} />
            <StatusBadge status={inquiry.status} />

            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
              {inquiry.createdAt}
            </span>
          </div>

          {statusErrorMessage ? (
            <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {statusErrorMessage}
            </div>
          ) : null}

          {statusMessage ? (
            <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {statusMessage}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {canReopenInquiry ? (
            <Button
              variant="secondary"
              onClick={() => handleUpdateStatus("pending")}
              disabled={isUpdatingStatus}
            >
              Reabrir consulta
            </Button>
          ) : null}

          <Button
            variant="secondary"
            onClick={() => handleUpdateStatus("replied")}
            disabled={isUpdatingStatus}
          >
            <CheckCircle2 size={16} />
            {isUpdatingStatus ? "Actualizando..." : "Marcar respondida"}
          </Button>

          <Button
            variant="secondary"
            onClick={() => handleUpdateStatus("closed")}
            disabled={isUpdatingStatus}
          >
            Cerrar
          </Button>

          <Button
            variant="ghost"
            onClick={() => handleUpdateStatus("discarded")}
            disabled={isUpdatingStatus}
          >
            Descartar consulta
          </Button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <main className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Mensaje original
            </div>

            <p className="text-base leading-7 text-slate-900">
              {inquiry.originalMessage}
            </p>
          </div>

          <AIBlock inquiry={inquiry} />
          <ResponseEditor inquiry={inquiry} />
        </main>

        <aside className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-slate-950">Cliente</h3>

            <p className="mt-2 font-semibold text-slate-900">
              {customer?.name || inquiry.customerName}
            </p>

            <p className="text-sm text-slate-500">
              {customer?.email || "Sin email"}
            </p>

            <p className="text-sm text-slate-500">
              {customer?.phone || "Sin teléfono"}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-slate-950">
              Seguimiento sugerido
            </h3>

            {canCreateFollowUp ? (
              <>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Crear seguimiento para revisar esta consulta en menos de 24 horas.
                </p>

                {followUpErrorMessage ? (
                  <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {followUpErrorMessage}
                  </div>
                ) : null}

                {followUpMessage ? (
                  <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {followUpMessage}
                  </div>
                ) : null}

                <Button
                  className="mt-4 w-full"
                  onClick={handleCreateFollowUp}
                  disabled={isCreatingFollowUp}
                >
                  <CalendarClock size={16} />
                  {isCreatingFollowUp
                    ? "Creando seguimiento..."
                    : "Crear seguimiento"}
                </Button>
              </>
            ) : (
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Esta consulta está finalizada. Para crear un seguimiento,
                primero reabre la consulta.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-slate-950">Nota interna</h3>

            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="mt-3 min-h-[120px] w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-[#0F4C5C]"
              placeholder="Añadir nota interna..."
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

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-slate-950">Notas de la consulta</h3>

            {notes.length === 0 ? (
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Todavía no hay notas internas para esta consulta.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {notes.map((internalNote) => (
                  <article
                    key={internalNote.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
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
          </div>
        </aside>
      </div>
    </div>
  );
}