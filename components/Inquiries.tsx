"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";

import {
  formatDateTime,
  normalizeInquiryCategory,
  normalizeInquiryStatus,
  normalizePriority,
} from "../lib/inquiryUtils";
import { inquiryCategoryOptions } from "../lib/inquiryCategories";
import { normalizeSearchText } from "../lib/searchUtils";
import { createClient } from "../lib/supabase/client";

import { Button } from "./Button";
import { CategoryBadge } from "./CategoryBadge";
import { PageHeader } from "./PageHeader";
import { PriorityBadge } from "./PriorityBadge";
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

export function Inquiries({ openInquiry, setActiveView }: InquiriesProps) {
  const supabase = useMemo(() => createClient(), []);

  const [inquiries, setInquiries] = useState<InquiryRow[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [appliedSearchTerm, setAppliedSearchTerm] = useState("");

  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

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
          `No se pudieron cargar las consultas: ${
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
  };

  const normalizedSearch = normalizeSearchText(appliedSearchTerm);

  const filteredInquiries = inquiries.filter((inquiry) => {
    const matchesSearch =
      !normalizedSearch ||
      normalizeSearchText(inquiry.customer_name).includes(normalizedSearch) ||
      normalizeSearchText(inquiry.subject).includes(normalizedSearch) ||
      normalizeSearchText(inquiry.original_message).includes(
        normalizedSearch
      ) ||
      normalizeSearchText(inquiry.ai_summary).includes(normalizedSearch) ||
      normalizeSearchText(inquiry.ai_category).includes(normalizedSearch);

    const matchesStatus =
      statusFilter === "all" || inquiry.status === statusFilter;

    const matchesPriority =
      priorityFilter === "all" || inquiry.ai_priority === priorityFilter;

    const matchesCategory =
      categoryFilter === "all" ||
      normalizeInquiryCategory(inquiry.ai_category) === categoryFilter;

    return matchesSearch && matchesStatus && matchesPriority && matchesCategory;
  });

  const hasActiveFilters =
    appliedSearchTerm.trim().length > 0 ||
    statusFilter !== "all" ||
    priorityFilter !== "all" ||
    categoryFilter !== "all";

  return (
    <div>
      <PageHeader
        title="Consultas"
        description="Todas las consultas recibidas, clasificadas por estado, prioridad y categoría."
        action={
          <Button onClick={() => setActiveView("InquiryForm")}>
            <Plus size={16} /> Nueva consulta
          </Button>
        }
      />

      <div className="mb-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
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
              placeholder="Buscar por cliente, asunto, mensaje o categoría..."
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

        <div className="grid gap-2 md:grid-cols-3">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Estado
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal normal-case text-slate-700 outline-none focus:border-[#0F4C5C]"
            >
              <option value="all">Todos</option>
              <option value="new">Nuevo</option>
              <option value="pending">Pendiente</option>
              <option value="replied">Respondida</option>
              <option value="closed">Cerrada</option>
              <option value="discarded">Descartada</option>
            </select>
          </label>

          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Prioridad
            <select
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal normal-case text-slate-700 outline-none focus:border-[#0F4C5C]"
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
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal normal-case text-slate-700 outline-none focus:border-[#0F4C5C]"
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
        </div>
      </div>

      {hasActiveFilters ? (
        <div className="mb-4 text-sm text-slate-500">
          Mostrando {filteredInquiries.length} resultado
          {filteredInquiries.length === 1 ? "" : "s"} con los filtros actuales.
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          Cargando consultas desde Supabase...
        </div>
      ) : null}

      {!isLoading && !errorMessage && filteredInquiries.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          No hay consultas que coincidan con los filtros actuales.
        </div>
      ) : null}

      {!isLoading && !errorMessage && filteredInquiries.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="hidden grid-cols-[1.1fr_2fr_1fr_1fr_1fr_0.8fr] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
            <div>Cliente</div>
            <div>Resumen</div>
            <div>Categoría</div>
            <div>Prioridad</div>
            <div>Estado</div>
            <div>Fecha</div>
          </div>

          <div className="divide-y divide-slate-100">
            {filteredInquiries.map((inquiry) => (
              <button
                key={inquiry.id}
                onClick={() => openInquiry(inquiry.id)}
                className="grid w-full gap-3 px-4 py-4 text-left transition hover:bg-slate-50 md:grid-cols-[1.1fr_2fr_1fr_1fr_1fr_0.8fr] md:items-center"
              >
                <div>
                  <div className="font-semibold text-slate-950">
                    {inquiry.customer_name}
                  </div>

                  <div className="mt-1 text-xs text-slate-500 md:hidden">
                    {formatDateTime(inquiry.created_at)}
                  </div>
                </div>

                <div>
                  <div className="font-medium text-slate-800">
                    {inquiry.subject || "Sin asunto"}
                  </div>

                  <div className="mt-1 line-clamp-2 text-sm text-slate-600">
                    {inquiry.ai_summary ||
                      inquiry.original_message ||
                      "Sin resumen disponible"}
                  </div>
                </div>

                <div>
                  <CategoryBadge
                    category={normalizeInquiryCategory(inquiry.ai_category)}
                  />
                </div>

                <div>
                  <PriorityBadge
                    priority={normalizePriority(inquiry.ai_priority)}
                  />
                </div>

                <div>
                  <StatusBadge status={normalizeInquiryStatus(inquiry.status)} />
                </div>

                <div className="hidden text-xs text-slate-500 md:block">
                  {formatDateTime(inquiry.created_at)}
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}