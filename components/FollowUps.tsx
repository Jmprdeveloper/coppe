"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  History,
  Plus,
  Search,
  X,
} from "lucide-react";

import {
  formatFollowUpDueAt,
  normalizeFollowUpStatus,
  resolveFollowUpUrgency,
} from "../lib/followUpUtils";
import { normalizeInquiryStatus } from "../lib/inquiryUtils";
import { createClient } from "../lib/supabase/client";
import type { VisualTone } from "../lib/visualSystem";
import type { FollowUp } from "../types";

import { BoardColumn } from "./BoardColumn";
import { Button } from "./Button";
import { FollowUpCard } from "./FollowUpCard";
import { MetricCard } from "./MetricCard";
import { PageHeader } from "./PageHeader";
import { SectionCard } from "./SectionCard";

type FollowUpsProps = {
  openInquiry: (id: string) => void;
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

type InquiryOptionRow = {
  id: string;
  company_id: string;
  customer_id: string | null;
  customer_name: string;
  subject: string | null;
  status: string;
};

type FollowUpColumnTone = "overdue" | "today" | "upcoming";

type FollowUpColumnProps = {
  title: string;
  description: string;
  count: number;
  tone: FollowUpColumnTone;
  followUps: FollowUp[];
  emptyMessage: string;
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

function getDefaultDateTimeLocal() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatDateTimeLocalFromIso(value: string | null) {
  if (!value) {
    return getDefaultDateTimeLocal();
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return getDefaultDateTimeLocal();
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function normalizeSearchText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getFollowUpTime(followUp: FollowUp) {
  if (!followUp.dueAtIso) {
    return Number.MAX_SAFE_INTEGER;
  }

  const timestamp = new Date(followUp.dueAtIso).getTime();

  if (Number.isNaN(timestamp)) {
    return Number.MAX_SAFE_INTEGER;
  }

  return timestamp;
}

function compareFollowUps(first: FollowUp, second: FollowUp) {
  const timeDifference = getFollowUpTime(first) - getFollowUpTime(second);

  if (timeDifference !== 0) {
    return timeDifference;
  }

  return first.title.localeCompare(second.title);
}

function matchesFollowUpSearch(followUp: FollowUp, searchTerm: string) {
  const cleanSearchTerm = normalizeSearchText(searchTerm);

  if (!cleanSearchTerm) {
    return true;
  }

  const searchableContent = normalizeSearchText(
    [
      followUp.title,
      followUp.customerName,
      followUp.dueAt,
      followUp.status,
      followUp.urgency,
    ].join(" ")
  );

  return searchableContent.includes(cleanSearchTerm);
}

function isActiveInquiryOption(inquiry: InquiryOptionRow) {
  const status = normalizeInquiryStatus(inquiry.status);

  return (
    status === "new" ||
    status === "pending" ||
    status === "waiting_customer"
  );
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

function getColumnTone(tone: FollowUpColumnTone): VisualTone {
  if (tone === "overdue") {
    return "danger";
  }

  if (tone === "today") {
    return "warning";
  }

  return "info";
}

export function FollowUps({ openInquiry }: FollowUpsProps) {
  const supabase = useMemo(() => createClient(), []);

  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [inquiryOptions, setInquiryOptions] = useState<InquiryOptionRow[]>([]);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingFollowUpId, setEditingFollowUpId] = useState<string | null>(
    null
  );
  const [selectedInquiryId, setSelectedInquiryId] = useState("");
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState(getDefaultDateTimeLocal());
  const [searchTerm, setSearchTerm] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [updatingFollowUpId, setUpdatingFollowUpId] = useState<string | null>(
    null
  );

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [formErrorMessage, setFormErrorMessage] = useState("");

  useEffect(() => {
    async function loadFollowUpsAndInquiries() {
      setIsLoading(true);
      setErrorMessage("");
      setSuccessMessage("");
      setFormErrorMessage("");

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
        .order("due_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (followUpsError) {
        setErrorMessage(
          `No se pudieron cargar los seguimientos: ${
            followUpsError.message || "sin detalle del error"
          }`
        );
        setIsLoading(false);
        return;
      }

      const { data: inquiriesData, error: inquiriesError } = await supabase
        .from("inquiries")
        .select("id, company_id, customer_id, customer_name, subject, status")
        .order("created_at", { ascending: false });

      if (inquiriesError) {
        setErrorMessage(
          `No se pudieron cargar los casos para crear seguimientos: ${
            inquiriesError.message || "sin detalle del error"
          }`
        );
        setIsLoading(false);
        return;
      }

      const mappedFollowUps = (
        (followUpsData ?? []) as unknown as FollowUpRow[]
      )
        .map(mapFollowUpRowToFollowUp)
        .sort(compareFollowUps);

      const mappedInquiries = (inquiriesData ??
        []) as unknown as InquiryOptionRow[];

      const activeInquiryOptions = mappedInquiries.filter(isActiveInquiryOption);

      setFollowUps(mappedFollowUps);
      setInquiryOptions(activeInquiryOptions);

      setSelectedInquiryId((currentValue) => {
        if (
          currentValue &&
          activeInquiryOptions.some((inquiry) => inquiry.id === currentValue)
        ) {
          return currentValue;
        }

        return activeInquiryOptions[0]?.id ?? "";
      });

      setIsLoading(false);
    }

    loadFollowUpsAndInquiries();
  }, [supabase]);

  const selectedInquiry = inquiryOptions.find(
    (inquiry) => inquiry.id === selectedInquiryId
  );

  const editingFollowUp = followUps.find(
    (followUp) => followUp.id === editingFollowUpId
  );

  const isEditing = Boolean(editingFollowUp);

  const handleOpenCreateForm = () => {
    setEditingFollowUpId(null);
    setShowCreateForm(true);
    setSuccessMessage("");
    setFormErrorMessage("");

    if (selectedInquiry) {
      setTitle(`Revisar caso de ${selectedInquiry.customer_name}`);
    } else {
      setTitle("");
    }

    setDueAt(getDefaultDateTimeLocal());
  };

  const handleOpenEditForm = (followUp: FollowUp) => {
    setEditingFollowUpId(followUp.id);
    setShowCreateForm(true);
    setSuccessMessage("");
    setFormErrorMessage("");
    setSelectedInquiryId(followUp.inquiryId);
    setTitle(followUp.title);
    setDueAt(formatDateTimeLocalFromIso(followUp.dueAtIso));
  };

  const handleCancelCreateForm = () => {
    setShowCreateForm(false);
    setEditingFollowUpId(null);
    setFormErrorMessage("");
  };

  const handleClearSearch = () => {
    setSearchTerm("");
  };

  const handleSaveFollowUp = async () => {
    setSuccessMessage("");
    setFormErrorMessage("");

    const cleanTitle = title.trim();

    if (!cleanTitle) {
      setFormErrorMessage("El título del seguimiento es obligatorio.");
      return;
    }

    if (!dueAt) {
      setFormErrorMessage("La fecha y hora del seguimiento son obligatorias.");
      return;
    }

    const dueDate = new Date(dueAt);

    if (Number.isNaN(dueDate.getTime())) {
      setFormErrorMessage("La fecha indicada no es válida.");
      return;
    }

    const dueAtIso = dueDate.toISOString();

    if (editingFollowUp) {
      setIsCreating(true);

      const { data, error } = await supabase
        .from("follow_ups")
        .update({
          title: cleanTitle,
          due_at: dueAtIso,
          urgency: resolveFollowUpUrgency(
            dueAtIso,
            editingFollowUp.status,
            null
          ),
        })
        .eq("id", editingFollowUp.id)
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

      setIsCreating(false);

      if (error || !data) {
        setFormErrorMessage(
          `No se pudo actualizar el seguimiento: ${
            error?.message || "sin detalle del error"
          }`
        );
        return;
      }

      const mappedFollowUp = mapFollowUpRowToFollowUp(data);

      setFollowUps((currentFollowUps) =>
        currentFollowUps
          .map((followUp) =>
            followUp.id === editingFollowUp.id ? mappedFollowUp : followUp
          )
          .sort(compareFollowUps)
      );

      setEditingFollowUpId(null);
      setShowCreateForm(false);
      setTitle("");
      setDueAt(getDefaultDateTimeLocal());
      setSuccessMessage("Seguimiento actualizado correctamente.");
      return;
    }

    if (!selectedInquiry) {
      setFormErrorMessage("Selecciona un caso antes de crear el seguimiento.");
      return;
    }

    setIsCreating(true);

    const { data, error } = await supabase
      .from("follow_ups")
      .insert({
        company_id: selectedInquiry.company_id,
        customer_id: selectedInquiry.customer_id,
        inquiry_id: selectedInquiry.id,
        title: cleanTitle,
        due_at: dueAtIso,
        status: "pending",
        urgency: resolveFollowUpUrgency(dueAtIso, "pending", null),
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

    setIsCreating(false);

    if (error || !data) {
      setFormErrorMessage(
        `No se pudo crear el seguimiento: ${
          error?.message || "sin detalle del error"
        }`
      );
      return;
    }

    setFollowUps((currentFollowUps) =>
      [mapFollowUpRowToFollowUp(data), ...currentFollowUps].sort(
        compareFollowUps
      )
    );

    setTitle(`Revisar caso de ${selectedInquiry.customer_name}`);
    setDueAt(getDefaultDateTimeLocal());
    setShowCreateForm(false);
    setSuccessMessage("Seguimiento creado correctamente.");
  };

  const handleUpdateFollowUpStatus = async (
    followUpId: string,
    status: "pending" | "completed" | "cancelled"
  ) => {
    setErrorMessage("");
    setSuccessMessage("");
    setFormErrorMessage("");
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
      setErrorMessage(
        `No se pudo actualizar el seguimiento: ${
          error?.message || "sin detalle del error"
        }`
      );
      return;
    }

    const mappedUpdatedFollowUp = mapFollowUpRowToFollowUp(updatedFollowUp);

    setFollowUps((currentFollowUps) =>
      currentFollowUps
        .map((followUp) =>
          followUp.id === followUpId ? mappedUpdatedFollowUp : followUp
        )
        .sort(compareFollowUps)
    );

    if (status === "pending") {
      setSuccessMessage("Seguimiento reabierto correctamente.");
      return;
    }

    setSuccessMessage(
      status === "completed"
        ? "Seguimiento completado correctamente."
        : "Seguimiento cancelado correctamente."
    );
  };

  const filteredFollowUps = followUps.filter((followUp) =>
    matchesFollowUpSearch(followUp, searchTerm)
  );

  const pendingFollowUps = filteredFollowUps.filter(
    (followUp) => followUp.status === "pending"
  );

  const historyFollowUps = filteredFollowUps.filter(
    (followUp) =>
      followUp.status === "completed" || followUp.status === "cancelled"
  );

  const overdue = pendingFollowUps.filter(
    (followUp) => followUp.urgency === "overdue"
  );

  const today = pendingFollowUps.filter(
    (followUp) => followUp.urgency === "today"
  );

  const upcoming = pendingFollowUps.filter(
    (followUp) => followUp.urgency === "upcoming"
  );

  const allPendingFollowUps = followUps.filter(
    (followUp) => followUp.status === "pending"
  );

  const allOverdueCount = allPendingFollowUps.filter(
    (followUp) => followUp.urgency === "overdue"
  ).length;

  const allTodayCount = allPendingFollowUps.filter(
    (followUp) => followUp.urgency === "today"
  ).length;

  const allUpcomingCount = allPendingFollowUps.filter(
    (followUp) => followUp.urgency === "upcoming"
  ).length;

  const allHistoryCount = followUps.filter(
    (followUp) =>
      followUp.status === "completed" || followUp.status === "cancelled"
  ).length;

  const hasActiveSearch = searchTerm.trim().length > 0;

  const renderFollowUpColumn = ({
    title,
    description,
    count,
    tone,
    followUps: columnFollowUps,
    emptyMessage,
  }: FollowUpColumnProps) => (
    <BoardColumn
      title={title}
      description={description}
      count={count}
      tone={getColumnTone(tone)}
    >
      {columnFollowUps.length === 0 ? (
        <div className="rounded-2xl bg-white/80 px-4 py-5 text-sm text-slate-600 shadow-sm">
          {emptyMessage}
        </div>
      ) : (
        columnFollowUps.map((followUp) => (
          <FollowUpCard
            key={followUp.id}
            followUp={followUp}
            onOpen={openInquiry}
            onEdit={handleOpenEditForm}
            onComplete={(id) => handleUpdateFollowUpStatus(id, "completed")}
            onCancel={(id) => handleUpdateFollowUpStatus(id, "cancelled")}
            isUpdating={updatingFollowUpId === followUp.id}
          />
        ))
      )}
    </BoardColumn>
  );

  return (
    <div>
      <PageHeader
        title="Seguimientos"
        description="Tareas operativas para no olvidar casos importantes, respuestas pendientes o revisiones internas."
        action={
          <Button onClick={handleOpenCreateForm}>
            <Plus size={16} /> Crear seguimiento
          </Button>
        }
      />

      <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Vencidos"
          value={allOverdueCount}
          caption="Tareas pendientes fuera de plazo"
          tone="danger"
          icon={AlertTriangle}
        />

        <MetricCard
          title="Hoy"
          value={allTodayCount}
          caption="Tareas programadas para hoy"
          tone="warning"
          icon={Clock3}
        />

        <MetricCard
          title="Próximos"
          value={allUpcomingCount}
          caption="Pendientes con fecha futura"
          tone="info"
          icon={CalendarDays}
        />

        <MetricCard
          title="Historial"
          value={allHistoryCount}
          caption="Completados o cancelados"
          tone="neutral"
          icon={History}
        />
      </div>

      <SectionCard className="mb-5">
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <label className="text-sm font-medium text-slate-700">
            Buscar seguimiento
            <div className="mt-1 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <Search size={16} className="shrink-0 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                placeholder="Buscar por título, cliente, fecha o estado..."
              />
            </div>
          </label>

          <Button
            variant="secondary"
            onClick={handleClearSearch}
            disabled={!hasActiveSearch}
          >
            Limpiar búsqueda
          </Button>
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Mostrando {filteredFollowUps.length} de {followUps.length}{" "}
          seguimientos.
        </p>
      </SectionCard>

      {showCreateForm ? (
        <SectionCard
          className="mb-5"
          title={isEditing ? "Editar seguimiento" : "Crear seguimiento"}
          description={
            isEditing
              ? "Actualiza el título o la fecha de este seguimiento."
              : "Asocia una tarea pendiente a un caso existente."
          }
          action={
            <button
              type="button"
              onClick={handleCancelCreateForm}
              className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="Cerrar formulario"
            >
              <X size={18} />
            </button>
          }
        >
          <div className="grid gap-4 md:grid-cols-2">
            {isEditing ? (
              <div className="text-sm font-medium text-slate-700 md:col-span-2">
                Caso asociado
                <div className="mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-600">
                  {editingFollowUp?.customerName || "Cliente no indicado"}
                </div>
              </div>
            ) : (
              <label className="text-sm font-medium text-slate-700 md:col-span-2">
                Caso asociado
                <select
                  value={selectedInquiryId}
                  onChange={(event) => {
                    const nextInquiryId = event.target.value;
                    const nextInquiry = inquiryOptions.find(
                      (inquiry) => inquiry.id === nextInquiryId
                    );

                    setSelectedInquiryId(nextInquiryId);

                    if (nextInquiry) {
                      setTitle(`Revisar caso de ${nextInquiry.customer_name}`);
                    }
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                >
                  {inquiryOptions.length === 0 ? (
                    <option value="">No hay casos activos disponibles</option>
                  ) : (
                    inquiryOptions.map((inquiry) => (
                      <option key={inquiry.id} value={inquiry.id}>
                        {inquiry.customer_name} ·{" "}
                        {inquiry.subject || "Sin asunto"} ·{" "}
                        {formatInquiryStatus(inquiry.status)}
                      </option>
                    ))
                  )}
                </select>
              </label>
            )}

            <label className="text-sm font-medium text-slate-700">
              Título
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Fecha y hora
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
              />
            </label>
          </div>

          {formErrorMessage ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formErrorMessage}
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              onClick={handleSaveFollowUp}
              disabled={
                isCreating || (!isEditing && inquiryOptions.length === 0)
              }
            >
              {isCreating
                ? isEditing
                  ? "Guardando cambios..."
                  : "Creando seguimiento..."
                : isEditing
                  ? "Guardar cambios"
                  : "Guardar seguimiento"}
            </Button>

            <Button variant="secondary" onClick={handleCancelCreateForm}>
              Cancelar
            </Button>
          </div>
        </SectionCard>
      ) : null}

      {errorMessage ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          Cargando seguimientos...
        </div>
      ) : null}

      {!isLoading && !errorMessage ? (
        <>
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Tareas activas
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Seguimientos pendientes organizados por urgencia.
                </p>
              </div>

              <div className="text-xs font-semibold text-slate-500">
                {pendingFollowUps.length} pendiente
                {pendingFollowUps.length === 1 ? "" : "s"}
              </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-3">
              {renderFollowUpColumn({
                title: "Vencidos",
                description: "Requieren revisión inmediata.",
                count: overdue.length,
                tone: "overdue",
                followUps: overdue,
                emptyMessage: "No hay seguimientos vencidos.",
              })}

              {renderFollowUpColumn({
                title: "Hoy",
                description: "Tareas previstas para el día actual.",
                count: today.length,
                tone: "today",
                followUps: today,
                emptyMessage: "No hay seguimientos para hoy.",
              })}

              {renderFollowUpColumn({
                title: "Próximos",
                description: "Pendientes programados para más adelante.",
                count: upcoming.length,
                tone: "upcoming",
                followUps: upcoming,
                emptyMessage: "No hay seguimientos próximos.",
              })}
            </div>
          </section>

          <section className="mt-8">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Historial</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Seguimientos completados o cancelados.
                </p>
              </div>

              <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500">
                {historyFollowUps.length}
              </div>
            </div>

            {historyFollowUps.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
                Todavía no hay seguimientos completados o cancelados.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {historyFollowUps.map((followUp) => {
                  const completed = followUp.status === "completed";

                  return (
                    <article
                      key={followUp.id}
                      className="grid gap-3 px-4 py-4 md:grid-cols-[160px_1fr_220px_auto] md:items-center"
                    >
                      <div>
                        <span
                          className={
                            completed
                              ? "rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"
                              : "rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600"
                          }
                        >
                          {completed ? "Completado" : "Cancelado"}
                        </span>
                        <div className="mt-2 text-xs text-slate-500">
                          {followUp.dueAt}
                        </div>
                      </div>

                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-bold text-slate-950">
                          {followUp.title}
                        </h3>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {followUp.customerName}
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        {followUp.inquiryId
                          ? "Caso asociado disponible"
                          : "Sin caso asociado"}
                      </div>

                      <div className="flex flex-wrap gap-2 md:justify-end">
                        {followUp.inquiryId ? (
                          <button
                            type="button"
                            onClick={() => openInquiry(followUp.inquiryId)}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                          >
                            Abrir caso
                          </button>
                        ) : null}

                        <button
                          type="button"
                          disabled={updatingFollowUpId === followUp.id}
                          onClick={() =>
                            handleUpdateFollowUpStatus(followUp.id, "pending")
                          }
                          className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <CheckCircle2 size={14} />
                          Reabrir
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
