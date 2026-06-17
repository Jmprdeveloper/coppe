export type View =
  | "landing"
  | "login"
  | "register"
  | "dashboard"
  | "inquiries"
  | "inquiryDetail"
  | "customers"
  | "customerDetail"
  | "appointments"
  | "followups"
  | "settings"
  | "InquiryForm";

export type InquiryStatus =
  | "new"
  | "pending"
  | "waiting_customer"
  | "replied"
  | "closed"
  | "discarded";

export type CustomerStatus =
  | "new"
  | "active"
  | "inactive"
  | "archived";

export type Priority =
  | "low"
  | "medium"
  | "high";

export type Sentiment = "positive" | "neutral" | "negative";

export type InquiryCategory =
  | "general_info"
  | "service_request"
  | "product_service_inquiry"
  | "quote_request"
  | "appointment_request"
  | "order_or_reservation"
  | "change_or_cancellation"
  | "complaint_or_incident"
  | "support_request"
  | "billing_or_payment"
  | "follow_up"
  | "other";

export type Customer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: CustomerStatus;
  lastInteraction: string;
  language: string;
};

export type Inquiry = {
  id: string;
  customerId: string;
  customerName: string;
  sourceChannel: string;
  subject: string;
  originalMessage: string;
  aiSummary: string;
  aiIntent: string;
  aiCategory: InquiryCategory;
  aiPriority: Priority;
  aiLanguage: string;
  sentiment: Sentiment | "No indicado";
  missingInformation: string[];
  recommendedAction: string;
  suggestedResponse: string;
  status: InquiryStatus;
  createdAt: string;
};

export type FollowUp = {
  id: string;
  title: string;
  customerName: string;
  inquiryId: string;
  dueAt: string;
  dueAtIso: string | null;
  status: "pending" | "completed" | "cancelled";
  urgency: "today" | "overdue" | "upcoming";
};

export type AppointmentStatus =
  | "proposed"
  | "confirmed"
  | "completed"
  | "cancelled";

export type Appointment = {
  id: string;
  inquiryId: string;
  customerId: string;
  title: string;
  scheduledAt: string;
  scheduledAtIso: string;
  durationMinutes: number;
  status: AppointmentStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
};
