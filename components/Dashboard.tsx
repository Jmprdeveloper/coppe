"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  ClipboardList,
  Inbox,
  MessageSquareText,
  Plus,} from "lucide-react";

import {
  followUpUrgencyWeight,
  formatFollowUpDueAt,
  normalizeFollowUpStatus,
  resolveFollowUpUrgency,
} from "../lib/followUpUtils";
import {
  mapInquiryRowToInquiry,
  type InquiryRow,
} from "../lib/inquiryUtils";
import { createClient } from "../lib/supabase/client";
import type { FollowUp, Inquiry, Priority } from "../types";

import { Button } from "./Button";
import { FollowUpCard } from "./FollowUpCard";
import { InquiryCard } from "./InquiryCard";
import { PageHeader } from "./PageHeader";
import { StatCard } from "./StatCard";

type DashboardProps = {
  setActiveView: (view: string) => void;
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

type DashboardFollowUp = FollowUp & {
  dueAtValue: string | null;
};

function mapFollowUpRowToFollowUp(row: FollowUpRow): DashboardFollowUp {
  const status = normalizeFollowUpStatus(row.status);
  const urgency = resolveFollowUpUrgency(row.due_at, status, row.urgency);

  return {
    id: row.id,
    title: row.title,
    customerName: row.customer?.name || "Cliente no indicado",
    inquiryId: row.inquiry_id ?? "",
    dueAt: formatFollowUpDueAt(row.due_at, urgency),
    dueAtIso: row.due_at,
    dueAtValue: row.due_at,
    status,
    urgency,
  };
}

function priorityWeight(priority: Priority) {
  if (priority === "high") {
    return 3;
  }

  if (priority === "medium") {
    return 2;
  }

  return 1;
}

function isOpenInquiry(inquiry: Inquiry) {
  return inquiry.status === "new" || inquiry.status === "pending";
}

export function Dashboard({ setActiveView, openInquiry }: DashboardProps) {
  const supabase = useMemo(() => createClient(), []);

  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [followUps, setFollowUps] = useState<DashboardFollowUp[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingFollowUpId, setUpdatingFollowUpId] = useState<string | null>(
    null
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    async function loadDashboardData() {
      setIsLoading(true);
      setErrorMessage("");
      setSuccessMessage("");

      const { data: inquiriesData, error: inquiriesError } = await supabase
        .from("inquiries")
        .select(
          [
            "id",
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
        .order("created_at", { ascending: false });

      if (inquiriesError) {
        setErrorMessage(
          `No se pudieron cargar los casos del dashboard: ${
            inquiriesError.message || "sin detalle del error"
          }`
        );
        setIsLoading(false);
        return;
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
        .order("due_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (followUpsError) {
        setErrorMessage(
          `No se pudieron cargar los seguimientos del dashboard: ${
            followUpsError.message || "sin detalle del error"
          }`
        );
        setIsLoading(false);
        return;
      }

      setInquiries(
        ((inquiriesData ?? []) as unknown as InquiryRow[]).map(
          mapInquiryRowToInquiry
        )
      );

      setFollowUps(
        ((followUpsData ?? []) as unknown as FollowUpRow[]).map(
          mapFollowUpRowToFollowUp
        )
      );

      setIsLoading(false);
    }

    loadDashboardData();
  }, [supabase]);

  const handleUpdateFollowUpStatus = async (
    followUpId: string,
    status: "completed" | "cancelled"
  ) => {
    setErrorMessage("");
    setSuccessMessage("");
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

    setSuccessMessage(
      status === "completed"
        ? "Seguimiento completado correctamente."
        : "Seguimiento cancelado correctamente."
    );
  };

  const newCount = inquiries.filter((inquiry) => inquiry.status === "new")
    .length;

  const pendingCount = inquiries.filter(
    (inquiry) => inquiry.status === "pending"
  ).length;

  const highPriority = inquiries.filter(
    (inquiry) => isOpenInquiry(inquiry) && inquiry.aiPriority === "high"
  ).length;

  const pendingFollowUps = followUps.filter(
    (followUp) => followUp.status === "pending"
  );

  const urgentFollowUps = pendingFollowUps.filter(
    (followUp) =>
      followUp.urgency === "overdue" || followUp.urgency === "today"
  ).length;

  const priorityItems = [...inquiries]
    .filter((inquiry) => isOpenInquiry(inquiry))
    .sort((a, b) => {
      const priorityDifference =
        priorityWeight(b.aiPriority) - priorityWeight(a.aiPriority);

      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      return a.createdAt.localeCompare(b.createdAt);
    })
    .slice(0, 3);

  const nextFollowUps = [...pendingFollowUps]
    .sort((a, b) => {
      const urgencyDifference =
        followUpUrgencyWeight(b.urgency) - followUpUrgencyWeight(a.urgency);

      if (urgencyDifference !== 0) {
        return urgencyDifference;
      }

      const firstDate = a.dueAtValue ? new Date(a.dueAtValue).getTime() : 0;
      const secondDate = b.dueAtValue ? new Date(b.dueAtValue).getTime() : 0;

      return firstDate - secondDate;
    })
    .slice(0, 3);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Vista rápida de los casos, clientes y seguimientos que necesitan atención ahora."
        action={
          <Button onClick={() => setActiveView("InquiryForm")}>
            <Plus size={16} /> Registrar mensaje
          </Button>
        }
      />

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
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          Cargando dashboard desde Supabase...
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Nuevos casos"
          value={newCount}
          icon={Inbox}
          caption="Recibidas sin revisar"
        />

        <StatCard
          title="Pendientes"
          value={pendingCount}
          icon={ClipboardList}
          caption="Requieren seguimiento"
        />

        <StatCard
          title="Alta prioridad"
          value={highPriority}
          icon={MessageSquareText}
          caption="Atención recomendable"
        />

        <StatCard
          title="Seguimientos urgentes"
          value={urgentFollowUps}
          icon={CalendarClock}
          caption="Vencidos o para hoy"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-950">
              Casos que necesitan atención
            </h2>

            <button
              onClick={() => setActiveView("inquiries")}
              className="text-sm font-semibold text-[#0F4C5C] hover:underline"
            >
              Ver todas
            </button>
          </div>

          {priorityItems.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
              No hay casos pendientes que necesiten atención.
            </div>
          ) : (
            <div className="space-y-3">
              {priorityItems.map((inquiry) => (
                <InquiryCard
                  key={inquiry.id}
                  inquiry={inquiry}
                  onOpen={openInquiry}
                />
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-950">
              Seguimientos que atender
            </h2>

            <button
              onClick={() => setActiveView("followups")}
              className="text-sm font-semibold text-[#0F4C5C] hover:underline"
            >
              Ver agenda
            </button>
          </div>

          {nextFollowUps.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
              No hay seguimientos pendientes.
            </div>
          ) : (
            <div className="space-y-3">
              {nextFollowUps.map((followUp) => (
                <FollowUpCard
                  key={followUp.id}
                  followUp={followUp}
                  onOpen={openInquiry}
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
    </div>
  );
}