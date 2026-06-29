import { NextResponse } from "next/server";

import {
  buildRequestBodyTooLargeResponse,
  readRequestJsonWithLimit,
  RequestBodyTooLargeError,
} from "../../../../lib/requestBodyLimits";
import { isValidOutboundRequestId } from "../../../../lib/outboundResponseReliability";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { createClient } from "../../../../lib/supabase/server";

export const runtime = "nodejs";

const MAX_RECONCILE_OUTBOUND_REQUEST_BODY_BYTES = 8 * 1024;
const MAX_PROVIDER_MESSAGE_ID_LENGTH = 500;

type ReconcileOutboundRequestBody = {
  outboundMessageId?: unknown;
  resolution?: unknown;
  providerMessageId?: unknown;
};

type VisibleOutboundMessageRow = {
  id: string;
  company_id: string;
  inquiry_id: string;
  status: string;
};

type ReconciledOutboundMessageRow = {
  outbound_message_id: string;
  outbound_status: string;
  inquiry_message_id: string | null;
  provider_message_id: string | null;
};

function isValidResolution(
  value: string
): value is "confirmed_sent" | "confirmed_not_sent" {
  return value === "confirmed_sent" || value === "confirmed_not_sent";
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  let body: ReconcileOutboundRequestBody;

  try {
    body = await readRequestJsonWithLimit<ReconcileOutboundRequestBody>(
      request,
      MAX_RECONCILE_OUTBOUND_REQUEST_BODY_BYTES
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

  const outboundMessageId =
    typeof body.outboundMessageId === "string"
      ? body.outboundMessageId.trim()
      : "";
  const resolution =
    typeof body.resolution === "string" ? body.resolution.trim() : "";
  const providerMessageId =
    typeof body.providerMessageId === "string"
      ? body.providerMessageId.trim()
      : "";

  if (
    !outboundMessageId ||
    !isValidOutboundRequestId(outboundMessageId)
  ) {
    return NextResponse.json(
      { error: "El identificador del envío no es válido." },
      { status: 400 }
    );
  }

  if (!isValidResolution(resolution)) {
    return NextResponse.json(
      { error: "La resolución solicitada no es válida." },
      { status: 400 }
    );
  }

  if (
    resolution === "confirmed_sent" &&
    (!providerMessageId ||
      providerMessageId.length > MAX_PROVIDER_MESSAGE_ID_LENGTH)
  ) {
    return NextResponse.json(
      {
        error:
          "Introduce el identificador del mensaje mostrado por el proveedor.",
      },
      { status: 400 }
    );
  }

  const { data: outboundMessage, error: outboundMessageError } = await supabase
    .from("outbound_messages")
    .select("id, company_id, inquiry_id, status")
    .eq("id", outboundMessageId)
    .maybeSingle<VisibleOutboundMessageRow>();

  if (outboundMessageError) {
    return NextResponse.json(
      { error: "No se pudo cargar el intento de envío." },
      { status: 500 }
    );
  }

  if (!outboundMessage) {
    return NextResponse.json(
      { error: "No se encontró el intento o no pertenece a tu empresa." },
      { status: 404 }
    );
  }

  if (outboundMessage.status !== "unknown") {
    return NextResponse.json(
      { error: "Este intento ya no necesita reconciliación." },
      { status: 409 }
    );
  }

  const supabaseAdmin = createAdminClient();
  const { data, error } = await supabaseAdmin
    .rpc("reconcile_outbound_message", {
      p_outbound_message_id: outboundMessage.id,
      p_company_id: outboundMessage.company_id,
      p_actor_user_id: user.id,
      p_resolution: resolution,
      p_provider_message_id: providerMessageId || null,
    })
    .single<ReconciledOutboundMessageRow>();

  if (error || !data) {
    console.error("Could not reconcile outbound message:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "No se pudo reconciliar el intento de envío.",
      },
      { status: 409 }
    );
  }

  return NextResponse.json({
    ok: true,
    outboundMessageId: data.outbound_message_id,
    status: data.outbound_status,
    inquiryMessageId: data.inquiry_message_id,
    providerMessageId: data.provider_message_id,
  });
}
