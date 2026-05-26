"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";

import { createClient } from "../lib/supabase/client";
import type { CustomerStatus } from "../types";

import { Button } from "./Button";
import { PageHeader } from "./PageHeader";
import { StatusBadge } from "./StatusBadge";

type CustomersProps = {
  openCustomer: (id: string) => void;
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

function formatLastInteraction(value: string | null) {
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

export function Customers({ openCustomer }: CustomersProps) {
  const supabase = useMemo(() => createClient(), []);

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadCustomers() {
      setIsLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("customers")
        .select(
          "id, name, email, phone, language, status, last_interaction_at, created_at"
        )
        .order("last_interaction_at", {
          ascending: false,
          nullsFirst: false,
        })
        .order("created_at", { ascending: false });

      if (error) {
        setErrorMessage(
          `No se pudieron cargar los clientes: ${
            error.message || "sin detalle del error"
          }`
        );
        setIsLoading(false);
        return;
      }

      setCustomers((data ?? []) as CustomerRow[]);
      setIsLoading(false);
    }

    loadCustomers();
  }, [supabase]);

  const filteredCustomers = customers.filter((customer) => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    if (!normalizedSearch) {
      return true;
    }

    return (
      customer.name.toLowerCase().includes(normalizedSearch) ||
      (customer.email ?? "").toLowerCase().includes(normalizedSearch) ||
      (customer.phone ?? "").toLowerCase().includes(normalizedSearch)
    );
  });

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Lista simple de clientes con su última interacción."
        action={
          <Button>
            <Plus size={16} /> Nuevo cliente
          </Button>
        }
      />

      <div className="mb-4 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
        <Search size={16} className="text-slate-400" />

        <input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          placeholder="Buscar cliente..."
        />
      </div>

      {errorMessage ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          Cargando clientes desde Supabase...
        </div>
      ) : null}

      {!isLoading && !errorMessage && filteredCustomers.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          No hay clientes que coincidan con la búsqueda.
        </div>
      ) : null}

      {!isLoading && !errorMessage && filteredCustomers.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredCustomers.map((customer) => (
            <button
              key={customer.id}
              onClick={() => openCustomer(customer.id)}
              className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-[#0F4C5C]/30 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-950">
                    {customer.name}
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    {customer.email || "Sin email"}
                  </p>

                  <p className="text-sm text-slate-500">
                    {customer.phone || "Sin teléfono"}
                  </p>
                </div>

                <StatusBadge
                  status={normalizeCustomerStatus(customer.status)}
                />
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500">
                <span>
                  Última interacción:{" "}
                  {formatLastInteraction(customer.last_interaction_at)}
                </span>

                <span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-600">
                  {(customer.language || "es").toUpperCase()}
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}