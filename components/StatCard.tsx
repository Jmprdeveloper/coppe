import { LucideIcon } from "lucide-react";

type StatCardProps = {
  title: string;
  value: number | string;
  icon: LucideIcon;
  caption: string;
};

export function StatCard({ title, value, icon: Icon, caption }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-slate-500">{title}</div>

        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#E6F3F6] text-[#0F4C5C]">
          <Icon size={18} />
        </div>
      </div>

      <div className="mt-3 text-3xl font-bold text-slate-950">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{caption}</div>
    </div>
  );
}