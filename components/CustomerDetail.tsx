"use client";

import { useEffect, useMemo, useState } from "react";

import { createClient } from "../lib/supabase/client";
import type {
  CustomerStatus,
  Inquiry,
  InquiryCategory,
  InquiryStatus,
  Priority,
} from "../types";

import { Button } from "./Button";
import { InquiryCard } from "./InquiryCard";
import { PageHeader } from "./PageHeader";
import { StatusBadge } from "./StatusBadge";

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

type InquiryRow = {
  id: string;
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

function normalizeCustomerStatus(status: string): CustomerStatus {
  if (
    status === "new" ||
    status === "active" ||
    status === "inactive" ||
    status === "archived"
  ) {
    return status;
  }

  return "active";
}

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

function formatDateTime(value: string | null) {
  if (!value) {
    return "Sin interacciones";
  }

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

function formatLanguage(language: string | null) {
  if (language === "es") {
    return "Español";
  }

  if (language === "en") {
    return "Inglés";
  }

  return language || "No indicado";
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

export function CustomerDetail({
  customerId,
  setActiveView,
  openInquiry,
}: CustomerDetailProps) {
  const supabase = useMemo(() => createClient(), []);

  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [notes, setNotes] = useState<InternalNoteRow[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [note, setNote] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSavingNote, setIsSavingNote] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");
  const [noteMessage, setNoteMessage] = useState("");
  const [noteErrorMessage, setNoteErrorMessage] = useState("");

  useEffect(() => {
    async function loadCustomerData() {
      setIsLoading(true);
      setErrorMessage("");
      setNoteMessage("");
      setNoteErrorMessage("");
      setCustomer(null);
      setNotes([]);
      setInquiries([]);
      setNote("");

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
          `Se cargó el cliente, pero no se pudieron cargar sus consultas: ${
            inquiriesError.message || "sin detalle del error"
          }`
        );
        setIsLoading(false);
        return;
      }

      setCustomer(customerData);
      setNotes((notesData ?? []) as InternalNoteRow[]);
      setInquiries(
        ((inquiriesData ?? []) as unknown as InquiryRow[]).map(
          mapInquiryRowToInquiry
        )
      );
      setIsLoading(false);
    }

    loadCustomerData();
  }, [customerId, supabase]);

  const handleSaveNote = async () => {
    setNoteMessage("");
    setNoteErrorMessage("");

    if (!customer) {
      setNoteErrorMessage("No se puede guardar la nota porque no hay cliente cargado.");
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
          Cargando cliente desde Supabase...
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

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <aside className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-slate-950">Datos del cliente</h3>

            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Estado</span>
                <StatusBadge
                  status={normalizeCustomerStatus(customer.status)}
                />
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Idioma</span>
                <span className="font-medium text-slate-800">
                  {formatLanguage(customer.language)}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Email</span>
                <span className="font-medium text-slate-800">
                  {customer.email || "Sin email"}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Teléfono</span>
                <span className="font-medium text-slate-800">
                  {customer.phone || "Sin teléfono"}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Última interacción</span>
                <span className="font-medium text-slate-800">
                  {formatDateTime(customer.last_interaction_at)}
                </span>
              </div>
            </div>
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
            >
              {isSavingNote ? "Guardando nota..." : "Guardar nota"}
            </Button>
          </div>
        </aside>

        <main className="space-y-5">
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
              Consultas del cliente
            </h2>

            {inquiries.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
                Todavía no hay consultas asociadas a este cliente.
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