import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { MAX_ANALYSIS_MESSAGE_LENGTH } from "../../../lib/inquiryAnalysisLimits";
import {
  buildRequestBodyTooLargeResponse,
  readRequestJsonWithLimit,
  RequestBodyTooLargeError,
} from "../../../lib/requestBodyLimits";
import { checkServerApiRateLimit } from "../../../lib/serverApiRateLimit";
import { createAdminClient } from "../../../lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_PUBLIC_CHAT_REQUEST_BODY_BYTES = 16 * 1024;

type PublicChatSessionRow = {
  id: string;
  company_id: string;
  inquiry_id: string;
  customer_id: string;
  expires_at: string;
};

type PublicChatMessageRow = {
  id: string;
  direction: string;
  author_type: string;
  body: string;
  created_at: string;
};

type PublicChatPostBody = {
  conversationToken?: unknown;
  message?: unknown;
  companyWebsite?: unknown;
};

function hashConversationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function findChatSession(token: string) {
  if (token.length < 32 || token.length > 200) {
    return null;
  }

  const supabaseAdmin = createAdminClient();
  const { data, error } = await supabaseAdmin
    .from("public_chat_sessions")
    .select("id, company_id, inquiry_id, customer_id, expires_at")
    .eq("token_hash", hashConversationToken(token))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle<PublicChatSessionRow>();

  if (error) {
    throw new Error(
      `No se pudo cargar la conversación pública: ${
        error.message || "sin detalle del error"
      }`
    );
  }

  return data;
}

async function checkChatRateLimit(
  conversationToken: string,
  action: "read" | "write",
  maxRequests: number
) {
  return checkServerApiRateLimit(createAdminClient(), {
    bucketKey: `public-chat:${action}:${hashConversationToken(
      conversationToken
    )}`,
    maxRequests,
    windowSeconds: 10 * 60,
  });
}

async function loadVisibleMessages(session: PublicChatSessionRow) {
  const supabaseAdmin = createAdminClient();
  const { data, error } = await supabaseAdmin
    .from("inquiry_messages")
    .select("id, direction, author_type, body, created_at")
    .eq("company_id", session.company_id)
    .eq("inquiry_id", session.inquiry_id)
    .in("author_type", ["customer", "company"])
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) {
    throw new Error(
      `No se pudieron cargar los mensajes del chat: ${
        error.message || "sin detalle del error"
      }`
    );
  }

  return (data ?? []) as PublicChatMessageRow[];
}

export async function GET(request: Request) {
  const conversationToken =
    new URL(request.url).searchParams.get("conversationToken")?.trim() ?? "";

  if (!conversationToken) {
    return NextResponse.json(
      { error: "Falta el token de conversación." },
      { status: 400 }
    );
  }

  try {
    const rateLimit = await checkChatRateLimit(
      conversationToken,
      "read",
      150
    );

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Demasiadas actualizaciones del chat." },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retry_after_seconds),
          },
        }
      );
    }

    const session = await findChatSession(conversationToken);

    if (!session) {
      return NextResponse.json(
        { error: "La conversación no existe o ha caducado." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        messages: await loadVisibleMessages(session),
        expiresAt: session.expires_at,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Could not load public chat:", error);

    return NextResponse.json(
      { error: "No se pudo actualizar la conversación." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let body: PublicChatPostBody;

  try {
    body = await readRequestJsonWithLimit<PublicChatPostBody>(
      request,
      MAX_PUBLIC_CHAT_REQUEST_BODY_BYTES
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

  const conversationToken =
    typeof body.conversationToken === "string"
      ? body.conversationToken.trim()
      : "";
  const message =
    typeof body.message === "string" ? body.message.trim() : "";
  const honeypot =
    typeof body.companyWebsite === "string"
      ? body.companyWebsite.trim()
      : "";

  if (honeypot) {
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  if (!conversationToken) {
    return NextResponse.json(
      { error: "Falta el token de conversación." },
      { status: 400 }
    );
  }

  if (!message || message.length > MAX_ANALYSIS_MESSAGE_LENGTH) {
    return NextResponse.json(
      {
        error: `El mensaje debe tener entre 1 y ${MAX_ANALYSIS_MESSAGE_LENGTH} caracteres.`,
      },
      { status: 400 }
    );
  }

  try {
    const rateLimit = await checkChatRateLimit(
      conversationToken,
      "write",
      20
    );

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Has enviado demasiados mensajes en poco tiempo." },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retry_after_seconds),
          },
        }
      );
    }

    const session = await findChatSession(conversationToken);

    if (!session) {
      return NextResponse.json(
        { error: "La conversación no existe o ha caducado." },
        { status: 404 }
      );
    }

    const supabaseAdmin = createAdminClient();
    const { error } = await supabaseAdmin.rpc("append_public_chat_message", {
      p_token_hash: hashConversationToken(conversationToken),
      p_body: message,
    });

    if (error) {
      throw error;
    }

    return NextResponse.json(
      {
        ok: true,
        messages: await loadVisibleMessages(session),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Could not append public chat message:", error);

    return NextResponse.json(
      { error: "No se pudo enviar el mensaje al chat." },
      { status: 500 }
    );
  }
}
