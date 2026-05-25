import { ChevronRight } from "lucide-react";
import { PriorityBadge } from "./PriorityBadge";
import { CategoryBadge } from "./CategoryBadge";
import { StatusBadge } from "./StatusBadge";
import type { Inquiry } from "../types";

type InquiryCardProps = {
  inquiry: Inquiry;
  onOpen: (id: string) => void;
};

export function InquiryCard({ inquiry, onOpen }: InquiryCardProps) {
  return (
    <button
      onClick={() => onOpen(inquiry.id)}
      className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-[#0F4C5C]/30 hover:shadow-md"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-slate-950">
              {inquiry.customerName}
            </h3>

            <PriorityBadge priority={inquiry.aiPriority} />
            <CategoryBadge category={inquiry.aiCategory} />
            <StatusBadge status={inquiry.status} />
          </div>

          <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
            {inquiry.aiSummary}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2 text-xs text-slate-400">
          {inquiry.createdAt}
          <ChevronRight size={16} />
        </div>
      </div>
    </button>
  );
}