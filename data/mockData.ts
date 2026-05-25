import type { Customer, Inquiry, FollowUp } from "../types";

export const mockCompany = {
    name: "Hotel Costa Azul",
    sector: "Hotel / alojamiento turístico",
    description:
      "Pequeño hotel familiar cerca de la playa con habitaciones dobles, desayuno y atención personalizada.",
    tone: "Profesional",
    language: "Español",
  };
  
  export const mockCustomers: Customer[] = [
    {
      id: "c1",
      name: "María López",
      email: "maria@example.com",
      phone: "+34 600 000 001",
      status: "active",
      lastInteraction: "Hoy, 10:32",
      language: "es",
    },
    {
      id: "c2",
      name: "Sarah Miller",
      email: "sarah@example.com",
      phone: "+44 7700 900123",
      status: "active",
      lastInteraction: "Hoy, 09:14",
      language: "en",
    },
    {
      id: "c3",
      name: "Juan Pérez",
      email: "juan@example.com",
      phone: "+34 600 000 003",
      status: "new",
      lastInteraction: "Ayer, 18:06",
      language: "es",
    },
    {
      id: "c4",
      name: "Claire Johnson",
      email: "claire@example.com",
      phone: "+44 7700 900456",
      status: "active",
      lastInteraction: "Ayer, 12:20",
      language: "en",
    },
  ];
  
  export const mockInquiries: Inquiry[] = [
    {
      id: "i1",
      customerId: "c1",
      customerName: "María López",
      sourceChannel: "form",
      subject: "Disponibilidad habitación doble",
      originalMessage:
        "Hola, quería saber si tenéis habitación doble disponible para el próximo fin de semana para dos personas.",
      aiSummary:
        "Cliente pregunta por disponibilidad de habitación doble para dos personas el próximo fin de semana.",
      aiIntent: "Consultar disponibilidad de reserva",
      aiCategory: "booking",
      aiPriority: "medium",
      aiLanguage: "es",
      sentiment: "neutral_positive",
      missingInformation: ["fechas exactas de entrada y salida"],
      recommendedAction:
        "Pedir fechas exactas antes de revisar disponibilidad y responder con opciones.",
      suggestedResponse:
        "Hola María, gracias por contactar con Hotel Costa Azul. Para poder revisar disponibilidad de habitación doble, ¿podrías indicarnos las fechas exactas de entrada y salida? Estaremos encantados de ayudarte.",
      status: "new",
      createdAt: "Hoy, 10:32",
    },
    {
      id: "i2",
      customerId: "c2",
      customerName: "Sarah Miller",
      sourceChannel: "form",
      subject: "Parking availability",
      originalMessage:
        "Hi, do you have parking available at the hotel? We are arriving next Friday.",
      aiSummary:
        "Customer asks whether parking is available for an arrival next Friday.",
      aiIntent: "Ask about hotel parking",
      aiCategory: "general_info",
      aiPriority: "medium",
      aiLanguage: "en",
      sentiment: "neutral_positive",
      missingInformation: [],
      recommendedAction:
        "Reply with parking information or ask staff to confirm the current availability rules.",
      suggestedResponse:
        "Hi Sarah, thank you for contacting Hotel Costa Azul. We’ll be happy to help with parking information for your arrival next Friday. We’ll review the details and get back to you shortly.",
      status: "pending",
      createdAt: "Hoy, 09:14",
    },
    {
      id: "i3",
      customerId: "c3",
      customerName: "Juan Pérez",
      sourceChannel: "form",
      subject: "Cancelación de reserva",
      originalMessage:
        "Necesito cancelar mi reserva de mañana por un problema familiar. ¿Podéis ayudarme?",
      aiSummary:
        "Cliente solicita cancelar una reserva prevista para mañana por un problema familiar.",
      aiIntent: "Solicitar cancelación de reserva",
      aiCategory: "cancellation",
      aiPriority: "high",
      aiLanguage: "es",
      sentiment: "urgent",
      missingInformation: ["número de reserva", "nombre completo de la reserva"],
      recommendedAction:
        "Responder cuanto antes solicitando número de reserva o datos necesarios para localizarla.",
      suggestedResponse:
        "Hola Juan, sentimos la situación. Para poder ayudarte con la cancelación, ¿podrías indicarnos el número de reserva o el nombre completo con el que se realizó? Lo revisaremos lo antes posible.",
      status: "new",
      createdAt: "Ayer, 18:06",
    },
    {
      id: "i4",
      customerId: "c4",
      customerName: "Claire Johnson",
      sourceChannel: "form",
      subject: "Late check-in",
      originalMessage:
        "Hello, can we check in after 22:00? Our flight arrives late.",
      aiSummary:
        "Customer asks if late check-in after 22:00 is possible due to a late flight.",
      aiIntent: "Ask about late check-in",
      aiCategory: "general_info",
      aiPriority: "high",
      aiLanguage: "en",
      sentiment: "neutral_positive",
      missingInformation: ["booking reference", "exact arrival time"],
      recommendedAction:
        "Ask for booking reference and arrival time before confirming late check-in options.",
      suggestedResponse:
        "Hi Claire, thank you for your message. To help with late check-in, could you please send us your booking reference and your estimated arrival time? We’ll review the options and get back to you shortly.",
      status: "pending",
      createdAt: "Ayer, 12:20",
    },
  ];
  
  export const mockFollowUps: FollowUp[] = [
    {
      id: "f1",
      title: "Responder a María sobre disponibilidad de habitación doble",
      customerName: "María López",
      inquiryId: "i1",
      dueAt: "Hoy, 13:00",
      status: "pending",
      urgency: "today",
    },
    {
      id: "f2",
      title: "Revisar política de late check-in para Claire",
      customerName: "Claire Johnson",
      inquiryId: "i4",
      dueAt: "Hoy, 17:00",
      status: "pending",
      urgency: "today",
    },
    {
      id: "f3",
      title: "Confirmar cancelación de reserva de Juan",
      customerName: "Juan Pérez",
      inquiryId: "i3",
      dueAt: "Vencido",
      status: "pending",
      urgency: "overdue",
    },
  ];