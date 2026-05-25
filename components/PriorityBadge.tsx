import { classNames } from "../lib/utils";

type PriorityBadgeProps = {
  priority: string;
};

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  const styles: Record<string, string> = {
    high: "bg-red-50 text-red-700 border-red-100",
    medium: "bg-amber-50 text-amber-700 border-amber-100",
    low: "bg-blue-50 text-blue-700 border-blue-100",
  };

  const labels: Record<string, string> = {
    high: "Alta",
    medium: "Media",
    low: "Baja",
  };

  return (
    <span
      className={classNames(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        styles[priority]
      )}
    >
      {labels[priority] || priority}
    </span>
  );
}