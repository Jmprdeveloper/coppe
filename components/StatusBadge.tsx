import { classNames, getStatusLabel } from "../lib/utils";

type StatusBadgeProps = {
  status: string;
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const styles: Record<string, string> = {
    new: "bg-blue-50 text-blue-700 border-blue-100",
    pending: "bg-amber-50 text-amber-700 border-amber-100",
    replied: "bg-emerald-50 text-emerald-700 border-emerald-100",
    closed: "bg-gray-100 text-gray-700 border-gray-200",
    discarded: "bg-gray-100 text-gray-600 border-gray-200",
    active: "bg-emerald-50 text-emerald-700 border-emerald-100",
    inactive: "bg-gray-100 text-gray-600 border-gray-200",
  };

  return (
    <span
      className={classNames(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        styles[status]
      )}
    >
      {getStatusLabel(status)}
    </span>
  );
}