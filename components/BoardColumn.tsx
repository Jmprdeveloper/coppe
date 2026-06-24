import type { ReactNode } from "react";

import { type VisualTone, visualToneStyles } from "../lib/visualSystem";
import { classNames } from "../lib/utils";

type BoardColumnProps = {
  title: string;
  description?: string;
  count?: number;
  tone?: VisualTone;
  children: ReactNode;
};

export function BoardColumn({
  title,
  description,
  count,
  tone = "brand",
  children,
}: BoardColumnProps) {
  const toneStyles = visualToneStyles[tone];

  return (
    <section className="self-start rounded-2xl border border-[#D5E8EC] bg-gradient-to-br from-[#F7FBFC] via-white to-[#EEF7F9] p-3 shadow-sm shadow-[#0F4C5C]/5">
      <div
        className={classNames(
          "mb-3 rounded-xl border px-4 py-3 shadow-sm shadow-[#0F4C5C]/5",
          toneStyles.header
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className={classNames("font-bold", toneStyles.text)}>
              {title}
            </h3>

            {description ? (
              <p className="mt-1 text-xs leading-5 text-[#456C75]">
                {description}
              </p>
            ) : null}
          </div>

          {typeof count === "number" ? (
            <span
              className={classNames(
                "inline-flex h-7 min-w-7 items-center justify-center rounded-full border bg-white px-2 text-xs font-bold shadow-sm shadow-[#0F4C5C]/10",
                toneStyles.border,
                toneStyles.text
              )}
            >
              {count}
            </span>
          ) : null}
        </div>
      </div>

      <div className="space-y-3">{children}</div>
    </section>
  );
}
