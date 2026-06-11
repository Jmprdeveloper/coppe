import type { LucideIcon } from "lucide-react";

import { type VisualTone, visualToneStyles } from "../lib/visualSystem";
import { classNames } from "../lib/utils";

type MetricCardProps = {
  title: string;
  value: string | number;
  caption?: string;
  icon?: LucideIcon;
  tone?: VisualTone;
};

export function MetricCard({
  title,
  value,
  caption,
  icon: Icon,
  tone = "neutral",
}: MetricCardProps) {
  const toneStyles = visualToneStyles[tone];

  return (
    <article
      className={classNames(
        "rounded-2xl border p-4 shadow-sm shadow-slate-200/60 transition",
        toneStyles.softCard
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
            {title}
          </div>

          <div className="mt-2 truncate text-2xl font-bold text-slate-950">
            {value}
          </div>
        </div>

        {Icon ? (
          <div
            className={classNames(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/70 shadow-sm",
              toneStyles.icon
            )}
          >
            <Icon size={17} />
          </div>
        ) : null}
      </div>

      {caption ? (
        <p className="mt-3 text-xs leading-5 text-slate-600">{caption}</p>
      ) : null}
    </article>
  );
}