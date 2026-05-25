import { Plus, Search } from "lucide-react";

import { mockInquiries } from "../data/mockData";
import { Button } from "./Button";
import { CategoryBadge } from "./CategoryBadge";
import { PageHeader } from "./PageHeader";
import { PriorityBadge } from "./PriorityBadge";
import { StatusBadge } from "./StatusBadge";

type InquiriesProps = {
  openInquiry: (id: string) => void;
};

export function Inquiries({ openInquiry }: InquiriesProps) {
  return (
    <div>
      <PageHeader
        title="Consultas"
        description="Todas las consultas recibidas, clasificadas por estado, prioridad y categoría."
        action={
          <Button>
            <Plus size={16} /> Nueva consulta
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
          <Search size={16} className="text-slate-400" />

          <input
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            placeholder="Buscar por cliente, mensaje o categoría..."
          />
        </div>

        <Button variant="secondary">Estado</Button>
        <Button variant="secondary">Prioridad</Button>
        <Button variant="secondary">Categoría</Button>
      </div>

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
          {mockInquiries.map((inquiry) => (
            <button
              key={inquiry.id}
              onClick={() => openInquiry(inquiry.id)}
              className="grid w-full gap-3 px-4 py-4 text-left transition hover:bg-slate-50 md:grid-cols-[1.1fr_2fr_1fr_1fr_1fr_0.8fr] md:items-center"
            >
              <div className="font-semibold text-slate-950">
                {inquiry.customerName}
              </div>

              <div className="line-clamp-2 text-sm text-slate-600">
                {inquiry.aiSummary}
              </div>

              <div>
                <CategoryBadge category={inquiry.aiCategory} />
              </div>

              <div>
                <PriorityBadge priority={inquiry.aiPriority} />
              </div>

              <div>
                <StatusBadge status={inquiry.status} />
              </div>

              <div className="text-xs text-slate-500">
                {inquiry.createdAt}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}