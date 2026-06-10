export type VisualTone =
  | "neutral"
  | "brand"
  | "info"
  | "success"
  | "warning"
  | "danger";

export type VisualToneStyle = {
  card: string;
  softCard: string;
  header: string;
  icon: string;
  badge: string;
  border: string;
  text: string;
  mutedText: string;
  dot: string;
};

export const visualToneStyles: Record<VisualTone, VisualToneStyle> = {
  neutral: {
    card: "border-slate-200 bg-white",
    softCard: "border-slate-200 bg-slate-50/70",
    header: "border-slate-200 bg-white",
    icon: "bg-slate-100 text-slate-600",
    badge: "border-slate-200 bg-slate-50 text-slate-600",
    border: "border-slate-200",
    text: "text-slate-950",
    mutedText: "text-slate-500",
    dot: "bg-slate-400",
  },
  brand: {
    card: "border-[#0F4C5C]/20 bg-white",
    softCard: "border-[#0F4C5C]/15 bg-[#0F4C5C]/[0.035]",
    header: "border-[#0F4C5C]/15 bg-[#0F4C5C]/[0.055]",
    icon: "bg-[#0F4C5C]/10 text-[#0F4C5C]",
    badge: "border-[#0F4C5C]/15 bg-[#0F4C5C]/[0.06] text-[#0F4C5C]",
    border: "border-[#0F4C5C]/20",
    text: "text-[#0F4C5C]",
    mutedText: "text-slate-500",
    dot: "bg-[#0F4C5C]",
  },
  info: {
    card: "border-sky-200/70 bg-white",
    softCard: "border-sky-200/60 bg-sky-50/45",
    header: "border-sky-200/60 bg-sky-50/60",
    icon: "bg-sky-100/80 text-sky-700",
    badge: "border-sky-200 bg-sky-50 text-sky-700",
    border: "border-sky-200/70",
    text: "text-sky-900",
    mutedText: "text-slate-500",
    dot: "bg-sky-500",
  },
  success: {
    card: "border-emerald-200/70 bg-white",
    softCard: "border-emerald-200/60 bg-emerald-50/45",
    header: "border-emerald-200/60 bg-emerald-50/60",
    icon: "bg-emerald-100/80 text-emerald-700",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    border: "border-emerald-200/70",
    text: "text-emerald-900",
    mutedText: "text-slate-500",
    dot: "bg-emerald-500",
  },
  warning: {
    card: "border-amber-200/70 bg-white",
    softCard: "border-amber-200/60 bg-amber-50/40",
    header: "border-amber-200/60 bg-amber-50/55",
    icon: "bg-amber-100/80 text-amber-700",
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    border: "border-amber-200/70",
    text: "text-amber-900",
    mutedText: "text-slate-500",
    dot: "bg-amber-500",
  },
  danger: {
    card: "border-rose-200/70 bg-white",
    softCard: "border-rose-200/60 bg-rose-50/35",
    header: "border-rose-200/60 bg-rose-50/55",
    icon: "bg-rose-100/80 text-rose-700",
    badge: "border-rose-200 bg-rose-50 text-rose-700",
    border: "border-rose-200/70",
    text: "text-rose-900",
    mutedText: "text-slate-500",
    dot: "bg-rose-500",
  },
};

export const surfaceStyles = {
  pageSection:
    "rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/60",
  subtleSection:
    "rounded-2xl border border-slate-200 bg-slate-50/60 shadow-sm shadow-slate-200/50",
  compactCard:
    "rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50",
  field:
    "rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-[#0F4C5C] focus:bg-white",
};

export const actionStyles = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-xl bg-[#0F4C5C] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0B3F4C] disabled:cursor-not-allowed disabled:opacity-60",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60",
  ghost:
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60",
  danger:
    "inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60",
};