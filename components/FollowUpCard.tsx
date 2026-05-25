import { ChevronRight } from "lucide-react";
import { classNames } from "../lib/utils";
import type { FollowUp } from "../types";

type FollowUpCardProps = {
  followUp: FollowUp;
  onOpen: (id: string) => void;
};

export function FollowUpCard({ followUp, onOpen }: FollowUpCardProps) {
  const overdue = followUp.urgency === "overdue";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div
              className={classNames(
                "h-2.5 w-2.5 rounded-full",
                overdue ? "bg-red-500" : "bg-amber-500"
              )}
            />

            <p className="text-sm font-semibold text-slate-950">
              {followUp.title}
            </p>
          </div>

          <p className="mt-1 text-xs text-slate-500">
            {followUp.customerName} · {followUp.dueAt}
          </p>
        </div>

        {followUp.inquiryId ? (
          <button
            onClick={() => onOpen(followUp.inquiryId)}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <ChevronRight size={16} />
          </button>
        ) : null}
      </div>
    </div>
  );
}