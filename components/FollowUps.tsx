"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";

import {
  formatFollowUpDueAt,
  normalizeFollowUpStatus,
  resolveFollowUpUrgency,
} from "../lib/followUpUtils";
import { createClient } from "../lib/supabase/client";
import type { FollowUp } from "../types";

import { Button } from "./Button";
import { FollowUpCard } from "./FollowUpCard";
import { PageHeader } from "./PageHeader";

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
          `No se pudieron cargar las consultas para crear seguimientos: ${
            inquiriesError.message || "sin detalle del error"
          }`
        );
        setIsLoading(false);
        return;
      }

      const mappedFollowUps = (
        (followUpsData ?? []) as unknown as FollowUpRow[]
      ).map(mapFollowUpRowToFollowUp);

      const mappedInquiries = (inquiriesData ??
        []) as unknown as InquiryOptionRow[];

      const activeInquiryOptions = mappedInquiries.filter(
        (inquiry) => inquiry.status === "new" || inquiry.status === "pending"
      );

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
      setTitle(`Revisar consulta de ${selectedInquiry.customer_name}`);
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
        currentFollowUps.map((followUp) =>
          followUp.id === editingFollowUp.id ? mappedFollowUp : followUp
        )
      );

      setEditingFollowUpId(null);
      setShowCreateForm(false);
      setTitle("");
      setDueAt(getDefaultDateTimeLocal());
      setSuccessMessage("Seguimiento actualizado correctamente.");
      return;
    }

    if (!selectedInquiry) {
      setFormErrorMessage("Selecciona una consulta antes de crear el seguimiento.");
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

    setFollowUps((currentFollowUps) => [
      mapFollowUpRowToFollowUp(data),
      ...currentFollowUps,
    ]);

    setTitle(`Revisar consulta de ${selectedInquiry.customer_name}`);
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
      currentFollowUps.map((followUp) =>
        followUp.id === followUpId ? mappedUpdatedFollowUp : followUp
      )
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

  const pendingFollowUps = followUps.filter(
    (followUp) => followUp.status === "pending"
  );

  const historyFollowUps = followUps.filter(
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

  return (
    <div>
      <PageHeader
        title="Seguimientos"
        description="Tareas pendientes para no olvidar consultas importantes."
        action={
          <Button onClick={handleOpenCreateForm}>
            <Plus size={16} /> Crear seguimiento
          </Button>
        }
      />

      {showCreateForm ? (
        <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                {isEditing ? "Editar seguimiento" : "Crear seguimiento"}
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                {isEditing
                  ? "Actualiza el título o la fecha de este seguimiento."
                  : "Asocia una tarea pendiente a una consulta existente."}
              </p>
            </div>

            <button
              type="button"
              onClick={handleCancelCreateForm}
              className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="Cerrar formulario"
            >
              <X size={18} />
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {isEditing ? (
              <div className="text-sm font-medium text-slate-700 md:col-span-2">
                Consulta asociada
                <div className="mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-600">
                  {editingFollowUp?.customerName || "Cliente no indicado"}
                </div>
              </div>
            ) : (
              <label className="text-sm font-medium text-slate-700 md:col-span-2">
                Consulta asociada
                <select
                  value={selectedInquiryId}
                  onChange={(event) => {
                    const nextInquiryId = event.target.value;
                    const nextInquiry = inquiryOptions.find(
                      (inquiry) => inquiry.id === nextInquiryId
                    );

                    setSelectedInquiryId(nextInquiryId);

                    if (nextInquiry) {
                      setTitle(`Revisar consulta de ${nextInquiry.customer_name}`);
                    }
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                >
                  {inquiryOptions.length === 0 ? (
                    <option value="">No hay consultas activas disponibles</option>
                  ) : (
                    inquiryOptions.map((inquiry) => (
                      <option key={inquiry.id} value={inquiry.id}>
                        {inquiry.customer_name} · {inquiry.subject || "Sin asunto"}
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
              disabled={isCreating || (!isEditing && inquiryOptions.length === 0)}
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
        </div>
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
          Cargando seguimientos desde Supabase...
        </div>
      ) : null}

      {!isLoading && !errorMessage ? (
        <div className="grid gap-6 xl:grid-cols-3">
          <section>
            <h2 className="mb-3 text-lg font-bold text-slate-950">Vencidos</h2>

            {overdue.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
                No hay seguimientos vencidos.
              </div>
            ) : (
              <div className="space-y-3">
                {overdue.map((followUp) => (
                  <FollowUpCard
                    key={followUp.id}
                    followUp={followUp}
                    onOpen={openInquiry}
                    onEdit={handleOpenEditForm}
                    onComplete={(id) =>
                      handleUpdateFollowUpStatus(id, "completed")
                    }
                    onCancel={(id) =>
                      handleUpdateFollowUpStatus(id, "cancelled")
                    }
                    isUpdating={updatingFollowUpId === followUp.id}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-slate-950">Hoy</h2>

            {today.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
                No hay seguimientos para hoy.
              </div>
            ) : (
              <div className="space-y-3">
                {today.map((followUp) => (
                  <FollowUpCard
                    key={followUp.id}
                    followUp={followUp}
                    onOpen={openInquiry}
                    onEdit={handleOpenEditForm}
                    onComplete={(id) =>
                      handleUpdateFollowUpStatus(id, "completed")
                    }
                    onCancel={(id) =>
                      handleUpdateFollowUpStatus(id, "cancelled")
                    }
                    isUpdating={updatingFollowUpId === followUp.id}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-slate-950">Próximos</h2>

            {upcoming.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
                No hay seguimientos próximos.
              </div>
            ) : (
              <div className="space-y-3">
                {upcoming.map((followUp) => (
                  <FollowUpCard
                    key={followUp.id}
                    followUp={followUp}
                    onOpen={openInquiry}
                    onEdit={handleOpenEditForm}
                    onComplete={(id) =>
                      handleUpdateFollowUpStatus(id, "completed")
                    }
                    onCancel={(id) =>
                      handleUpdateFollowUpStatus(id, "cancelled")
                    }
                    isUpdating={updatingFollowUpId === followUp.id}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}

      {!isLoading && !errorMessage ? (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold text-slate-950">Historial</h2>

          {historyFollowUps.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
              Todavía no hay seguimientos completados o cancelados.
            </div>
          ) : (
            <div className="space-y-3">
              {historyFollowUps.map((followUp) => (
                <FollowUpCard
                  key={followUp.id}
                  followUp={followUp}
                  onOpen={openInquiry}
                  onEdit={handleOpenEditForm}
                  onReopen={(id) => handleUpdateFollowUpStatus(id, "pending")}
                  isUpdating={updatingFollowUpId === followUp.id}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}