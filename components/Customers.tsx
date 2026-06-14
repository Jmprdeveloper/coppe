"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import {
  Archive,
  ClipboardList,
  Plus,
  Search,
  UserCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { getCurrentCompany } from "../lib/currentCompany";
import { normalizeCustomerStatus } from "../lib/customerUtils";
import {
  getCustomerDatabaseErrorMessage,
  isValidEmail,
  isValidPhone,
  normalizePhoneForComparison,
} from "../lib/customerValidation";
import { normalizeInquiryStatus } from "../lib/inquiryUtils";
import { normalizeSearchText } from "../lib/searchUtils";
import { formatSourceChannel } from "../lib/sourceChannels";
import { createClient } from "../lib/supabase/client";
import type { CustomerStatus } from "../types";

import { Button } from "./Button";
import { MetricCard } from "./MetricCard";
import { PageHeader } from "./PageHeader";
import { SectionCard } from "./SectionCard";
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

type CustomerWithActivity = CustomerRow & {
  caseCount: number;
  activeCaseCount: number;
  latestSourceChannel: string | null;
};

type InquiryActivityRow = {
  customer_id: string | null;
  source_channel: string | null;
  status: string | null;
  created_at: string;
};

type CustomerActivitySummary = {
  caseCount: number;
  activeCaseCount: number;
  latestSourceChannel: string | null;
  latestActivityAt: string | null;
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

function isActiveInquiryStatus(status: string | null) {
  const normalizedStatus = normalizeInquiryStatus(status ?? "");

  return (
    normalizedStatus === "new" ||
    normalizedStatus === "pending" ||
    normalizedStatus === "waiting_customer"
  );
}

function buildCustomerActivityMap(inquiries: InquiryActivityRow[]) {
  const activityByCustomerId = new Map<string, CustomerActivitySummary>();

  inquiries.forEach((inquiry) => {
    if (!inquiry.customer_id) {
      return;
    }

    const currentActivity = activityByCustomerId.get(inquiry.customer_id) ?? {
      caseCount: 0,
      activeCaseCount: 0,
      latestSourceChannel: null,
      latestActivityAt: null,
    };

    const nextActivity: CustomerActivitySummary = {
      ...currentActivity,
      caseCount: currentActivity.caseCount + 1,
      activeCaseCount:
        currentActivity.activeCaseCount +
        (isActiveInquiryStatus(inquiry.status) ? 1 : 0),
    };

    if (
      !nextActivity.latestActivityAt ||
      inquiry.created_at.localeCompare(nextActivity.latestActivityAt) > 0
    ) {
      nextActivity.latestActivityAt = inquiry.created_at;
      nextActivity.latestSourceChannel = inquiry.source_channel;
    }

    activityByCustomerId.set(inquiry.customer_id, nextActivity);
  });

  return activityByCustomerId;
}

function getCustomerActivity(
  activityByCustomerId: Map<string, CustomerActivitySummary>,
  customerId: string
): CustomerActivitySummary {
  return (
    activityByCustomerId.get(customerId) ?? {
      caseCount: 0,
      activeCaseCount: 0,
      latestSourceChannel: null,
      latestActivityAt: null,
    }
  );
}

function formatCustomerLanguage(language: string | null) {
  return (language || "es").toUpperCase();
}

function MetricCardsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="h-[116px] animate-pulse rounded-2xl border border-slate-200 bg-slate-100/80 shadow-sm shadow-slate-200/60"
        />
      ))}
    </div>
  );
}

export function Customers({ openCustomer }: CustomersProps) {
  const supabase = useMemo(() => createClient(), []);

  const [customers, setCustomers] = useState<CustomerWithActivity[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [appliedSearchTerm, setAppliedSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<CustomerStatusFilter>("all");

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerLanguage, setNewCustomerLanguage] = useState("es");

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

      const customerRows = (data ?? []) as CustomerRow[];
      const customerIds = customerRows.map((customer) => customer.id);

      let activityByCustomerId = new Map<string, CustomerActivitySummary>();

      if (customerIds.length > 0) {
        const { data: inquiriesData, error: inquiriesError } = await supabase
          .from("inquiries")
          .select("customer_id, source_channel, status, created_at")
          .in("customer_id", customerIds)
          .order("created_at", { ascending: false });

        if (inquiriesError) {
          setErrorMessage(
            `No se pudo cargar la actividad de los clientes: ${
              inquiriesError.message || "sin detalle del error"
            }`
          );
          setIsLoading(false);
          return;
        }

        activityByCustomerId = buildCustomerActivityMap(
          (inquiriesData ?? []) as InquiryActivityRow[]
        );
      }

      setCustomers(
        customerRows.map((customer) => {
          const activity = getCustomerActivity(
            activityByCustomerId,
            customer.id
          );

          return {
            ...customer,
            caseCount: activity.caseCount,
            activeCaseCount: activity.activeCaseCount,
            latestSourceChannel: activity.latestSourceChannel,
          };
        })
      );
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

    setCustomers((currentCustomers) => [
      {
        ...createdCustomer,
        caseCount: 0,
        activeCaseCount: 0,
        latestSourceChannel: null,
      },
      ...currentCustomers,
    ]);
    setSuccessMessage("Cliente creado correctamente.");

    setNewCustomerName("");
    setNewCustomerEmail("");
    setNewCustomerPhone("");
    setNewCustomerLanguage("es");

    window.setTimeout(() => {
      setShowCreateForm(false);
      setSuccessMessage("");
    }, 2200);
  };

  const handleCreateCustomerKeyDown = (
    event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();

    if (isCreatingCustomer || successMessage) {
      return;
    }

    handleCreateCustomer();
  };

  const normalizedSearch = normalizeSearchText(appliedSearchTerm);

  const filteredCustomers = customers.filter((customer) => {
    const normalizedStatus = normalizeCustomerStatus(customer.status);
    const latestSourceChannel = customer.latestSourceChannel
      ? formatSourceChannel(customer.latestSourceChannel)
      : "";

    if (statusFilter !== "all" && normalizedStatus !== statusFilter) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    return (
      normalizeSearchText(customer.name).includes(normalizedSearch) ||
      normalizeSearchText(customer.email).includes(normalizedSearch) ||
      normalizeSearchText(customer.phone).includes(normalizedSearch) ||
      normalizeSearchText(latestSourceChannel).includes(normalizedSearch)
    );
  });

  const hasActiveSearch = appliedSearchTerm.trim().length > 0;
  const hasActiveStatusFilter = statusFilter !== "all";

  const totalCustomers = customers.length;
  const activeCustomers = customers.filter(
    (customer) => normalizeCustomerStatus(customer.status) === "active"
  ).length;
  const newCustomers = customers.filter(
    (customer) => normalizeCustomerStatus(customer.status) === "new"
  ).length;
  const archivedCustomers = customers.filter(
    (customer) => normalizeCustomerStatus(customer.status) === "archived"
  ).length;
  const customersWithActiveCases = customers.filter(
    (customer) => customer.activeCaseCount > 0
  ).length;

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Gestiona los clientes registrados, sus datos de contacto, actividad y casos asociados."
        action={
          <Button onClick={handleOpenCreateForm}>
            <Plus size={16} /> Nuevo cliente
          </Button>
        }
      />

      {isLoading ? (
        <MetricCardsSkeleton />
      ) : (
        <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            title="Clientes totales"
            value={totalCustomers}
            caption="Registrados en el espacio activo"
            icon={Users}
            tone="brand"
          />

          <MetricCard
            title="Activos"
            value={activeCustomers}
            caption="Disponibles para nuevos casos"
            icon={UserCheck}
            tone="success"
          />

          <MetricCard
            title="Nuevos"
            value={newCustomers}
            caption="Clientes recién incorporados"
            icon={UserPlus}
            tone="info"
          />

          <MetricCard
            title="Con casos activos"
            value={customersWithActiveCases}
            caption="Requieren atención operativa"
            icon={ClipboardList}
            tone={customersWithActiveCases > 0 ? "warning" : "neutral"}
          />

          <MetricCard
            title="Archivados"
            value={archivedCustomers}
            caption="Fuera de la operativa diaria"
            icon={Archive}
            tone="neutral"
          />
        </div>
      )}

      {showCreateForm ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-customer-title"
          onClick={handleCloseCreateForm}
        >
          <div
            className="max-h-[calc(100vh-3rem)] w-full max-w-3xl overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <div className="mb-2 inline-flex rounded-full border border-[#0F4C5C]/15 bg-[#0F4C5C]/[0.06] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#0F4C5C]">
                  Nuevo cliente
                </div>

                <h2
                  id="new-customer-title"
                  className="text-xl font-bold text-slate-950"
                >
                  Crear cliente
                </h2>

                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Añade un cliente para asociarle casos, notas, citas internas y
                  seguimientos.
                </p>
              </div>

              <button
                type="button"
                onClick={handleCloseCreateForm}
                className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                title="Cerrar ventana"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">
                  Nombre
                  <input
                    value={newCustomerName}
                    onChange={(event) =>
                      setNewCustomerName(event.target.value)
                    }
                    onKeyDown={handleCreateCustomerKeyDown}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-[#0F4C5C] focus:bg-white"
                    placeholder="Nombre del cliente"
                    autoFocus
                  />
                </label>

                <label className="text-sm font-medium text-slate-700">
                  Email
                  <input
                    type="email"
                    value={newCustomerEmail}
                    onChange={(event) =>
                      setNewCustomerEmail(event.target.value)
                    }
                    onKeyDown={handleCreateCustomerKeyDown}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-[#0F4C5C] focus:bg-white"
                    placeholder="cliente@email.com"
                  />
                </label>

                <label className="text-sm font-medium text-slate-700">
                  Teléfono
                  <input
                    type="tel"
                    value={newCustomerPhone}
                    onChange={(event) =>
                      setNewCustomerPhone(event.target.value)
                    }
                    onKeyDown={handleCreateCustomerKeyDown}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-[#0F4C5C] focus:bg-white"
                    placeholder="+34 600 000 000"
                  />
                </label>

                <label className="text-sm font-medium text-slate-700">
                  Idioma
                  <select
                    value={newCustomerLanguage}
                    onChange={(event) =>
                      setNewCustomerLanguage(event.target.value)
                    }
                    onKeyDown={handleCreateCustomerKeyDown}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-[#0F4C5C] focus:bg-white"
                  >
                    <option value="es">Español</option>
                    <option value="en">Inglés</option>
                  </select>
                </label>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
                Introduce al menos un email o un teléfono. COPPE comprobará si
                ya existe un cliente con esos datos antes de guardarlo.
              </div>

              {createErrorMessage ? (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {createErrorMessage}
                </div>
              ) : null}

              {successMessage ? (
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                  {successMessage}
                </div>
              ) : null}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/70 px-6 py-4 sm:flex-row sm:items-center sm:justify-end">
              <Button variant="ghost" onClick={handleCloseCreateForm}>
                Cancelar
              </Button>

              <Button
                onClick={handleCreateCustomer}
                disabled={isCreatingCustomer}
              >
                {isCreatingCustomer ? "Creando cliente..." : "Guardar cliente"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <SectionCard
        title="Buscar y filtrar clientes"
        description="Localiza clientes por nombre, email, teléfono, estado o último canal utilizado."
        className="mb-5"
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 focus-within:border-[#0F4C5C] focus-within:bg-white">
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
                placeholder="Buscar por nombre, email, teléfono o último canal..."
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

          <div className="flex flex-wrap gap-2">
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
        </div>
      </SectionCard>

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
          Cargando clientes...
        </div>
      ) : null}

      {!isLoading && !errorMessage && filteredCustomers.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          No hay clientes que coincidan con los filtros aplicados.
        </div>
      ) : null}

      {!isLoading && !errorMessage && filteredCustomers.length > 0 ? (
        <SectionCard
          title="Listado de clientes"
          description={
            hasActiveSearch || hasActiveStatusFilter
              ? `Mostrando ${filteredCustomers.length} de ${customers.length} cliente${
                  customers.length === 1 ? "" : "s"
                }.`
              : `${customers.length} cliente${
                  customers.length === 1 ? "" : "s"
                } registrado${customers.length === 1 ? "" : "s"}.`
          }
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredCustomers.map((customer) => {
              const latestSourceChannel = customer.latestSourceChannel
                ? formatSourceChannel(customer.latestSourceChannel)
                : "Sin canal todavía";

              return (
                <button
                  key={customer.id}
                  onClick={() => openCustomer(customer.id)}
                  className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm shadow-slate-200/50 transition hover:border-[#0F4C5C]/30 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-bold text-slate-950">
                        {customer.name}
                      </h3>

                      <p className="mt-1 truncate text-sm text-slate-500">
                        {customer.email || "Sin email"}
                      </p>

                      <p className="truncate text-sm text-slate-500">
                        {customer.phone || "Sin teléfono"}
                      </p>
                    </div>

                    <StatusBadge
                      status={normalizeCustomerStatus(customer.status)}
                    />
                  </div>

                  <div className="mt-4 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="font-semibold text-slate-700">
                        {customer.caseCount}
                      </div>
                      <div>
                        {customer.caseCount === 1
                          ? "caso total"
                          : "casos totales"}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="font-semibold text-slate-700">
                        {customer.activeCaseCount}
                      </div>
                      <div>
                        {customer.activeCaseCount === 1
                          ? "caso activo"
                          : "casos activos"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-600">
                      Último canal: {latestSourceChannel}
                    </span>

                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-600">
                      {formatCustomerLanguage(customer.language)}
                    </span>
                  </div>

                  <div className="mt-3 text-xs text-slate-500">
                    Última interacción:{" "}
                    {formatLastInteraction(customer.last_interaction_at)}
                  </div>
                </button>
              );
            })}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}