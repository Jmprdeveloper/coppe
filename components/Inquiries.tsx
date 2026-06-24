"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ChevronRight,
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
import { actionStyles } from "../lib/visualSystem";

import { BoardColumn } from "./BoardColumn";
import { Button } from "./Button";
import { MetricCard } from "./MetricCard";
import { PageHeader } from "./PageHeader";
import { SectionCard } from "./SectionCard";

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
    <span className="inline-flex max-w-full items-center rounded-full border border-[#D2E4E8] bg-white px-2.5 py-1 text-xs font-semibold text-[#315F69] shadow-sm shadow-[#0F4C5C]/5">
      <span className="truncate">{label}</span>
    </span>
  );
}

function CaseBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center rounded-full border border-[#D2E4E8] bg-white px-2.5 py-1 text-xs font-semibold text-[#315F69] shadow-sm shadow-[#0F4C5C]/5">
      <span className="truncate">{children}</span>
    </span>
  );
}

function formatPriorityLabel(priority: string | null) {
  const normalizedPriority = normalizePriority(priority);

  if (normalizedPriority === "high") {
    return "Alta";
  }

  if (normalizedPriority === "medium") {
    return "Media";
  }

  return "Baja";
}

function formatCaseStatusLabel(status: string | null) {
  const normalizedStatus = normalizeInquiryStatus(status ?? "");

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

function formatCaseCategoryLabel(category: string | null) {
  const normalizedCategory = normalizeInquiryCategory(category);
  const categoryOption = inquiryCategoryOptions.find(
    (option) => option.value === normalizedCategory
  );

  return categoryOption?.label ?? normalizedCategory ?? "Sin categoría";
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

  if (status === "new") {
    return "border-[#B8D1D8] border-l-[#0F4C5C] ring-1 ring-[#D2E4E8]";
  }

  if (status === "pending") {
    return "border-[#9FC4CC] border-l-[#0B3F4C] ring-1 ring-[#C4DADF]";
  }

  if (status === "waiting_customer") {
    return "border-[#86B2BD] border-l-[#083640] ring-1 ring-[#B8D1D8]";
  }

  return "border-[#D2E4E8] border-l-[#8FB8C2]";
}

function CaseBoardCard({
  inquiry,
  openInquiry,
}: {
  inquiry: InquiryRow;
  openInquiry: (id: string) => void;
}) {
  return (
    <article
      className={`w-full rounded-2xl border border-l-4 bg-white p-4 text-left shadow-sm shadow-[#0F4C5C]/10 transition hover:border-[#8FB8C2] hover:bg-[#F7FBFC] hover:shadow-md ${getCaseCardAccentClassName(
        inquiry
      )}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <SourceChannelBadge channel={inquiry.source_channel} />

        <CaseBadge>{formatPriorityLabel(inquiry.ai_priority)}</CaseBadge>
        <CaseBadge>{formatCaseCategoryLabel(inquiry.ai_category)}</CaseBadge>
        <CaseBadge>{formatCaseStatusLabel(inquiry.status)}</CaseBadge>
      </div>

      <h3 className="mt-3 font-bold text-[#073540]">
        {inquiry.customer_name}
      </h3>

      <div className="mt-1 text-sm font-semibold text-[#153F48]">
        {inquiry.subject || "Sin asunto"}
      </div>

      <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#456C75]">
        {inquiry.ai_summary ||
          inquiry.original_message ||
          "Sin resumen disponible"}
      </p>

      <div className="mt-3 text-xs font-medium text-[#6B858C]">
        {formatDateTime(inquiry.created_at)}
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={() => openInquiry(inquiry.id)}
          className={actionStyles.openCase}
          title="Abrir caso"
        >
          Abrir caso
          <ChevronRight size={14} />
        </button>
      </div>
    </article>
  );
}

function EmptyColumnState({ children }: { children: string }) {
  return (
    <div className="rounded-2xl border border-[#D2E4E8] bg-white px-4 py-5 text-sm leading-6 text-[#456C75] shadow-sm shadow-[#0F4C5C]/5">
      {children}
    </div>
  );
}

function MetricCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="h-[116px] animate-pulse rounded-2xl border border-[#D2E4E8] bg-[#EAF5F7] shadow-sm shadow-[#0F4C5C]/5"
        />
      ))}
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
    <article className="grid w-full gap-3 px-4 py-4 text-left transition hover:bg-[#F7FBFC] md:grid-cols-[1fr_1.5fr_0.8fr_0.8fr_0.75fr_auto] md:items-center">
      <div className="min-w-0">
        <div className="truncate font-semibold text-[#073540]">
          {inquiry.customer_name}
        </div>

        <div className="mt-2 md:hidden">
          <SourceChannelBadge channel={inquiry.source_channel} />
        </div>
      </div>

      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-[#153F48]">
          {inquiry.subject || "Sin asunto"}
        </div>

        <div className="mt-1 line-clamp-1 text-xs text-[#6B858C]">
          {inquiry.ai_summary ||
            inquiry.original_message ||
            "Sin resumen disponible"}
        </div>
      </div>

      <div className="hidden md:block">
        <SourceChannelBadge channel={inquiry.source_channel} />
      </div>

      <div>
        <CaseBadge>{formatCaseStatusLabel(inquiry.status)}</CaseBadge>
      </div>

      <div className="text-xs text-[#6B858C]">
        {formatDateTime(inquiry.created_at)}
      </div>

      <div className="flex justify-start md:justify-end">
        <button
          type="button"
          onClick={() => openInquiry(inquiry.id)}
          className={actionStyles.openCase}
          title="Abrir caso"
        >
          Abrir caso
          <ChevronRight size={14} />
        </button>
      </div>
    </article>
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

      {isLoading ? (
        <MetricCardsSkeleton />
      ) : (
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
            tone="customer"
          />

          <MetricCard
            title="Alta prioridad"
            value={highPriorityActiveCount}
            caption="Casos activos marcados como urgentes"
            icon={AlertTriangle}
            tone={highPriorityActiveCount > 0 ? "danger" : "neutral"}
          />
        </div>
      )}

      <SectionCard
        title="Buscar y filtrar casos"
        description="Localiza casos por cliente, asunto, mensaje, canal, estado, prioridad o categoría."
        className="mb-5"
      >
        <div className="space-y-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 focus-within:border-[#0F4C5C] focus-within:bg-white">
              <Search size={16} className="shrink-0 text-[#8AA5AC]" />

              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleSearch();
                  }
                }}
                className="w-full bg-transparent text-sm text-[#153F48] outline-none placeholder:text-[#8AA5AC]"
                placeholder="Buscar por cliente, asunto, mensaje, categoría o canal..."
              />
            </div>

            <div className="flex gap-2">
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#B8D1D8] bg-white px-4 py-2 text-sm font-semibold text-[#315F69] shadow-sm shadow-[#0F4C5C]/5 transition hover:bg-[#F2FAFB] hover:text-[#0F4C5C]"
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
            <label className="text-xs font-semibold uppercase tracking-wide text-[#5C7780]">
              Estado
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="mt-1 w-full rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-sm font-normal normal-case text-[#153F48] outline-none transition focus:border-[#0F4C5C] focus:bg-white"
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

            <label className="text-xs font-semibold uppercase tracking-wide text-[#5C7780]">
              Prioridad
              <select
                value={priorityFilter}
                onChange={(event) => setPriorityFilter(event.target.value)}
                className="mt-1 w-full rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-sm font-normal normal-case text-[#153F48] outline-none transition focus:border-[#0F4C5C] focus:bg-white"
              >
                <option value="all">Todas</option>
                <option value="low">Baja</option>
                <option value="medium">Media</option>
                <option value="high">Alta</option>
              </select>
            </label>

            <label className="text-xs font-semibold uppercase tracking-wide text-[#5C7780]">
              Categoría
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="mt-1 w-full rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-sm font-normal normal-case text-[#153F48] outline-none transition focus:border-[#0F4C5C] focus:bg-white"
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

            <label className="text-xs font-semibold uppercase tracking-wide text-[#5C7780]">
              Canal
              <select
                value={sourceChannelFilter}
                onChange={(event) => setSourceChannelFilter(event.target.value)}
                className="mt-1 w-full rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-sm font-normal normal-case text-[#153F48] outline-none transition focus:border-[#0F4C5C] focus:bg-white"
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
        <div className="mb-5 rounded-2xl border border-[#6D9BA7] bg-[#F2FAFB] px-4 py-3 text-sm font-medium text-[#083640]">
          {errorMessage}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-2xl border border-[#D2E4E8] bg-white p-6 text-sm text-[#456C75] shadow-sm shadow-[#0F4C5C]/5">
          Cargando casos...
        </div>
      ) : null}

      {!isLoading && !errorMessage ? (
        <>
          <SectionCard
            title="Casos activos"
            description={
              hasActiveFilters
                ? `Mostrando ${activeFilteredCount} casos activos filtrados.`
                : "Casos que todavía requieren revisión, respuesta o seguimiento."
            }
            tone="brand"
            action={
              sourceChannelFilter !== "all" ? (
                <span className="inline-flex w-fit items-center rounded-full border border-[#B8D1D8] bg-white px-3 py-1 text-xs font-semibold text-[#315F69] shadow-sm shadow-[#0F4C5C]/5">
                  Canal: {formatSourceChannel(sourceChannelFilter)}
                </span>
              ) : (
                <span className="rounded-full border border-[#B8D1D8] bg-white px-3 py-1 text-xs font-semibold text-[#315F69] shadow-sm shadow-[#0F4C5C]/5">
                  {activeFilteredCount} activo
                  {activeFilteredCount === 1 ? "" : "s"}
                </span>
              )
            }
          >
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
                tone="customer"
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
          </SectionCard>

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
            tone="archived"
          >
            {historyInquiries.length === 0 ? (
              <div className="rounded-2xl border border-[#D2E4E8] bg-white p-6 text-sm text-[#456C75] shadow-sm shadow-[#0F4C5C]/5">
                {hasActiveFilters
                  ? "No hay casos de historial que coincidan con los filtros actuales."
                  : "Todavía no hay casos en el historial."}
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-[#D2E4E8] bg-white shadow-sm shadow-[#0F4C5C]/5">
                <div className="hidden grid-cols-[1fr_1.5fr_0.8fr_0.8fr_0.75fr_auto] gap-4 border-b border-[#D2E4E8] bg-[#F7FBFC] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#5C7780] md:grid">
                  <div>Cliente</div>
                  <div>Resumen</div>
                  <div>Canal</div>
                  <div>Estado</div>
                  <div>Fecha</div>
                  <div className="text-right">Acción</div>
                </div>

                <div className="divide-y divide-[#EAF5F7]">
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
