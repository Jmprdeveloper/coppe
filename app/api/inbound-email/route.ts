import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import {
  processInboundEmail,
  type InboundEmailRequestBody,
} from "../../../lib/inboundEmailProcessing";
import {
  buildRequestBodyTooLargeResponse,
  readRequestJsonWithLimit,
  RequestBodyTooLargeError,
} from "../../../lib/requestBodyLimits";

export const runtime = "nodejs";

const MAX_INBOUND_EMAIL_REQUEST_BODY_BYTES = 64 * 1024;

function getEmailWebhookSecret() {
  return process.env.INBOUND_EMAIL_WEBHOOK_SECRET?.trim() ?? "";
}

function getBearerToken(request: Request) {
  const authorizationHeader = request.headers.get("authorization") ?? "";

  if (!authorizationHeader.toLowerCase().startsWith("bearer ")) {
    return "";
  }

  return authorizationHeader.slice(7).trim();
}

function timingSafeTextEqual(value: string, expectedValue: string) {
  if (!value || !expectedValue) {
    return false;
  }

  const valueBuffer = Buffer.from(value, "utf8");
  const expectedValueBuffer = Buffer.from(expectedValue, "utf8");

  if (valueBuffer.length !== expectedValueBuffer.length) {
    return false;
  }

  return timingSafeEqual(valueBuffer, expectedValueBuffer);
}

function isAuthorizedInboundEmailRequest(request: Request) {
  const expectedSecret = getEmailWebhookSecret();

  if (!expectedSecret) {
    return false;
  }

  const headerSecret =
    request.headers.get("x-coppe-inbound-email-secret")?.trim() ?? "";
  const bearerToken = getBearerToken(request);

  return (
    timingSafeTextEqual(headerSecret, expectedSecret) ||
    timingSafeTextEqual(bearerToken, expectedSecret)
  );
}

export async function POST(request: Request) {
  if (!isAuthorizedInboundEmailRequest(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  let body: InboundEmailRequestBody;

  try {
    body = await readRequestJsonWithLimit<InboundEmailRequestBody>(
      request,
      MAX_INBOUND_EMAIL_REQUEST_BODY_BYTES
    );
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return buildRequestBodyTooLargeResponse(error.maxBytes);
    }

    return NextResponse.json(
      { error: "El cuerpo de la petición no es válido." },
      { status: 400 }
    );
  }

  const result = await processInboundEmail(body);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      duplicate: result.duplicate,
      inquiryId: result.inquiryId,
      message: result.message,
    },
    { status: result.status }
  );
}