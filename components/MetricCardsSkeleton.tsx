type MetricCardsSkeletonProps = {
    count?: number;
    columnsClassName?: string;
  };
  
  export function MetricCardsSkeleton({
    count = 4,
    columnsClassName = "md:grid-cols-2 xl:grid-cols-4",
  }: MetricCardsSkeletonProps) {
    return (
      <div className={`mb-5 grid gap-4 ${columnsClassName}`}>
        {Array.from({ length: count }).map((_, index) => (
          <div
            key={index}
            className="h-[116px] animate-pulse rounded-2xl border border-slate-200 bg-slate-100/80 shadow-sm shadow-slate-200/60"
          />
        ))}
      </div>
    );
  }