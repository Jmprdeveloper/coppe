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
  tone = "brand",
}: MetricCardProps) {
  const toneStyles = visualToneStyles[tone];

  return (
    <article
      className={classNames(
        "rounded-2xl border p-3.5 shadow-sm transition hover:-translate-y-px hover:shadow-md",
        toneStyles.softCard
      )}
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase leading-4 tracking-wide text-[#5C7780]">
            {title}
          </div>

          <div
            className={classNames(
              "mt-1.5 break-words text-xl font-bold leading-6",
              toneStyles.text
            )}
          >
            {value}
          </div>
        </div>

        {Icon ? (
          <div
            className={classNames(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/80 shadow-sm",
              toneStyles.icon
            )}
          >
            <Icon size={15} />
          </div>
        ) : null}
      </div>

      {caption ? (
        <p className="mt-2 break-words text-[11px] leading-4 text-[#456C75]">
          {caption}
        </p>
      ) : null}
    </article>
  );
}
