"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, XCircle } from "lucide-react";

import {
  formatFollowUpDueAt,
  normalizeFollowUpStatus,
  resolveFollowUpUrgency,
} from "../lib/followUpUtils";
import {
  formatDateTime,
  mapInquiryRowToInquiry,
  type InquiryRow,
} from "../lib/inquiryUtils";
import { createClient } from "../lib/supabase/client";
import type { FollowUp, Inquiry, InquiryStatus } from "../types";

import { AIBlock } from "./AIBlock";
import { Button } from "./Button";
import { CategoryBadge } from "./CategoryBadge";
import { FollowUpCard } from "./FollowUpCard";
import { PriorityBadge } from "./PriorityBadge";
import { ResponseEditor } from "./ResponseEditor";
import { StatusBadge } from "./StatusBadge";

type InquiryDetailProps = {
  inquiryId: string;
  setActiveView: (view: string) => void;
};

type InquiryDetailRow = InquiryRow & {
  company_id: string;
};

type CustomerRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

type InternalNoteRow = {
  id: string;
  body: string;
  created_at: string;
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

function mapFollowUpRowToFollowUp(row: FollowUpRow): FollowUp {
  const status = normalizeFollowUpStatus(row.status);
  const urgency = resolveFollowUpUrgency(row.due_at, status, row.urgency);

  return {
    id: row.id,
    title: row.title,
    customerName: row.customer?.name || "Cliente no indicado",
    inquiryId: row.inquiry_id ?? "",
    dueAt: formatFollowUpDueAt(row.due_at, urgency),
    status,
    urgency,
  };
}

function getDefaultFollowUpDateTimeLocal() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function InquiryDetail({
  inquiryId,
  setActiveView,
}: InquiryDetailProps) {
  const supabase = useMemo(() => createClient(), []);

  const [inquiry, setInquiry] = useState<Inquiry | null>(null);
  const [rawInquiry, setRawInquiry] = useState<InquiryDetailRow | null>(null);
  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [notes, setNotes] = useState<InternalNoteRow[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [note, setNote] = useState("");
  const [followUpTitle, setFollowUpTitle] = useState("");
  const [followUpDueAt, setFollowUpDueAt] = useState(
    getDefaultFollowUpDateTimeLocal()
  );

  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isCreatingFollowUp, setIsCreatingFollowUp] = useState(false);
  const [updatingFollowUpId, setUpdatingFollowUpId] = useState<string | null>(
    null
  );

  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [statusErrorMessage, setStatusErrorMessage] = useState("");
  const [noteMessage, setNoteMessage] = useState("");
  const [noteErrorMessage, setNoteErrorMessage] = useState("");
  const [followUpMessage, setFollowUpMessage] = useState("");
  const [followUpErrorMessage, setFollowUpErrorMessage] = useState("");

  useEffect(() => {
    async function loadInquiry() {
      setIsLoading(true);
      setErrorMessage("");
      setStatusMessage("");
      setStatusErrorMessage("");
      setNoteMessage("");
      setNoteErrorMessage("");
      setFollowUpMessage("");
      setFollowUpErrorMessage("");
      setInquiry(null);
      setRawInquiry(null);
      setCustomer(null);
      setNotes([]);
      setFollowUps([]);
      setNote("");
      setFollowUpTitle("");
      setFollowUpDueAt(getDefaultFollowUpDateTimeLocal());

      const { data: inquiryData, error: inquiryError } = await supabase
        .from("inquiries")
        .select(
          [
            "id",
            "company_id",
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
        .eq("id", inquiryId)
        .maybeSingle<InquiryDetailRow>();

      if (inquiryError) {
        setErrorMessage(
          `No se pudo cargar la consulta: ${
            inquiryError.message || "sin detalle del error"
          }`
        );
        setIsLoading(false);
        return;
      }

      if (!inquiryData) {
        setErrorMessage(
          "No se encontró esta consulta o no pertenece a tu empresa."
        );
        setIsLoading(false);
        return;
      }

      setInquiry(mapInquiryRowToInquiry(inquiryData));
      setRawInquiry(inquiryData);
      setFollowUpTitle(`Revisar consulta de ${inquiryData.customer_name}`);
      setFollowUpDueAt(getDefaultFollowUpDateTimeLocal());

      if (inquiryData.customer_id) {
        const { data: customerData, error: customerError } = await supabase
          .from("customers")
          .select("id, name, email, phone")
          .eq("id", inquiryData.customer_id)
          .maybeSingle<CustomerRow>();

        if (!customerError && customerData) {
          setCustomer(customerData);
        }
      }

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
        .eq("inquiry_id", inquiryData.id)
        .order("due_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (followUpsError) {
        setErrorMessage(
          `Se cargó la consulta, pero no se pudieron cargar sus seguimientos: ${
            followUpsError.message || "sin detalle del error"
          }`
        );
        setIsLoading(false);
        return;
      }

      const { data: notesData, error: notesError } = await supabase
        .from("internal_notes")
        .select("id, body, created_at")
        .eq("inquiry_id", inquiryData.id)
        .order("created_at", { ascending: false });

      if (notesError) {
        setErrorMessage(
          `Se cargó la consulta, pero no se pudieron cargar sus notas: ${
            notesError.message || "sin detalle del error"
          }`
        );
        setIsLoading(false);
        return;
      }

      setFollowUps(
        ((followUpsData ?? []) as unknown as FollowUpRow[]).map(
          mapFollowUpRowToFollowUp
        )
      );
      setNotes((notesData ?? []) as InternalNoteRow[]);
      setIsLoading(false);
    }

    loadInquiry();
  }, [inquiryId, supabase]);

  const handleUpdateStatus = async (
    newStatus: InquiryStatus
  ): Promise<boolean> => {
    if (!inquiry) {
      return false;
    }

    setStatusMessage("");
    setStatusErrorMessage("");

    if (
      newStatus === "discarded" &&
      !window.confirm(
        "¿Seguro que quieres descartar esta consulta? No se eliminará del historial, pero dejará de tratarse como pendiente."
      )
    ) {
      return false;
    }

    if (
      newStatus === "pending" &&
      (inquiry.status === "replied" ||
        inquiry.status === "closed" ||
        inquiry.status === "discarded") &&
      !window.confirm(
        "¿Seguro que quieres reabrir esta consulta? Volverá a tratarse como pendiente."
      )
    ) {
      return false;
    }

    setIsUpdatingStatus(true);

    const { error } = await supabase
      .from("inquiries")
      .update({
        status: newStatus,
      })
      .eq("id", inquiry.id);

    setIsUpdatingStatus(false);

    if (error) {
      setStatusErrorMessage(
        `No se pudo actualizar el estado: ${
          error.message || "sin detalle del error"
        }`
      );
      return false;
    }

    setInquiry({
      ...inquiry,
      status: newStatus,
    });

    if (newStatus === "pending") {
      setStatusMessage("Consulta reabierta correctamente.");
      return true;
    }

    if (newStatus === "replied") {
      setStatusMessage("Consulta marcada como respondida.");
      return true;
    }

    if (newStatus === "closed") {
      setStatusMessage("Consulta cerrada correctamente.");
      return true;
    }

    if (newStatus === "discarded") {
      setStatusMessage("Consulta descartada correctamente.");
      return true;
    }

    setStatusMessage("Estado actualizado correctamente.");
    return true;
  };

  const handleSaveNote = async () => {
    setNoteMessage("");
    setNoteErrorMessage("");

    if (!rawInquiry) {
      setNoteErrorMessage(
        "No se puede guardar la nota porque no hay consulta cargada."
      );
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
        company_id: rawInquiry.company_id,
        customer_id: rawInquiry.customer_id,
        inquiry_id: rawInquiry.id,
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
    setNoteMessage("Nota interna guardada correctamente.");
  };

  const handleCreateFollowUp = async () => {
    setFollowUpMessage("");
    setFollowUpErrorMessage("");

    if (!rawInquiry || !inquiry) {
      setFollowUpErrorMessage(
        "No se puede crear el seguimiento porque no hay consulta cargada."
      );
      return;
    }

    if (inquiry.status !== "new" && inquiry.status !== "pending") {
      setFollowUpErrorMessage(
        "No se puede crear un seguimiento sobre una consulta finalizada. Reabre la consulta primero."
      );
      return;
    }

    const cleanFollowUpTitle = followUpTitle.trim();

    if (!cleanFollowUpTitle) {
      setFollowUpErrorMessage("El título del seguimiento es obligatorio.");
      return;
    }

    if (!followUpDueAt) {
      setFollowUpErrorMessage(
        "La fecha y hora del seguimiento son obligatorias."
      );
      return;
    }

    const dueDate = new Date(followUpDueAt);

    if (Number.isNaN(dueDate.getTime())) {
      setFollowUpErrorMessage("La fecha indicada no es válida.");
      return;
    }

    const dueAt = dueDate.toISOString();

    const currentPendingFollowUps = followUps.filter(
      (followUp) => followUp.status === "pending"
    );

    if (
      currentPendingFollowUps.length > 0 &&
      !window.confirm(
        currentPendingFollowUps.length === 1
          ? "Esta consulta ya tiene un seguimiento pendiente. ¿Quieres crear otro seguimiento de todos modos?"
          : `Esta consulta ya tiene ${currentPendingFollowUps.length} seguimientos pendientes. ¿Quieres crear otro seguimiento de todos modos?`
      )
    ) {
      return;
    }

    setIsCreatingFollowUp(true);

    const { data, error } = await supabase
      .from("follow_ups")
      .insert({
        company_id: rawInquiry.company_id,
        customer_id: rawInquiry.customer_id,
        inquiry_id: rawInquiry.id,
        title: cleanFollowUpTitle,
        due_at: dueAt,
        status: "pending",
        urgency: resolveFollowUpUrgency(dueAt, "pending", null),
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

    setIsCreatingFollowUp(false);

    if (error || !data) {
      setFollowUpErrorMessage(
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

    setFollowUpMessage("Seguimiento creado correctamente.");
  };

  const handleUpdateFollowUpStatus = async (
    followUpId: string,
    status: "pending" | "completed" | "cancelled"
  ) => {
    setFollowUpMessage("");
    setFollowUpErrorMessage("");
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
      setFollowUpErrorMessage(
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
      setFollowUpMessage("Seguimiento reabierto correctamente.");
      return;
    }

    setFollowUpMessage(
      status === "completed"
        ? "Seguimiento completado correctamente."
        : "Seguimiento cancelado correctamente."
    );
  };

  if (isLoading) {
    return (
      <div>
        <button
          onClick={() => setActiveView("inquiries")}
          className="mb-3 text-sm font-semibold text-[#0F4C5C] hover:underline"
        >
          ← Volver a consultas
        </button>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          Cargando consulta desde Supabase...
        </div>
      </div>
    );
  }

  if (errorMessage || !inquiry) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <XCircle className="mx-auto text-slate-400" />

        <h2 className="mt-3 font-bold text-slate-950">
          Consulta no encontrada
        </h2>

        <p className="mt-2 text-sm text-slate-500">
          {errorMessage || "No se pudo cargar esta consulta."}
        </p>

        <Button className="mt-4" onClick={() => setActiveView("inquiries")}>
          Volver a consultas
        </Button>
      </div>
    );
  }

  const canReopenInquiry =
    inquiry.status === "replied" ||
    inquiry.status === "closed" ||
    inquiry.status === "discarded";

  const canUseFinalActions =
    inquiry.status === "new" || inquiry.status === "pending";

  const canCreateFollowUp =
    inquiry.status === "new" || inquiry.status === "pending";

  const pendingFollowUps = followUps.filter(
    (followUp) => followUp.status === "pending"
  );

  const historyFollowUps = followUps.filter(
    (followUp) =>
      followUp.status === "completed" || followUp.status === "cancelled"
  );

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <button
            onClick={() => setActiveView("inquiries")}
            className="mb-3 text-sm font-semibold text-[#0F4C5C] hover:underline"
          >
            ← Volver a consultas
          </button>

          <h1 className="text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">
            Consulta de {inquiry.customerName}
          </h1>

          <div className="mt-2 text-sm font-medium text-slate-600">
            {inquiry.subject}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <PriorityBadge priority={inquiry.aiPriority} />
            <CategoryBadge category={inquiry.aiCategory} />
            <StatusBadge status={inquiry.status} />

            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
              {inquiry.createdAt}
            </span>
          </div>

          {statusErrorMessage ? (
            <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {statusErrorMessage}
            </div>
          ) : null}

          {statusMessage ? (
            <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {statusMessage}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {canReopenInquiry ? (
            <Button
              variant="secondary"
              onClick={() => handleUpdateStatus("pending")}
              disabled={isUpdatingStatus}
            >
              Reabrir consulta
            </Button>
          ) : null}

          {canUseFinalActions ? (
            <>
              <Button
                variant="secondary"
                onClick={() => handleUpdateStatus("replied")}
                disabled={isUpdatingStatus}
              >
                <CheckCircle2 size={16} />
                {isUpdatingStatus ? "Actualizando..." : "Marcar respondida"}
              </Button>

              <Button
                variant="secondary"
                onClick={() => handleUpdateStatus("closed")}
                disabled={isUpdatingStatus}
              >
                Cerrar
              </Button>

              <Button
                variant="ghost"
                onClick={() => handleUpdateStatus("discarded")}
                disabled={isUpdatingStatus}
              >
                Descartar consulta
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <main className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Mensaje original
            </div>

            <p className="text-base leading-7 text-slate-900">
              {inquiry.originalMessage}
            </p>
          </div>

          <AIBlock inquiry={inquiry} />
          <ResponseEditor
            inquiry={inquiry}
            canMarkAsReplied={canUseFinalActions}
            isMarkingAsReplied={isUpdatingStatus}
            onMarkAsReplied={() => handleUpdateStatus("replied")}
          />
        </main>

        <aside className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-slate-950">Cliente</h3>

            <p className="mt-2 font-semibold text-slate-900">
              {customer?.name || inquiry.customerName}
            </p>

            <p className="text-sm text-slate-500">
              {customer?.email || "Sin email"}
            </p>

            <p className="text-sm text-slate-500">
              {customer?.phone || "Sin teléfono"}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-slate-950">
              Seguimiento sugerido
            </h3>

            {canCreateFollowUp ? (
              <>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Define cuándo quieres revisar esta consulta para no dejarla sin seguimiento.
                </p>

                {pendingFollowUps.length > 0 ? (
                  <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Esta consulta ya tiene{" "}
                    {pendingFollowUps.length === 1
                      ? "un seguimiento pendiente"
                      : `${pendingFollowUps.length} seguimientos pendientes`}
                    . Revisa si necesitas crear otro.
                  </div>
                ) : null}

                <div className="mt-4 space-y-3">
                  <label className="block text-sm font-medium text-slate-700">
                    Título
                    <input
                      value={followUpTitle}
                      onChange={(event) => setFollowUpTitle(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                    />
                  </label>

                  <label className="block text-sm font-medium text-slate-700">
                    Fecha y hora
                    <input
                      type="datetime-local"
                      value={followUpDueAt}
                      onChange={(event) => setFollowUpDueAt(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                    />
                  </label>
                </div>

                {followUpErrorMessage ? (
                  <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {followUpErrorMessage}
                  </div>
                ) : null}

                {followUpMessage ? (
                  <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {followUpMessage}
                  </div>
                ) : null}

                <Button
                  className="mt-4 w-full"
                  onClick={handleCreateFollowUp}
                  disabled={isCreatingFollowUp}
                >
                  <CalendarClock size={16} />
                  {isCreatingFollowUp
                    ? "Creando seguimiento..."
                    : pendingFollowUps.length > 0
                      ? "Crear otro seguimiento"
                      : "Crear seguimiento"}
                </Button>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Esta consulta está finalizada. Para crear un seguimiento,
                  primero reabre la consulta.
                </p>

                {followUpErrorMessage ? (
                  <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {followUpErrorMessage}
                  </div>
                ) : null}

                {followUpMessage ? (
                  <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {followUpMessage}
                  </div>
                ) : null}
              </>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-slate-950">
              Seguimientos de la consulta
            </h3>

            {followUps.length === 0 ? (
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Todavía no hay seguimientos asociados a esta consulta.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {pendingFollowUps.length > 0 ? (
                  <section>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Pendientes
                    </h4>

                    <div className="space-y-3">
                      {pendingFollowUps.map((followUp) => (
                        <FollowUpCard
                          key={followUp.id}
                          followUp={followUp}
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
                  </section>
                ) : null}

                {historyFollowUps.length > 0 ? (
                  <section>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Historial
                    </h4>

                    <div className="space-y-3">
                      {historyFollowUps.map((followUp) => (
                        <FollowUpCard
                          key={followUp.id}
                          followUp={followUp}
                          onReopen={(id) =>
                            handleUpdateFollowUpStatus(id, "pending")
                          }
                          isUpdating={updatingFollowUpId === followUp.id}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-slate-950">Nota interna</h3>

            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="mt-3 min-h-[120px] w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-[#0F4C5C]"
              placeholder="Añadir nota interna..."
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
              disabled={isSavingNote}
            >
              {isSavingNote ? "Guardando nota..." : "Guardar nota"}
            </Button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-slate-950">Notas de la consulta</h3>

            {notes.length === 0 ? (
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Todavía no hay notas internas para esta consulta.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {notes.map((internalNote) => (
                  <article
                    key={internalNote.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
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
          </div>
        </aside>
      </div>
    </div>
  );
}