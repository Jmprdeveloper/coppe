import { createHash } from "node:crypto";

export type OutboundResponseChannel = "email" | "whatsapp";

export type OutboundDeliveryFailureStatus = "failed" | "unknown";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class OutboundProviderError extends Error {
  constructor(
    message: string,
    public readonly deliveryStatus: OutboundDeliveryFailureStatus
  ) {
    super(message);
    this.name = "OutboundProviderError";
  }
}

export function isValidOutboundRequestId(value: string) {
  return UUID_REGEX.test(value);
}

export function canSendResponseForInquiryStatus(status: string) {
  return (
    status === "new" ||
    status === "pending" ||
    status === "waiting_customer"
  );
}

export function getHttpProviderDeliveryFailureStatus(
  httpStatus: number
): OutboundDeliveryFailureStatus {
  return httpStatus === 408 || httpStatus >= 500 ? "unknown" : "failed";
}

export function normalizeOutboundDestination(
  channel: OutboundResponseChannel,
  value: string
) {
  const cleanValue = value.trim().toLowerCase();

  if (channel === "whatsapp") {
    return cleanValue.replace(/\D/g, "");
  }

  return cleanValue;
}

export function buildOutboundResponseDeduplicationKey(values: {
  channel: OutboundResponseChannel;
  requestId: string;
  inquiryId: string;
  customerId: string;
  destination: string;
  responseText: string;
}) {
  const digest = createHash("sha256")
    .update(values.channel)
    .update("\n")
    .update(values.requestId.toLowerCase())
    .update("\n")
    .update(values.inquiryId)
    .update("\n")
    .update(values.customerId)
    .update("\n")
    .update(normalizeOutboundDestination(values.channel, values.destination))
    .update("\n")
    .update(values.responseText.normalize("NFKC").trim())
    .digest("hex");

  return `${values.channel}_response:${digest}`;
}

export function getOutboundProviderError(
  error: unknown,
  fallbackMessage: string
) {
  if (error instanceof OutboundProviderError) {
    return error;
  }

  if (error instanceof Error && error.name === "AbortError") {
    return new OutboundProviderError(
      "El proveedor tardó demasiado en responder. El estado final del envío no se puede confirmar.",
      "unknown"
    );
  }

  if (error instanceof Error) {
    return new OutboundProviderError(error.message || fallbackMessage, "unknown");
  }

  return new OutboundProviderError(fallbackMessage, "unknown");
}
