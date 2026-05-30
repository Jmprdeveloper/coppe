import { getCategoryLabel as getInquiryCategoryLabel } from "./inquiryCategories";

export function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function getStatusLabel(status: string) {
  const labels: Record<string, string> = {
    new: "Nuevo",
    pending: "Pendiente",
    replied: "Respondido",
    closed: "Cerrado",
    discarded: "Descartado",
    active: "Activo",
    inactive: "Inactivo",
  };

  return labels[status] || status;
}

export function getCategoryLabel(category: string | null | undefined) {
  return getInquiryCategoryLabel(category);
}
