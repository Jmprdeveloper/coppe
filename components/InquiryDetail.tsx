import { CalendarClock, CheckCircle2, XCircle } from "lucide-react";

import { mockCustomers } from "../data/mockData";
import type { Inquiry } from "../types";

import { AIBlock } from "./AIBlock";
import { Button } from "./Button";
import { CategoryBadge } from "./CategoryBadge";
import { PriorityBadge } from "./PriorityBadge";
import { ResponseEditor } from "./ResponseEditor";
import { StatusBadge } from "./StatusBadge";

type InquiryDetailProps = {
  inquiry?: Inquiry;
  setActiveView: (view: string) => void;
};

export function InquiryDetail({ inquiry, setActiveView }: InquiryDetailProps) {
  if (!inquiry) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <XCircle className="mx-auto text-slate-400" />

        <h2 className="mt-3 font-bold text-slate-950">
          Consulta no encontrada
        </h2>

        <Button className="mt-4" onClick={() => setActiveView("inquiries")}>
          Volver a consultas
        </Button>
      </div>
    );
  }

  const customer = mockCustomers.find(
    (customerItem) => customerItem.id === inquiry.customerId
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

          <div className="mt-3 flex flex-wrap gap-2">
            <PriorityBadge priority={inquiry.aiPriority} />
            <CategoryBadge category={inquiry.aiCategory} />
            <StatusBadge status={inquiry.status} />

            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
              {inquiry.createdAt}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary">
            <CheckCircle2 size={16} /> Marcar respondida
          </Button>

          <Button variant="secondary">Cerrar</Button>
          <Button variant="ghost">Descartar</Button>
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
          <ResponseEditor inquiry={inquiry} />
        </main>

        <aside className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-slate-950">Cliente</h3>

            <p className="mt-2 font-semibold text-slate-900">
              {inquiry.customerName}
            </p>

            <p className="text-sm text-slate-500">{customer?.email}</p>
            <p className="text-sm text-slate-500">{customer?.phone}</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-slate-950">
              Seguimiento sugerido
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Crear seguimiento para revisar esta consulta en menos de 24 horas.
            </p>

            <Button className="mt-4 w-full">
              <CalendarClock size={16} /> Crear seguimiento
            </Button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-slate-950">Notas internas</h3>

            <textarea
              className="mt-3 min-h-[120px] w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-[#0F4C5C]"
              placeholder="Añadir nota interna..."
            />

            <Button variant="secondary" className="mt-3 w-full">
              Guardar nota
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}