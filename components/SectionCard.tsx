import type { ReactNode } from "react";

import { surfaceStyles } from "../lib/visualSystem";
import { classNames } from "../lib/utils";

type SectionCardProps = {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: SectionCardProps) {
  return (
    <section className={classNames(surfaceStyles.pageSection, "p-4", className)}>
      {title || description || action ? (
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            {title ? (
              <h2 className="text-base font-bold text-slate-950">{title}</h2>
            ) : null}

            {description ? (
              <p className="mt-1 text-sm leading-5 text-slate-500">
                {description}
              </p>
            ) : null}
          </div>

          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}

      {children}
    </section>
  );
}