export type VisualTone =
  | "neutral"
  | "brand"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "customer"
  | "case"
  | "appointment"
  | "followUp"
  | "note"
  | "ai"
  | "archived";

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
    card: "border-[#D2E4E8] bg-white shadow-[#0F4C5C]/8",
    softCard:
      "border-[#D2E4E8] bg-gradient-to-br from-white via-[#F5FAFB] to-[#EAF5F7] shadow-[#0F4C5C]/8",
    header:
      "border-[#D2E4E8] bg-gradient-to-r from-[#F5FAFB] via-white to-[#EAF5F7]",
    icon: "bg-white text-[#315F69] ring-1 ring-[#D2E4E8]",
    badge: "border-[#D2E4E8] bg-white text-[#315F69]",
    border: "border-[#D2E4E8]",
    text: "text-[#153F48]",
    mutedText: "text-[#5C7780]",
    dot: "bg-[#6B929B]",
  },
  brand: {
    card: "border-[#8FB8C2] bg-white shadow-[#0F4C5C]/14",
    softCard:
      "border-[#8FB8C2] bg-gradient-to-br from-[#D7EBEF] via-[#EAF5F7] to-white shadow-[#0F4C5C]/14",
    header:
      "border-[#8FB8C2] bg-gradient-to-r from-[#C4E0E6] via-[#DFF0F3] to-[#F5FAFB]",
    icon: "bg-white text-[#0F4C5C] ring-1 ring-[#8FB8C2]",
    badge: "border-[#8FB8C2] bg-white text-[#0F4C5C]",
    border: "border-[#8FB8C2]",
    text: "text-[#0B3F4C]",
    mutedText: "text-[#456C75]",
    dot: "bg-[#0F4C5C]",
  },
  info: {
    card: "border-[#A7C9D1] bg-white shadow-[#0F4C5C]/10",
    softCard:
      "border-[#A7C9D1] bg-gradient-to-br from-[#E2F1F4] via-[#F2FAFB] to-white shadow-[#0F4C5C]/10",
    header:
      "border-[#A7C9D1] bg-gradient-to-r from-[#D3E9EE] via-[#EAF5F7] to-white",
    icon: "bg-white text-[#145766] ring-1 ring-[#A7C9D1]",
    badge: "border-[#A7C9D1] bg-white text-[#145766]",
    border: "border-[#A7C9D1]",
    text: "text-[#0D4A58]",
    mutedText: "text-[#4E737B]",
    dot: "bg-[#145766]",
  },
  success: {
    card: "border-[#98C1CA] bg-white shadow-[#0F4C5C]/12",
    softCard:
      "border-[#98C1CA] bg-gradient-to-br from-[#D9EEF1] via-[#F2FAFB] to-white shadow-[#0F4C5C]/12",
    header:
      "border-[#98C1CA] bg-gradient-to-r from-[#CDE6EB] via-[#E6F3F6] to-white",
    icon: "bg-white text-[#0E5362] ring-1 ring-[#98C1CA]",
    badge: "border-[#98C1CA] bg-white text-[#0E5362]",
    border: "border-[#98C1CA]",
    text: "text-[#0B4654]",
    mutedText: "text-[#4A7078]",
    dot: "bg-[#0E5362]",
  },
  warning: {
    card: "border-[#7FABBA] bg-white shadow-[#0F4C5C]/14",
    softCard:
      "border-[#7FABBA] bg-gradient-to-br from-[#D0E7EC] via-[#EAF5F7] to-white shadow-[#0F4C5C]/14",
    header:
      "border-[#7FABBA] bg-gradient-to-r from-[#BDDCE3] via-[#DFF0F3] to-white",
    icon: "bg-white text-[#0C4B59] ring-1 ring-[#7FABBA]",
    badge: "border-[#7FABBA] bg-white text-[#0C4B59]",
    border: "border-[#7FABBA]",
    text: "text-[#083C48]",
    mutedText: "text-[#456C75]",
    dot: "bg-[#0C4B59]",
  },
  danger: {
    card: "border-[#628F9A] bg-white shadow-[#0F4C5C]/16",
    softCard:
      "border-[#628F9A] bg-gradient-to-br from-[#C4E0E6] via-[#E4F2F5] to-white shadow-[#0F4C5C]/16",
    header:
      "border-[#628F9A] bg-gradient-to-r from-[#AFCFD7] via-[#D7EBEF] to-white",
    icon: "bg-white text-[#083C48] ring-1 ring-[#628F9A]",
    badge: "border-[#628F9A] bg-white text-[#083C48]",
    border: "border-[#628F9A]",
    text: "text-[#073540]",
    mutedText: "text-[#3F6670]",
    dot: "bg-[#083C48]",
  },
  customer: {
    card: "border-[#AFCFD7] bg-white shadow-[#0F4C5C]/10",
    softCard:
      "border-[#AFCFD7] bg-gradient-to-br from-[#E6F3F6] via-[#F7FBFC] to-white shadow-[#0F4C5C]/10",
    header:
      "border-[#AFCFD7] bg-gradient-to-r from-[#DFF0F3] via-[#F2FAFB] to-white",
    icon: "bg-white text-[#155D6D] ring-1 ring-[#AFCFD7]",
    badge: "border-[#AFCFD7] bg-white text-[#155D6D]",
    border: "border-[#AFCFD7]",
    text: "text-[#104D5A]",
    mutedText: "text-[#547680]",
    dot: "bg-[#155D6D]",
  },
  case: {
    card: "border-[#96BEC7] bg-white shadow-[#0F4C5C]/12",
    softCard:
      "border-[#96BEC7] bg-gradient-to-br from-[#D7EBEF] via-[#F2FAFB] to-white shadow-[#0F4C5C]/12",
    header:
      "border-[#96BEC7] bg-gradient-to-r from-[#CCE5EA] via-[#E6F3F6] to-white",
    icon: "bg-white text-[#0F4C5C] ring-1 ring-[#96BEC7]",
    badge: "border-[#96BEC7] bg-white text-[#0F4C5C]",
    border: "border-[#96BEC7]",
    text: "text-[#0B3F4C]",
    mutedText: "text-[#4B7078]",
    dot: "bg-[#0F4C5C]",
  },
  appointment: {
    card: "border-[#86B2BD] bg-white shadow-[#0F4C5C]/13",
    softCard:
      "border-[#86B2BD] bg-gradient-to-br from-[#D0E7EC] via-[#EAF5F7] to-white shadow-[#0F4C5C]/13",
    header:
      "border-[#86B2BD] bg-gradient-to-r from-[#C2E0E6] via-[#DFF0F3] to-white",
    icon: "bg-white text-[#0D4F5E] ring-1 ring-[#86B2BD]",
    badge: "border-[#86B2BD] bg-white text-[#0D4F5E]",
    border: "border-[#86B2BD]",
    text: "text-[#0A424F]",
    mutedText: "text-[#486E77]",
    dot: "bg-[#0D4F5E]",
  },
  followUp: {
    card: "border-[#78A7B3] bg-white shadow-[#0F4C5C]/14",
    softCard:
      "border-[#78A7B3] bg-gradient-to-br from-[#CAE4EA] via-[#EAF5F7] to-white shadow-[#0F4C5C]/14",
    header:
      "border-[#78A7B3] bg-gradient-to-r from-[#B8D9E1] via-[#D7EBEF] to-white",
    icon: "bg-white text-[#0B4855] ring-1 ring-[#78A7B3]",
    badge: "border-[#78A7B3] bg-white text-[#0B4855]",
    border: "border-[#78A7B3]",
    text: "text-[#083B46]",
    mutedText: "text-[#456B74]",
    dot: "bg-[#0B4855]",
  },
  note: {
    card: "border-[#9FC4CC] bg-white shadow-[#0F4C5C]/11",
    softCard:
      "border-[#9FC4CC] bg-gradient-to-br from-[#E0F0F3] via-[#F5FAFB] to-white shadow-[#0F4C5C]/11",
    header:
      "border-[#9FC4CC] bg-gradient-to-r from-[#D5E9EE] via-[#ECF6F8] to-white",
    icon: "bg-white text-[#135867] ring-1 ring-[#9FC4CC]",
    badge: "border-[#9FC4CC] bg-white text-[#135867]",
    border: "border-[#9FC4CC]",
    text: "text-[#0E4A57]",
    mutedText: "text-[#50737B]",
    dot: "bg-[#135867]",
  },
  ai: {
    card: "border-[#6D9BA7] bg-white shadow-[#0F4C5C]/15",
    softCard:
      "border-[#6D9BA7] bg-gradient-to-br from-[#C4E0E6] via-[#E6F3F6] to-white shadow-[#0F4C5C]/15",
    header:
      "border-[#6D9BA7] bg-gradient-to-r from-[#AFCFD7] via-[#D7EBEF] to-white",
    icon: "bg-white text-[#093F4B] ring-1 ring-[#6D9BA7]",
    badge: "border-[#6D9BA7] bg-white text-[#093F4B]",
    border: "border-[#6D9BA7]",
    text: "text-[#073641]",
    mutedText: "text-[#416873]",
    dot: "bg-[#093F4B]",
  },
  archived: {
    card: "border-[#C4DADF] bg-white shadow-[#0F4C5C]/8",
    softCard:
      "border-[#C4DADF] bg-gradient-to-br from-[#F2FAFB] via-white to-[#EAF5F7] shadow-[#0F4C5C]/8",
    header:
      "border-[#C4DADF] bg-gradient-to-r from-[#EAF5F7] via-white to-[#F5FAFB]",
    icon: "bg-white text-[#4E7078] ring-1 ring-[#C4DADF]",
    badge: "border-[#C4DADF] bg-white text-[#4E7078]",
    border: "border-[#C4DADF]",
    text: "text-[#315F69]",
    mutedText: "text-[#6B858C]",
    dot: "bg-[#6B929B]",
  },
};

export const surfaceStyles = {
  pageSection:
    "rounded-2xl border border-[#B8D1D8] bg-white shadow-md shadow-[#0F4C5C]/10",
  subtleSection:
    "rounded-2xl border border-[#D5E8EC] bg-gradient-to-br from-[#F7FBFC] via-white to-[#EEF7F9] shadow-sm shadow-[#0F4C5C]/5",
  compactCard:
    "rounded-2xl border border-[#B8D1D8] bg-white shadow-sm shadow-[#0F4C5C]/10",
  field:
    "rounded-xl border border-[#B8D1D8] bg-white px-3 py-2 text-sm text-[#153F48] outline-none transition placeholder:text-[#8AA5AC] focus:border-[#0F4C5C] focus:ring-2 focus:ring-[#0F4C5C]/15",
};

export const actionStyles = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#083640] via-[#0B3F4C] to-[#0F4C5C] px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-[#0F4C5C]/25 transition hover:from-[#062E36] hover:via-[#083640] hover:to-[#0B3F4C] disabled:cursor-not-allowed disabled:opacity-60",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-xl border border-[#8FB8C2] bg-white px-4 py-2 text-sm font-semibold text-[#0F4C5C] shadow-sm shadow-[#0F4C5C]/10 transition hover:border-[#0F4C5C]/40 hover:bg-[#EAF5F7] disabled:cursor-not-allowed disabled:opacity-60",
  soft:
    "inline-flex items-center justify-center gap-2 rounded-xl border border-[#7FABBA] bg-gradient-to-r from-[#DFF0F3] via-[#EAF5F7] to-[#F7FBFC] px-4 py-2 text-sm font-semibold text-[#083640] shadow-sm shadow-[#0F4C5C]/12 transition hover:border-[#0F4C5C]/45 hover:from-[#CDE6EB] hover:via-[#DFF0F3] hover:to-[#F2FAFB] disabled:cursor-not-allowed disabled:opacity-60",
  status:
    "inline-flex items-center justify-center gap-2 rounded-xl border border-[#0F4C5C]/30 bg-gradient-to-r from-[#C4E0E6] via-[#D7EBEF] to-[#EAF5F7] px-4 py-2 text-sm font-semibold text-[#073641] shadow-sm shadow-[#0F4C5C]/14 transition hover:border-[#0F4C5C]/50 hover:from-[#B8D9E1] hover:via-[#CCE5EA] hover:to-[#DFF0F3] disabled:cursor-not-allowed disabled:opacity-60",
  ghost:
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-[#315F69] transition hover:bg-[#EAF5F7] hover:text-[#0F4C5C] disabled:cursor-not-allowed disabled:opacity-60",
  danger:
    "inline-flex items-center justify-center gap-2 rounded-xl border border-[#6D9BA7] bg-[#F2FAFB] px-4 py-2 text-sm font-semibold text-[#083640] shadow-sm shadow-[#0F4C5C]/10 transition hover:border-[#0F4C5C]/45 hover:bg-[#DFF0F3] disabled:cursor-not-allowed disabled:opacity-60",
  openCase:
    "inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#0F4C5C]/20 bg-white px-3 py-2 text-xs font-bold text-[#0F4C5C] shadow-sm shadow-[#0F4C5C]/10 transition hover:border-[#0F4C5C]/35 hover:bg-[#0F4C5C] hover:text-white disabled:cursor-not-allowed disabled:opacity-60",
};
