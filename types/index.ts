export type View =
  | "landing"
  | "login"
  | "register"
  | "dashboard"
  | "inquiries"
  | "inquiryDetail"
  | "customers"
  | "customerDetail"
  | "followups"
  | "settings"
  | "demoForm";

export type InquiryStatus =
  | "new"
  | "pending"
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

export type InquiryCategory =
  | "sales_inquiry"
  | "appointment_request"
  | "quote_request"
  | "booking"
  | "incident"
  | "general_info"
  | "follow_up"
  | "cancellation"
  | "complaint"
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
  sentiment: string;
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
  status: "pending" | "completed" | "cancelled";
  urgency: "today" | "overdue" | "upcoming";
};