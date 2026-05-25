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
  
  export function getCategoryLabel(category: string) {
    const labels: Record<string, string> = {
      sales_inquiry: "Consulta comercial",
      appointment_request: "Solicitud de cita",
      quote_request: "Presupuesto",
      booking: "Reserva",
      incident: "Incidencia",
      general_info: "Información",
      follow_up: "Seguimiento",
      cancellation: "Cancelación",
      complaint: "Queja",
      other: "Otro",
    };
  
    return labels[category] || category;
  }