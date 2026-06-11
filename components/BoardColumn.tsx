import type { ReactNode } from "react";

import {
  type VisualTone,
  visualToneStyles,
} from "../lib/visualSystem";
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
  tone = "neutral",
  children,
}: BoardColumnProps) {
  const toneStyles = visualToneStyles[tone];

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60">
      <div
        className={classNames(
          "mb-4 rounded-2xl border px-4 py-3 shadow-sm",
          toneStyles.header
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className={classNames("font-bold", toneStyles.text)}>
              {title}
            </h3>

            {description ? (
              <p className="mt-1 text-xs leading-5 text-slate-600">
                {description}
              </p>
            ) : null}
          </div>

          {typeof count === "number" ? (
            <span
              className={classNames(
                "inline-flex h-7 min-w-7 items-center justify-center rounded-full border bg-white px-2 text-xs font-bold shadow-sm",
                toneStyles.badge
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