import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-950 md:text-2xl">
          {title}
        </h1>

        {description ? (
          <p className="mt-1 text-sm leading-5 text-slate-500">
            {description}
          </p>
        ) : null}
      </div>

      {action}
    </div>
  );
}