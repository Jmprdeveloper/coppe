"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";

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

function isSameDay(firstDate: Date, secondDate: Date) {
  return (
    firstDate.getFullYear() === secondDate.getFullYear() &&
    firstDate.getMonth() === secondDate.getMonth() &&
    firstDate.getDate() === secondDate.getDate()
  );
}

function normalizeFollowUpStatus(
  status: string
): "pending" | "completed" | "cancelled" {
  if (status === "pending" || status === "completed" || status === "cancelled") {
    return status;
  }

  return "pending";
}

function resolveUrgency(
  dueAt: string | null,
  status: string,
  storedUrgency: string | null
): "today" | "overdue" | "upcoming" {
  if (status !== "pending") {
    return "upcoming";
  }

  if (!dueAt) {
    if (
      storedUrgency === "today" ||
      storedUrgency === "overdue" ||
      storedUrgency === "upcoming"
    ) {
      return storedUrgency;
    }

    return "upcoming";
  }

  const dueDate = new Date(dueAt);

  if (Number.isNaN(dueDate.getTime())) {
    return "upcoming";
  }

  const now = new Date();

  if (dueDate < now && !isSameDay(dueDate, now)) {
    return "overdue";
  }

  if (isSameDay(dueDate, now)) {
    return dueDate < now ? "overdue" : "today";
  }

  return "upcoming";
}

function formatDueAt(value: string | null, urgency: "today" | "overdue" | "upcoming") {
  if (!value) {
    return "Sin fecha";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Fecha no disponible";
  }

  if (urgency === "overdue") {
    return "Vencido";
  }

  if (urgency === "today") {
    return `Hoy, ${new Intl.DateTimeFormat("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date)}`;
  }

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function mapFollowUpRowToFollowUp(row: FollowUpRow): FollowUp {
  const status = normalizeFollowUpStatus(row.status);
  const urgency = resolveUrgency(row.due_at, status, row.urgency);

  return {
    id: row.id,
    title: row.title,
    customerName: row.customer?.name || "Cliente no indicado",
    inquiryId: row.inquiry_id ?? "",
    dueAt: formatDueAt(row.due_at, urgency),
    status,
    urgency,
  };
}

export function FollowUps({ openInquiry }: FollowUpsProps) {
  const supabase = useMemo(() => createClient(), []);

  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadFollowUps() {
      setIsLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
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

      if (error) {
        setErrorMessage(
          `No se pudieron cargar los seguimientos: ${
            error.message || "sin detalle del error"
          }`
        );
        setIsLoading(false);
        return;
      }

      setFollowUps(
        ((data ?? []) as unknown as FollowUpRow[]).map(
          mapFollowUpRowToFollowUp
        )
      );

      setIsLoading(false);
    }

    loadFollowUps();
  }, [supabase]);

  const overdue = followUps.filter(
    (followUp) => followUp.urgency === "overdue"
  );

  const today = followUps.filter((followUp) => followUp.urgency === "today");

  const upcoming = followUps.filter(
    (followUp) => followUp.urgency === "upcoming"
  );

  return (
    <div>
      <PageHeader
        title="Seguimientos"
        description="Tareas pendientes para no olvidar consultas importantes."
        action={
          <Button>
            <Plus size={16} /> Crear seguimiento
          </Button>
        }
      />

      {errorMessage ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
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
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}