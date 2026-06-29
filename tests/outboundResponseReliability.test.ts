import { describe, expect, it } from "vitest";

import {
  buildOutboundResponseDeduplicationKey,
  canSendResponseForInquiryStatus,
  getHttpProviderDeliveryFailureStatus,
  getOutboundProviderError,
  isValidOutboundRequestId,
  OutboundProviderError,
} from "../lib/outboundResponseReliability";

const baseValues = {
  channel: "email" as const,
  requestId: "f4ec1120-6d10-4df6-aa2d-2d162dca8d43",
  inquiryId: "31f70380-155d-4876-8375-13012c6551c3",
  customerId: "c7ba8b60-655f-43d5-8107-ac23257fb0fb",
  destination: "customer@example.com",
  responseText: "Gracias por escribirnos.",
};

describe("outbound response reliability", () => {
  it("accepts canonical UUID request identifiers", () => {
    expect(isValidOutboundRequestId(baseValues.requestId)).toBe(true);
    expect(isValidOutboundRequestId("not-a-request-id")).toBe(false);
  });

  it("builds a stable idempotency key for the same request", () => {
    expect(buildOutboundResponseDeduplicationKey(baseValues)).toBe(
      buildOutboundResponseDeduplicationKey({
        ...baseValues,
        destination: " CUSTOMER@EXAMPLE.COM ",
      })
    );
  });

  it("does not permanently deduplicate distinct send actions with equal text", () => {
    const firstKey = buildOutboundResponseDeduplicationKey(baseValues);
    const secondKey = buildOutboundResponseDeduplicationKey({
      ...baseValues,
      requestId: "82a21d78-ecb7-431a-8888-903ba9df2fc5",
    });

    expect(secondKey).not.toBe(firstKey);
  });

  it("keeps email and WhatsApp idempotency namespaces separate", () => {
    const emailKey = buildOutboundResponseDeduplicationKey(baseValues);
    const whatsAppKey = buildOutboundResponseDeduplicationKey({
      ...baseValues,
      channel: "whatsapp",
      destination: "+34 600 123 123",
    });

    expect(emailKey.startsWith("email_response:")).toBe(true);
    expect(whatsAppKey.startsWith("whatsapp_response:")).toBe(true);
    expect(whatsAppKey).not.toBe(emailKey);
  });

  it("only allows responses for active operational case states", () => {
    expect(canSendResponseForInquiryStatus("new")).toBe(true);
    expect(canSendResponseForInquiryStatus("pending")).toBe(true);
    expect(canSendResponseForInquiryStatus("waiting_customer")).toBe(true);
    expect(canSendResponseForInquiryStatus("replied")).toBe(false);
    expect(canSendResponseForInquiryStatus("closed")).toBe(false);
    expect(canSendResponseForInquiryStatus("discarded")).toBe(false);
  });

  it("preserves definite provider failures and treats network errors as unknown", () => {
    const definiteFailure = new OutboundProviderError(
      "Solicitud rechazada.",
      "failed"
    );

    expect(getOutboundProviderError(definiteFailure, "Fallback")).toBe(
      definiteFailure
    );

    const networkFailure = getOutboundProviderError(
      new TypeError("fetch failed"),
      "Fallback"
    );

    expect(networkFailure.deliveryStatus).toBe("unknown");
    expect(networkFailure.message).toBe("fetch failed");
  });

  it("treats ambiguous HTTP failures as unknown delivery state", () => {
    expect(getHttpProviderDeliveryFailureStatus(400)).toBe("failed");
    expect(getHttpProviderDeliveryFailureStatus(408)).toBe("unknown");
    expect(getHttpProviderDeliveryFailureStatus(429)).toBe("failed");
    expect(getHttpProviderDeliveryFailureStatus(500)).toBe("unknown");
    expect(getHttpProviderDeliveryFailureStatus(503)).toBe("unknown");
  });
});
