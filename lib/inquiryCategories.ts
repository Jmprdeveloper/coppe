import type { InquiryCategory } from "../types";

export type InquiryCategoryOption = {
  value: InquiryCategory;
  label: string;
};

export const inquiryCategoryOptions: InquiryCategoryOption[] = [
  { value: "general_info", label: "Información general" },
  { value: "product_service_inquiry", label: "Producto o servicio" },
  { value: "quote_request", label: "Presupuesto" },
  { value: "appointment_request", label: "Cita" },
  { value: "order_or_reservation", label: "Pedido o reserva" },
  { value: "change_or_cancellation", label: "Cambio o cancelación" },
  { value: "complaint_or_incident", label: "Queja o incidencia" },
  { value: "support_request", label: "Soporte" },
  { value: "billing_or_payment", label: "Facturación o pago" },
  { value: "follow_up", label: "Seguimiento" },
  { value: "other", label: "Otra" },
];

const inquiryCategoryLabels: Record<InquiryCategory, string> =
  inquiryCategoryOptions.reduce(
    (labels, option) => ({
      ...labels,
      [option.value]: option.label,
    }),
    {} as Record<InquiryCategory, string>
  );

const legacyInquiryCategoryMap: Record<string, InquiryCategory> = {
  booking: "order_or_reservation",
  cancellation: "change_or_cancellation",
  complaint: "complaint_or_incident",
  incident: "complaint_or_incident",
  sales_inquiry: "product_service_inquiry",
};

export function normalizeInquiryCategory(
  category: string | null | undefined
): InquiryCategory {
  const cleanCategory = category?.trim() ?? "";

  if (cleanCategory in inquiryCategoryLabels) {
    return cleanCategory as InquiryCategory;
  }

  return legacyInquiryCategoryMap[cleanCategory] ?? "other";
}

export function getCategoryLabel(category: string | null | undefined) {
  const normalizedCategory = normalizeInquiryCategory(category);

  return inquiryCategoryLabels[normalizedCategory] ?? "Otra";
}
