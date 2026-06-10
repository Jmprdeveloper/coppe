"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ClipboardList,
  Inbox,
  MessageSquareText,
  Plus,
  Search,
  X,
} from "lucide-react";

import { inquiryCategoryOptions } from "../lib/inquiryCategories";
import {
  formatDateTime,
  normalizeInquiryCategory,
  normalizeInquiryStatus,
  normalizePriority,
} from "../lib/inquiryUtils";
import { normalizeSearchText } from "../lib/searchUtils";
import {
  formatSourceChannel,
  sourceChannelOptions,
} from "../lib/sourceChannels";
import { createClient } from "../lib/supabase/client";

import { BoardColumn } from "./BoardColumn";
import { Button } from "./Button";
import { CategoryBadge } from "./CategoryBadge";
import { MetricCard } from "./MetricCard";
import { PageHeader } from "./PageHeader";
import { PriorityBadge } from "./PriorityBadge";
import { SectionCard } from "./SectionCard";
import { StatusBadge } from "./StatusBadge";

type InquiriesProps = {
  openInquiry: (id: string) => void;
  setActiveView: (view: string) => void;
};

type InquiryRow = {
  id: string;
  customer_name: string;
  source_channel: string;
  subject: string | null;
  original_message: string;
  ai_summary: string | null;
  ai_category: string | null;
  ai_priority: string | null;
  status: string;
  created_at: string;
};

function SourceChannelBadge({ channel }: { channel: string | null }) {
  const label = formatSourceChannel(channel);

  return (
    <span className="inline-flex max-w-full items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
      <span className="truncate">{label}</span>
    </span>
  );
}

function isActiveInquiryStatus(status: string | null | undefined) {
  const normalizedStatus = normalizeInquiryStatus(status ?? "");

  return (
    normalizedStatus === "new" ||
    normalizedStatus === "pending" ||
    normalizedStatus === "waiting_customer"
  );
}

function getCaseCardAccentClassName(inquiry: InquiryRow) {
  const status = normalizeInquiryStatus(inquiry.status);
  const priority = normalizePriority(inquiry.ai_priority);

  if (priority === "high" && isActiveInquiryStatus(status)) {
    return "border-red-200 ring-1 ring-red-100";
  }

  if (status === "new") {
    return "border-sky-200 ring-1 ring-sky-100";
  }

  if (status === "pending") {
    return "border-amber-200 ring-1 ring-amber-100";
  }

  if (status === "waiting_customer") {
    return "border-[#0F4C5C]/25 ring-1 ring-[#0F4C5C]/10";
  }

  return "border-slate-200";
}

function CaseBoardCard({
  inquiry,
  openInquiry,
}: {
  inquiry: InquiryRow;
  openInquiry: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => openInquiry(inquiry.id)}
      className={`w-full rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:border-[#0F4C5C]/30 hover:shadow-md ${getCaseCardAccentClassName(
        inquiry
      )}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <SourceChannelBadge channel={inquiry.source_channel} />

        <PriorityBadge priority={normalizePriority(inquiry.ai_priority)} />
        <CategoryBadge category={normalizeInquiryCategory(inquiry.ai_category)} />
        <StatusBadge status={normalizeInquiryStatus(inquiry.status)} />
      </div>

      <h3 className="mt-3 font-bold text-slate-950">
        {inquiry.customer_name}
      </h3>

      <div className="mt-1 text-sm font-semibold text-slate-800">
        {inquiry.subject || "Sin asunto"}
      </div>

      <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">
        {inquiry.ai_summary ||
          inquiry.original_message ||
          "Sin resumen disponible"}
      </p>

      <div className="mt-3 text-xs font-medium text-slate-400">
        {formatDateTime(inquiry.created_at)}
      </div>
    </button>
  );
}

function EmptyColumnState({ children }: { children: string }) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-5 text-sm leading-6 text-slate-600 shadow-sm">
      {children}
    </div>
  );
}

function HistoryInquiryRow({
  inquiry,
  openInquiry,
}: {
  inquiry: InquiryRow;
  openInquiry: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => openInquiry(inquiry.id)}
      className="grid w-full gap-3 px-4 py-4 text-left transition hover:bg-slate-50 md:grid-cols-[1fr_1.5fr_0.9fr_0.9fr_0.8fr] md:items-center"
    >
      <div className="min-w-0">
        <div className="truncate font-semibold text-slate-950">
          {inquiry.customer_name}
        </div>

        <div className="mt-2 md:hidden">
          <SourceChannelBadge channel={inquiry.source_channel} />
        </div>
      </div>

      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-slate-800">
          {inquiry.subject || "Sin asunto"}
        </div>

        <div className="mt-1 line-clamp-1 text-xs text-slate-500">
          {inquiry.ai_summary ||
            inquiry.original_message ||
            "Sin resumen disponible"}
        </div>
      </div>

      <div className="hidden md:block">
        <SourceChannelBadge channel={inquiry.source_channel} />
      </div>

      <div>
        <StatusBadge status={normalizeInquiryStatus(inquiry.status)} />
      </div>

      <div className="text-xs text-slate-500">
        {formatDateTime(inquiry.created_at)}
      </div>
    </button>
  );
}

export function Inquiries({ openInquiry, setActiveView }: InquiriesProps) {
  const supabase = useMemo(() => createClient(), []);

  const [inquiries, setInquiries] = useState<InquiryRow[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [appliedSearchTerm, setAppliedSearchTerm] = useState("");

  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sourceChannelFilter, setSourceChannelFilter] = useState("all");

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadInquiries() {
      setIsLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("inquiries")
        .select(
          "id, customer_name, source_channel, subject, original_message, ai_summary, ai_category, ai_priority, status, created_at"
        )
        .order("created_at", { ascending: false });

      if (error) {
        setErrorMessage(
          `No se pudieron cargar los casos: ${
            error.message || "sin detalle del error"
          }`
        );
        setIsLoading(false);
        return;
      }

      setInquiries((data ?? []) as InquiryRow[]);
      setIsLoading(false);
    }

    loadInquiries();
  }, [supabase]);

  const handleSearch = () => {
    setAppliedSearchTerm(searchTerm);
  };

  const handleClearSearch = () => {
    setSearchTerm("");
    setAppliedSearchTerm("");
    setStatusFilter("all");
    setPriorityFilter("all");
    setCategoryFilter("all");
    setSourceChannelFilter("all");
  };

  const normalizedSearch = normalizeSearchText(appliedSearchTerm);

  const filteredInquiries = inquiries.filter((inquiry) => {
    const normalizedStatus = normalizeInquiryStatus(inquiry.status);
    const normalizedPriority = normalizePriority(inquiry.ai_priority);
    const formattedSourceChannel = formatSourceChannel(inquiry.source_channel);

    const matchesSearch =
      !normalizedSearch ||
      normalizeSearchText(inquiry.customer_name).includes(normalizedSearch) ||
      normalizeSearchText(inquiry.subject).includes(normalizedSearch) ||
      normalizeSearchText(inquiry.original_message).includes(
        normalizedSearch
      ) ||
      normalizeSearchText(inquiry.ai_summary).includes(normalizedSearch) ||
      normalizeSearchText(inquiry.ai_category).includes(normalizedSearch) ||
      normalizeSearchText(formattedSourceChannel).includes(normalizedSearch);

    const matchesStatus =
      statusFilter === "all" || normalizedStatus === statusFilter;

    const matchesPriority =
      priorityFilter === "all" || normalizedPriority === priorityFilter;

    const matchesCategory =
      categoryFilter === "all" ||
      normalizeInquiryCategory(inquiry.ai_category) === categoryFilter;

    const matchesSourceChannel =
      sourceChannelFilter === "all" ||
      formattedSourceChannel === formatSourceChannel(sourceChannelFilter);

    return (
      matchesSearch &&
      matchesStatus &&
      matchesPriority &&
      matchesCategory &&
      matchesSourceChannel
    );
  });

  const newCount = inquiries.filter(
    (inquiry) => normalizeInquiryStatus(inquiry.status) === "new"
  ).length;

  const pendingCount = inquiries.filter(
    (inquiry) => normalizeInquiryStatus(inquiry.status) === "pending"
  ).length;

  const waitingCustomerCount = inquiries.filter(
    (inquiry) => normalizeInquiryStatus(inquiry.status) === "waiting_customer"
  ).length;

  const highPriorityActiveCount = inquiries.filter(
    (inquiry) =>
      isActiveInquiryStatus(inquiry.status) &&
      normalizePriority(inquiry.ai_priority) === "high"
  ).length;

  const newInquiries = filteredInquiries.filter(
    (inquiry) => normalizeInquiryStatus(inquiry.status) === "new"
  );

  const pendingInquiries = filteredInquiries.filter(
    (inquiry) => normalizeInquiryStatus(inquiry.status) === "pending"
  );

  const waitingCustomerInquiries = filteredInquiries.filter(
    (inquiry) =>
      normalizeInquiryStatus(inquiry.status) === "waiting_customer"
  );

  const historyInquiries = filteredInquiries.filter(
    (inquiry) =>
      !(
        normalizeInquiryStatus(inquiry.status) === "new" ||
        normalizeInquiryStatus(inquiry.status) === "pending" ||
        normalizeInquiryStatus(inquiry.status) === "waiting_customer"
      )
  );

  const activeFilteredCount =
    newInquiries.length + pendingInquiries.length + waitingCustomerInquiries.length;

  const hasActiveFilters =
    appliedSearchTerm.trim().length > 0 ||
    statusFilter !== "all" ||
    priorityFilter !== "all" ||
    categoryFilter !== "all" ||
    sourceChannelFilter !== "all";

  return (
    <div>
      <PageHeader
        title="Casos"
        description="Todos los casos de atención registrados, clasificados por estado, prioridad, categoría y canal."
        action={
          <Button onClick={() => setActiveView("InquiryForm")}>
            <Plus size={16} /> Registrar mensaje
          </Button>
        }
      />

      <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Nuevos"
          value={newCount}
          caption="Entradas sin revisar"
          icon={Inbox}
          tone="info"
        />

        <MetricCard
          title="En seguimiento"
          value={pendingCount}
          caption="Necesitan respuesta o revisión"
          icon={ClipboardList}
          tone="warning"
        />

        <MetricCard
          title="Esperando cliente"
          value={waitingCustomerCount}
          caption="La empresa ya respondió"
          icon={MessageSquareText}
          tone="brand"
        />

        <MetricCard
          title="Alta prioridad"
          value={highPriorityActiveCount}
          caption="Casos activos marcados como urgentes"
          icon={AlertTriangle}
          tone={highPriorityActiveCount > 0 ? "danger" : "neutral"}
        />
      </div>

      <SectionCard
        title="Buscar y filtrar casos"
        description="Localiza casos por cliente, asunto, mensaje, canal, estado, prioridad o categoría."
        className="mb-5"
      >
        <div className="space-y-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
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
                placeholder="Buscar por cliente, asunto, mensaje, categoría o canal..."
              />
            </div>

            <div className="flex gap-2">
              {hasActiveFilters ? (
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

          <div className="grid gap-2 md:grid-cols-4">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Estado
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal normal-case text-slate-700 outline-none transition focus:border-[#0F4C5C] focus:bg-white"
              >
                <option value="all">Todos</option>
                <option value="new">Nuevo</option>
                <option value="pending">En seguimiento</option>
                <option value="waiting_customer">Esperando al cliente</option>
                <option value="replied">Respondido</option>
                <option value="closed">Cerrado</option>
                <option value="discarded">Descartado</option>
              </select>
            </label>

            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Prioridad
              <select
                value={priorityFilter}
                onChange={(event) => setPriorityFilter(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal normal-case text-slate-700 outline-none transition focus:border-[#0F4C5C] focus:bg-white"
              >
                <option value="all">Todas</option>
                <option value="low">Baja</option>
                <option value="medium">Media</option>
                <option value="high">Alta</option>
              </select>
            </label>

            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Categoría
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal normal-case text-slate-700 outline-none transition focus:border-[#0F4C5C] focus:bg-white"
              >
                <option value="all">Todas</option>

                {inquiryCategoryOptions.map((categoryOption) => (
                  <option
                    key={categoryOption.value}
                    value={categoryOption.value}
                  >
                    {categoryOption.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Canal
              <select
                value={sourceChannelFilter}
                onChange={(event) => setSourceChannelFilter(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal normal-case text-slate-700 outline-none transition focus:border-[#0F4C5C] focus:bg-white"
              >
                <option value="all">Todos los canales</option>

                {sourceChannelOptions.map((sourceChannelOption) => (
                  <option
                    key={sourceChannelOption.value}
                    value={sourceChannelOption.value}
                  >
                    {sourceChannelOption.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </SectionCard>

      {errorMessage ? (
        <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          Cargando casos...
        </div>
      ) : null}

      {!isLoading && !errorMessage ? (
        <>
          <section>
            <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Casos activos
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  {hasActiveFilters
                    ? `Mostrando ${activeFilteredCount} casos activos filtrados.`
                    : "Casos que todavía requieren revisión, respuesta o seguimiento."}
                </p>
              </div>

              {sourceChannelFilter !== "all" ? (
                <div className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                  Canal: {formatSourceChannel(sourceChannelFilter)}
                </div>
              ) : null}
            </div>

            <div className="grid gap-5 xl:grid-cols-3">
              <BoardColumn
                title="Nuevos"
                description="Entradas sin revisar por la empresa."
                count={newInquiries.length}
                tone="info"
              >
                {newInquiries.length === 0 ? (
                  <EmptyColumnState>
                    {hasActiveFilters
                      ? "No hay casos nuevos con estos filtros."
                      : "No hay casos nuevos."}
                  </EmptyColumnState>
                ) : (
                  newInquiries.map((inquiry) => (
                    <CaseBoardCard
                      key={inquiry.id}
                      inquiry={inquiry}
                      openInquiry={openInquiry}
                    />
                  ))
                )}
              </BoardColumn>

              <BoardColumn
                title="En seguimiento"
                description="Casos que necesitan respuesta o revisión."
                count={pendingInquiries.length}
                tone="warning"
              >
                {pendingInquiries.length === 0 ? (
                  <EmptyColumnState>
                    {hasActiveFilters
                      ? "No hay casos en seguimiento con estos filtros."
                      : "No hay casos en seguimiento."}
                  </EmptyColumnState>
                ) : (
                  pendingInquiries.map((inquiry) => (
                    <CaseBoardCard
                      key={inquiry.id}
                      inquiry={inquiry}
                      openInquiry={openInquiry}
                    />
                  ))
                )}
              </BoardColumn>

              <BoardColumn
                title="Esperando cliente"
                description="La empresa ya respondió y espera datos del cliente."
                count={waitingCustomerInquiries.length}
                tone="brand"
              >
                {waitingCustomerInquiries.length === 0 ? (
                  <EmptyColumnState>
                    {hasActiveFilters
                      ? "No hay casos esperando al cliente con estos filtros."
                      : "No hay casos esperando al cliente."}
                  </EmptyColumnState>
                ) : (
                  waitingCustomerInquiries.map((inquiry) => (
                    <CaseBoardCard
                      key={inquiry.id}
                      inquiry={inquiry}
                      openInquiry={openInquiry}
                    />
                  ))
                )}
              </BoardColumn>
            </div>
          </section>

          <SectionCard
            title="Historial de casos"
            description={
              historyInquiries.length > 0
                ? `${historyInquiries.length} caso${
                    historyInquiries.length === 1 ? "" : "s"
                  } respondido${historyInquiries.length === 1 ? "" : "s"}, cerrado${
                    historyInquiries.length === 1 ? "" : "s"
                  } o descartado${historyInquiries.length === 1 ? "" : "s"}.`
                : "Casos respondidos, cerrados o descartados aparecerán aquí."
            }
            className="mt-8"
          >
            {historyInquiries.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
                {hasActiveFilters
                  ? "No hay casos de historial que coincidan con los filtros actuales."
                  : "Todavía no hay casos en el historial."}
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="hidden grid-cols-[1fr_1.5fr_0.9fr_0.9fr_0.8fr] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
                  <div>Cliente</div>
                  <div>Resumen</div>
                  <div>Canal</div>
                  <div>Estado</div>
                  <div>Fecha</div>
                </div>

                <div className="divide-y divide-slate-100">
                  {historyInquiries.map((inquiry) => (
                    <HistoryInquiryRow
                      key={inquiry.id}
                      inquiry={inquiry}
                      openInquiry={openInquiry}
                    />
                  ))}
                </div>
              </div>
            )}
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
