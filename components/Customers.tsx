"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";

import { getCurrentCompany } from "../lib/currentCompany";
import { normalizeCustomerStatus } from "../lib/customerUtils";
import {
  getCustomerDatabaseErrorMessage,
  isValidEmail,
  isValidPhone,
  normalizePhoneForComparison,
} from "../lib/customerValidation";
import { normalizeSearchText } from "../lib/searchUtils";
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

type CustomerStatusFilter = "all" | CustomerStatus;

const customerStatusFilters: {
  value: CustomerStatusFilter;
  label: string;
}[] = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Activos" },
  { value: "new", label: "Nuevos" },
  { value: "inactive", label: "Inactivos" },
  { value: "archived", label: "Archivados" },
];

function customerStatusFilterLabel(status: CustomerStatusFilter) {
  const filter = customerStatusFilters.find(
    (customerStatusFilter) => customerStatusFilter.value === status
  );

  return filter?.label ?? "Todos";
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
  const [appliedSearchTerm, setAppliedSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<CustomerStatusFilter>("all");

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerLanguage, setNewCustomerLanguage] = useState("es");

  const [createdCustomerId, setCreatedCustomerId] = useState<string | null>(
    null
  );

  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");
  const [createErrorMessage, setCreateErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

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

  const handleSearch = () => {
    setAppliedSearchTerm(searchTerm);
  };

  const handleClearSearch = () => {
    setSearchTerm("");
    setAppliedSearchTerm("");
  };

  const resetCreateCustomerForm = () => {
    setNewCustomerName("");
    setNewCustomerEmail("");
    setNewCustomerPhone("");
    setNewCustomerLanguage("es");
    setCreateErrorMessage("");
    setSuccessMessage("");
    setCreatedCustomerId(null);
  };

  const handleOpenCreateForm = () => {
    resetCreateCustomerForm();
    setShowCreateForm(true);
  };

  const handleCloseCreateForm = () => {
    setShowCreateForm(false);
    setCreateErrorMessage("");
  };

  const handleCreateCustomer = async () => {
    setCreateErrorMessage("");
    setSuccessMessage("");
    setCreatedCustomerId(null);

    const cleanName = newCustomerName.trim();
    const cleanEmail = newCustomerEmail.trim().toLowerCase();
    const cleanPhone = newCustomerPhone.trim();
    const cleanLanguage = newCustomerLanguage.trim() || "es";

    if (!cleanName) {
      setCreateErrorMessage("El nombre del cliente es obligatorio.");
      return;
    }

    if (!cleanEmail && !cleanPhone) {
      setCreateErrorMessage(
        "Introduce al menos un email o un teléfono para poder identificar al cliente."
      );
      return;
    }

    if (cleanEmail && !isValidEmail(cleanEmail)) {
      setCreateErrorMessage("El email no tiene un formato válido.");
      return;
    }

    if (cleanPhone && !isValidPhone(cleanPhone)) {
      setCreateErrorMessage(
        "El teléfono no tiene un formato válido. Usa un número real, por ejemplo +34 600 000 000."
      );
      return;
    }

    setIsCreatingCustomer(true);

    const { data: company, error: companyError } =
      await getCurrentCompany(supabase);

    if (companyError || !company) {
      setIsCreatingCustomer(false);
      setCreateErrorMessage(
        `No se pudo localizar la empresa del usuario: ${
          companyError?.message || "no hay empresa asociada"
        }`
      );
      return;
    }

    if (cleanEmail) {
      const { data: existingCustomer, error: existingCustomerError } =
        await supabase
          .from("customers")
          .select("id")
          .eq("company_id", company.id)
          .eq("email", cleanEmail)
          .limit(1)
          .maybeSingle<{ id: string }>();

      if (existingCustomerError) {
        setIsCreatingCustomer(false);
        setCreateErrorMessage(
          `No se pudo comprobar si el email ya existía: ${
            existingCustomerError.message || "sin detalle del error"
          }`
        );
        return;
      }

      if (existingCustomer) {
        setIsCreatingCustomer(false);
        setCreateErrorMessage(
          "Ya existe un cliente con ese email en esta empresa."
        );
        return;
      }
    }

    if (cleanPhone) {
      const { data: existingCustomersByPhone, error: existingPhoneError } =
        await supabase
          .from("customers")
          .select("id, phone")
          .eq("company_id", company.id);

      if (existingPhoneError) {
        setIsCreatingCustomer(false);
        setCreateErrorMessage(
          `No se pudo comprobar si el teléfono ya existía: ${
            existingPhoneError.message || "sin detalle del error"
          }`
        );
        return;
      }

      const normalizedNewPhone = normalizePhoneForComparison(cleanPhone);

      const duplicatedPhoneCustomer = (
        (existingCustomersByPhone ?? []) as Pick<CustomerRow, "id" | "phone">[]
      ).find((customer) => {
        return (
          normalizePhoneForComparison(customer.phone) === normalizedNewPhone
        );
      });

      if (duplicatedPhoneCustomer) {
        setIsCreatingCustomer(false);
        setCreateErrorMessage(
          "Ya existe un cliente con ese teléfono en esta empresa."
        );
        return;
      }
    }

    const { data: createdCustomer, error: createCustomerError } = await supabase
      .from("customers")
      .insert({
        company_id: company.id,
        name: cleanName,
        email: cleanEmail || null,
        phone: cleanPhone || null,
        language: cleanLanguage,
        status: "active",
        last_interaction_at: null,
      })
      .select(
        "id, name, email, phone, language, status, last_interaction_at, created_at"
      )
      .single<CustomerRow>();

    setIsCreatingCustomer(false);

    if (createCustomerError || !createdCustomer) {
      setCreateErrorMessage(
        `No se pudo crear el cliente: ${getCustomerDatabaseErrorMessage(
          createCustomerError?.message ?? ""
        )}`
      );
      return;
    }

    setCustomers((currentCustomers) => [createdCustomer, ...currentCustomers]);
    setCreatedCustomerId(createdCustomer.id);
    setSuccessMessage("Cliente creado correctamente.");

    setNewCustomerName("");
    setNewCustomerEmail("");
    setNewCustomerPhone("");
    setNewCustomerLanguage("es");
  };

  const normalizedSearch = normalizeSearchText(appliedSearchTerm);

  const filteredCustomers = customers.filter((customer) => {
    const normalizedStatus = normalizeCustomerStatus(customer.status);

    if (statusFilter !== "all" && normalizedStatus !== statusFilter) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    return (
      normalizeSearchText(customer.name).includes(normalizedSearch) ||
      normalizeSearchText(customer.email).includes(normalizedSearch) ||
      normalizeSearchText(customer.phone).includes(normalizedSearch)
    );
  });

  const hasActiveSearch = appliedSearchTerm.trim().length > 0;
  const hasActiveStatusFilter = statusFilter !== "all";

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Lista simple de clientes con su última interacción."
        action={
          <Button onClick={handleOpenCreateForm}>
            <Plus size={16} /> Nuevo cliente
          </Button>
        }
      />

      {showCreateForm ? (
        <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Nuevo cliente
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Crea un cliente para asociarle consultas, notas y seguimientos.
              </p>
            </div>

            <button
              type="button"
              onClick={handleCloseCreateForm}
              className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="Cerrar formulario"
            >
              <X size={18} />
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Nombre
              <input
                value={newCustomerName}
                onChange={(event) => setNewCustomerName(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                placeholder="Nombre del cliente"
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Email
              <input
                type="email"
                value={newCustomerEmail}
                onChange={(event) => setNewCustomerEmail(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                placeholder="cliente@email.com"
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Teléfono
              <input
                type="tel"
                value={newCustomerPhone}
                onChange={(event) => setNewCustomerPhone(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                placeholder="+34 600 000 000"
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Idioma
              <select
                value={newCustomerLanguage}
                onChange={(event) => setNewCustomerLanguage(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
              >
                <option value="es">Español</option>
                <option value="en">Inglés</option>
              </select>
            </label>
          </div>

          {createErrorMessage ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {createErrorMessage}
            </div>
          ) : null}

          {successMessage ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {successMessage}
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              onClick={handleCreateCustomer}
              disabled={isCreatingCustomer}
            >
              {isCreatingCustomer ? "Creando cliente..." : "Guardar cliente"}
            </Button>

            {createdCustomerId ? (
              <Button
                variant="secondary"
                onClick={() => openCustomer(createdCustomerId)}
              >
                Ver cliente
              </Button>
            ) : null}

            <Button variant="ghost" onClick={handleCloseCreateForm}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-2 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
          <Search size={16} className="shrink-0 text-slate-400" />

          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                handleSearch();
              }
            }}
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            placeholder="Buscar por nombre, email o teléfono..."
          />
        </div>

        <div className="flex gap-2">
          {hasActiveSearch ? (
            <button
              type="button"
              onClick={handleClearSearch}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
            >
              <X size={15} /> Limpiar
            </button>
          ) : null}

          <Button onClick={handleSearch}>
            <Search size={16} /> Buscar
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {customerStatusFilters.map((customerStatusFilter) => (
          <button
            key={customerStatusFilter.value}
            type="button"
            onClick={() => setStatusFilter(customerStatusFilter.value)}
            className={
              statusFilter === customerStatusFilter.value
                ? "rounded-xl bg-[#0F4C5C] px-3 py-2 text-sm font-semibold text-white transition"
                : "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
            }
          >
            {customerStatusFilter.label}
          </button>
        ))}
      </div>

      {hasActiveSearch || hasActiveStatusFilter ? (
        <div className="mb-4 text-sm text-slate-500">
          {hasActiveSearch ? (
            <>
              Mostrando resultados para{" "}
              <span className="font-semibold text-slate-700">
                “{appliedSearchTerm}”
              </span>
            </>
          ) : null}

          {hasActiveSearch && hasActiveStatusFilter ? " · " : null}

          {hasActiveStatusFilter ? (
            <>
              Estado:{" "}
              <span className="font-semibold text-slate-700">
                {customerStatusFilterLabel(statusFilter)}
              </span>
            </>
          ) : null}
        </div>
      ) : null}

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
          No hay clientes que coincidan con los filtros aplicados.
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