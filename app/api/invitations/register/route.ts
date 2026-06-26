import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import {
  buildRequestBodyTooLargeResponse,
  readRequestJsonWithLimit,
  RequestBodyTooLargeError,
} from "../../../../lib/requestBodyLimits";
import { createAdminClient } from "../../../../lib/supabase/admin";

type InvitationRegistrationRequest = {
  token?: unknown;
  email?: unknown;
  fullName?: unknown;
  password?: unknown;
};

type InvitationRecord = {
  id: string;
  email: string;
  status: string;
  expires_at: string;
};

type InvitationRateLimitRow = {
  allowed: boolean;
  current_count: number;
  retry_after_seconds: number;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX_INVITATION_REGISTER_REQUEST_BODY_BYTES = 16 * 1024;

const INVITATION_REGISTER_IP_RATE_LIMIT_MAX_REQUESTS = 20;
const INVITATION_REGISTER_IP_RATE_LIMIT_WINDOW_SECONDS = 10 * 60;

const INVITATION_REGISTER_TOKEN_RATE_LIMIT_MAX_REQUESTS = 5;
const INVITATION_REGISTER_TOKEN_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;

function getStringField(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json(
    {
      ok: false,
      code,
      message,
    },
    { status },
  );
}

function jsonRateLimitedError(
  code: string,
  message: string,
  retryAfterSeconds: number,
) {
  return NextResponse.json(
    {
      ok: false,
      code,
      message,
      retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}

function isExpired(expiresAt: string) {
  const expirationDate = new Date(expiresAt);

  if (Number.isNaN(expirationDate.getTime())) {
    return true;
  }

  return expirationDate.getTime() <= Date.now();
}

function isDuplicateUserError(message: string) {
  const normalizedMessage = message.toLowerCase();

  return (
    normalizedMessage.includes("user already registered") ||
    normalizedMessage.includes("already registered") ||
    normalizedMessage.includes("already been registered") ||
    normalizedMessage.includes("already exists") ||
    normalizedMessage.includes("duplicate")
  );
}

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    const firstForwardedIp = forwardedFor
      .split(",")
      .map((value) => value.trim())
      .find(Boolean);

    if (firstForwardedIp) {
      return firstForwardedIp;
    }
  }

  return (
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-vercel-forwarded-for") ||
    "unknown"
  );
}

function hashRateLimitPart(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function buildInvitationRegisterIpBucketKey(request: Request) {
  const clientIp = getClientIp(request);

  return ["invitation-register", "ip", hashRateLimitPart(clientIp)].join(":");
}

function buildInvitationRegisterTokenBucketKey(request: Request, token: string) {
  const clientIp = getClientIp(request);

  return [
    "invitation-register",
    "token",
    hashRateLimitPart(token),
    hashRateLimitPart(clientIp),
  ].join(":");
}

async function checkInvitationRegisterRateLimit(
  supabase: ReturnType<typeof createAdminClient>,
  bucketKey: string,
  maxRequests: number,
  windowSeconds: number,
) {
  const { data, error } = await supabase.rpc("check_public_intake_rate_limit", {
    p_bucket_key: bucketKey,
    p_max_requests: maxRequests,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    throw new Error(
      `No se pudo comprobar el límite de altas por invitación: ${
        error.message || "sin detalle del error"
      }`,
    );
  }

  const rows = Array.isArray(data)
    ? (data as InvitationRateLimitRow[])
    : data
      ? ([data] as InvitationRateLimitRow[])
      : [];

  const rateLimit = rows[0];

  if (!rateLimit) {
    throw new Error(
      "No se recibió respuesta al comprobar el límite de altas por invitación.",
    );
  }

  return rateLimit;
}

export async function POST(request: Request) {
  let body: InvitationRegistrationRequest;

  try {
    body =
      await readRequestJsonWithLimit<InvitationRegistrationRequest>(
        request,
        MAX_INVITATION_REGISTER_REQUEST_BODY_BYTES,
      );
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return buildRequestBodyTooLargeResponse(error.maxBytes);
    }

    return jsonError(
      "INVALID_REQUEST_BODY",
      "La solicitud no tiene un formato válido.",
      400,
    );
  }

  const token = getStringField(body.token).trim();
  const email = normalizeEmail(getStringField(body.email));
  const fullName = getStringField(body.fullName).trim();
  const password = getStringField(body.password);

  const supabase = createAdminClient();

  try {
    const ipRateLimit = await checkInvitationRegisterRateLimit(
      supabase,
      buildInvitationRegisterIpBucketKey(request),
      INVITATION_REGISTER_IP_RATE_LIMIT_MAX_REQUESTS,
      INVITATION_REGISTER_IP_RATE_LIMIT_WINDOW_SECONDS,
    );

    if (!ipRateLimit.allowed) {
      return jsonRateLimitedError(
        "RATE_LIMITED",
        "Se han realizado demasiados intentos en poco tiempo. Inténtalo de nuevo dentro de unos minutos.",
        ipRateLimit.retry_after_seconds,
      );
    }
  } catch (error) {
    console.error("Could not check invitation register IP rate limit:", error);

    return jsonError(
      "RATE_LIMIT_CHECK_FAILED",
      "No se pudo comprobar el límite de intentos. Inténtalo de nuevo en unos minutos.",
      500,
    );
  }

  if (!token || !UUID_REGEX.test(token)) {
    return jsonError(
      "INVALID_INVITATION_TOKEN",
      "El enlace de invitación no es válido.",
      400,
    );
  }

  try {
    const tokenRateLimit = await checkInvitationRegisterRateLimit(
      supabase,
      buildInvitationRegisterTokenBucketKey(request, token),
      INVITATION_REGISTER_TOKEN_RATE_LIMIT_MAX_REQUESTS,
      INVITATION_REGISTER_TOKEN_RATE_LIMIT_WINDOW_SECONDS,
    );

    if (!tokenRateLimit.allowed) {
      return jsonRateLimitedError(
        "INVITATION_RATE_LIMITED",
        "Se han realizado demasiados intentos con esta invitación. Inténtalo de nuevo dentro de unos minutos.",
        tokenRateLimit.retry_after_seconds,
      );
    }
  } catch (error) {
    console.error("Could not check invitation register token rate limit:", error);

    return jsonError(
      "RATE_LIMIT_CHECK_FAILED",
      "No se pudo comprobar el límite de intentos. Inténtalo de nuevo en unos minutos.",
      500,
    );
  }

  if (!email || !EMAIL_REGEX.test(email) || email.length > 254) {
    return jsonError(
      "INVALID_EMAIL",
      "Introduce el mismo email al que se envió la invitación.",
      400,
    );
  }

  if (!fullName) {
    return jsonError("FULL_NAME_REQUIRED", "Introduce tu nombre completo.", 400);
  }

  if (fullName.length > 120) {
    return jsonError(
      "FULL_NAME_TOO_LONG",
      "El nombre completo no puede superar los 120 caracteres.",
      400,
    );
  }

  if (!password || password.length < 6) {
    return jsonError(
      "PASSWORD_TOO_SHORT",
      "La contraseña debe tener al menos 6 caracteres.",
      400,
    );
  }

  if (password.length > 200) {
    return jsonError(
      "PASSWORD_TOO_LONG",
      "La contraseña es demasiado larga.",
      400,
    );
  }

  const { data: invitation, error: invitationError } = await supabase
    .from("company_invitations")
    .select("id, email, status, expires_at")
    .eq("token", token)
    .maybeSingle<InvitationRecord>();

  if (invitationError) {
    console.error("Invitation lookup failed:", invitationError);

    return jsonError(
      "INVITATION_LOOKUP_FAILED",
      "No se pudo validar la invitación.",
      500,
    );
  }

  if (!invitation) {
    return jsonError(
      "INVITATION_NOT_FOUND",
      "No se encontró la invitación.",
      404,
    );
  }

  if (invitation.status !== "pending") {
    return jsonError(
      "INVITATION_NOT_PENDING",
      "Esta invitación ya no está pendiente.",
      409,
    );
  }

  if (isExpired(invitation.expires_at)) {
    await supabase
      .from("company_invitations")
      .update({
        status: "expired",
        updated_at: new Date().toISOString(),
      })
      .eq("id", invitation.id)
      .eq("status", "pending");

    return jsonError(
      "INVITATION_EXPIRED",
      "Esta invitación ha caducado.",
      410,
    );
  }

  const invitationEmail = normalizeEmail(invitation.email);

  if (email !== invitationEmail) {
    return jsonError(
      "INVITATION_EMAIL_MISMATCH",
      "Debes usar el mismo email al que se envió la invitación.",
      403,
    );
  }

  const { error: createUserError } = await supabase.auth.admin.createUser({
    email: invitationEmail,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
    },
  });

  if (createUserError) {
    if (isDuplicateUserError(createUserError.message)) {
      return jsonError(
        "USER_ALREADY_EXISTS",
        "Ya existe una cuenta con este email. Inicia sesión para aceptar la invitación.",
        409,
      );
    }

    console.error("Invitation user creation failed:", createUserError);

    return jsonError(
      "USER_CREATION_FAILED",
      "No se pudo crear la cuenta de invitado.",
      500,
    );
  }

  return NextResponse.json(
    {
      ok: true,
      email: invitationEmail,
    },
    { status: 201 },
  );
}