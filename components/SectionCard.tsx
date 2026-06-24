import type { ReactNode } from "react";

import {
  surfaceStyles,
  type VisualTone,
  visualToneStyles,
} from "../lib/visualSystem";
import { classNames } from "../lib/utils";

type SectionCardProps = {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: VisualTone;
};

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
  tone = "brand",
}: SectionCardProps) {
  const hasHeader = Boolean(title || description || action);
  const toneStyles = visualToneStyles[tone];

  return (
    <section
      className={classNames(
        surfaceStyles.pageSection,
        "overflow-hidden",
        className
      )}
    >
      {hasHeader ? (
        <div
          className={classNames(
            "border-b px-5 py-4 shadow-sm shadow-[#0F4C5C]/5",
            toneStyles.header
          )}
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              {title ? (
                <h2
                  className={classNames(
                    "text-base font-bold",
                    toneStyles.text
                  )}
                >
                  {title}
                </h2>
              ) : null}

              {description ? (
                <p className="mt-1 max-w-3xl text-sm leading-5 text-[#456C75]">
                  {description}
                </p>
              ) : null}
            </div>

            {action ? <div className="shrink-0">{action}</div> : null}
          </div>
        </div>
      ) : null}

      <div className="p-5">{children}</div>
    </section>
  );
}
