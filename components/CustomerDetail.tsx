"use client";

import { useEffect, useMemo, useState } from "react";

import { createClient } from "../lib/supabase/client";
import type { CustomerStatus } from "../types";

import { Button } from "./Button";
import { PageHeader } from "./PageHeader";
import { StatusBadge } from "./StatusBadge";

type CustomerDetailProps = {
  customerId: string;
  setActiveView: (view: string) => void;
  openInquiry: (id: string) => void;
};

type CustomerRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  language: string | null;
  status: string;
  last_interaction_at: string | null;
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

export function CustomerDetail({
  customerId,
  setActiveView,
}: CustomerDetailProps) {
  const supabase = useMemo(() => createClient(), []);

  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [note, setNote] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [noteMessage, setNoteMessage] = useState("");

  useEffect(() => {
    async function loadCustomer() {
      setIsLoading(true);
      setErrorMessage("");
      setNoteMessage("");

      const { data, error } = await supabase
        .from("customers")
        .select(
          "id, name, email, phone, language, status, last_interaction_at, created_at"
        )
        .eq("id", customerId)
        .maybeSingle<CustomerRow>();

      if (error) {
        setErrorMessage(
          `No se pudo cargar el cliente: ${
            error.message || "sin detalle del error"
          }`
        );
        setIsLoading(false);
        return;
      }

      if (!data) {
        setErrorMessage(
          "No se encontró este cliente o no pertenece a tu empresa."
        );
        setIsLoading(false);
        return;
      }

      setCustomer(data);
      setIsLoading(false);
    }

    loadCustomer();
  }, [customerId, supabase]);

  const handleSaveNote = () => {
    setNoteMessage("");

    if (!note.trim()) {
      setNoteMessage("Escribe una nota antes de guardarla.");
      return;
    }

    setNoteMessage(
      "La nota rápida todavía no se guarda en Supabase. La activaremos cuando migremos internal_notes."
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

            {noteMessage ? (
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                {noteMessage}
              </div>
            ) : null}

            <Button
              variant="secondary"
              className="mt-3 w-full"
              onClick={handleSaveNote}
            >
              Guardar nota
            </Button>
          </div>
        </aside>

        <main>
          <h2 className="mb-3 text-lg font-bold text-slate-950">
            Consultas del cliente
          </h2>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
            Las consultas asociadas a este cliente todavía no se leen desde
            Supabase. Las migraremos en el siguiente bloque.
          </div>
        </main>
      </div>
    </div>
  );
}