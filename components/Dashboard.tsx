"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  ClipboardList,
  Inbox,
  MessageSquareText,
  Plus,
} from "lucide-react";

import { mockFollowUps } from "../data/mockData";
import { createClient } from "../lib/supabase/client";
import type {
  Inquiry,
  InquiryCategory,
  InquiryStatus,
  Priority,
} from "../types";

import { Button } from "./Button";
import { FollowUpCard } from "./FollowUpCard";
import { InquiryCard } from "./InquiryCard";
import { PageHeader } from "./PageHeader";
import { StatCard } from "./StatCard";

type DashboardProps = {
  setActiveView: (view: string) => void;
  openInquiry: (id: string) => void;
};

type InquiryRow = {
  id: string;
  customer_id: string | null;
  customer_name: string;
  source_channel: string;
  subject: string | null;
  original_message: string;
  ai_summary: string | null;
  ai_intent: string | null;
  ai_category: string | null;
  ai_priority: string | null;
  ai_language: string | null;
  sentiment: string | null;
  missing_information: string[] | null;
  recommended_action: string | null;
  suggested_response: string | null;
  status: string;
  created_at: string;
};

function normalizeInquiryStatus(status: string): InquiryStatus {
  if (
    status === "new" ||
    status === "pending" ||
    status === "replied" ||
    status === "closed" ||
    status === "discarded"
  ) {
    return status;
  }

  return "new";
}

function normalizePriority(priority: string | null): Priority {
  if (priority === "low" || priority === "medium" || priority === "high") {
    return priority;
  }

  return "medium";
}

function normalizeCategory(category: string | null): InquiryCategory {
  if (
    category === "sales_inquiry" ||
    category === "appointment_request" ||
    category === "quote_request" ||
    category === "booking" ||
    category === "incident" ||
    category === "general_info" ||
    category === "follow_up" ||
    category === "cancellation" ||
    category === "complaint" ||
    category === "other"
  ) {
    return category;
  }

  return "other";
}

function formatDateTime(value: string) {
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

function mapInquiryRowToInquiry(row: InquiryRow): Inquiry {
  return {
    id: row.id,
    customerId: row.customer_id ?? "",
    customerName: row.customer_name,
    sourceChannel: row.source_channel,
    subject: row.subject ?? "Sin asunto",
    originalMessage: row.original_message,
    aiSummary: row.ai_summary ?? "Sin resumen disponible.",
    aiIntent: row.ai_intent ?? "No identificado",
    aiCategory: normalizeCategory(row.ai_category),
    aiPriority: normalizePriority(row.ai_priority),
    aiLanguage: row.ai_language ?? "No indicado",
    sentiment: row.sentiment ?? "No indicado",
    missingInformation: row.missing_information ?? [],
    recommendedAction:
      row.recommended_action ?? "No hay acción recomendada disponible.",
    suggestedResponse:
      row.suggested_response ?? "No hay respuesta sugerida disponible.",
    status: normalizeInquiryStatus(row.status),
    createdAt: formatDateTime(row.created_at),
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

export function Dashboard({ setActiveView, openInquiry }: DashboardProps) {
  const supabase = useMemo(() => createClient(), []);

  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadDashboardInquiries() {
      setIsLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
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

      if (error) {
        setErrorMessage(
          `No se pudo cargar el dashboard: ${
            error.message || "sin detalle del error"
          }`
        );
        setIsLoading(false);
        return;
      }

      setInquiries(
        ((data ?? []) as unknown as InquiryRow[]).map(mapInquiryRowToInquiry)
      );

      setIsLoading(false);
    }

    loadDashboardInquiries();
  }, [supabase]);

  const newCount = inquiries.filter((inquiry) => inquiry.status === "new")
    .length;

  const pendingCount = inquiries.filter(
    (inquiry) => inquiry.status === "pending"
  ).length;

  const highPriority = inquiries.filter(
    (inquiry) => inquiry.aiPriority === "high"
  ).length;

  const todayFollowUps = mockFollowUps.filter(
    (followUp) => followUp.urgency === "today"
  ).length;

  const priorityItems = [...inquiries]
    .filter(
      (inquiry) =>
        inquiry.status === "new" ||
        inquiry.status === "pending" ||
        inquiry.aiPriority === "high"
    )
    .sort((a, b) => {
      const priorityDifference =
        priorityWeight(b.aiPriority) - priorityWeight(a.aiPriority);

      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      return a.createdAt.localeCompare(b.createdAt);
    })
    .slice(0, 3);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Consulta de un vistazo qué clientes necesitan atención ahora."
        action={
          <Button onClick={() => setActiveView("demoForm")}>
            <Plus size={16} /> Nueva consulta
          </Button>
        }
      />

      {errorMessage ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {isLoading ? (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          Cargando dashboard desde Supabase...
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Nuevas consultas"
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
          title="Seguimientos hoy"
          value={todayFollowUps}
          icon={CalendarClock}
          caption="Datos simulados por ahora"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-950">
              Consultas que necesitan atención
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
              No hay consultas pendientes que necesiten atención.
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
              Seguimientos próximos
            </h2>

            <button
              onClick={() => setActiveView("followups")}
              className="text-sm font-semibold text-[#0F4C5C] hover:underline"
            >
              Ver agenda
            </button>
          </div>

          <div className="space-y-3">
            {mockFollowUps.map((followUp) => (
              <FollowUpCard
                key={followUp.id}
                followUp={followUp}
                onOpen={openInquiry}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}