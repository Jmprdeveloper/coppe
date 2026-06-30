import { NextResponse } from "next/server";

import {
  buildRequestBodyTooLargeResponse,
  readRequestJsonWithLimit,
  RequestBodyTooLargeError,
} from "../../../lib/requestBodyLimits";
import { createClient } from "../../../lib/supabase/server";

export const runtime = "nodejs";

type DemoSessionRequestBody = {
  accessToken?: unknown;
  refreshToken?: unknown;
};

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  const tokenHash = new URL(request.url).searchParams
    .get("token_hash")
    ?.trim();

  if (!tokenHash || !/^[a-f0-9]{32,128}$/i.test(tokenHash)) {
    return NextResponse.redirect(new URL("/demo/acceso?error=1", request.url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  });

  if (error) {
    console.error("Could not verify local demo link:", error);
    return NextResponse.redirect(new URL("/demo/acceso?error=1", request.url));
  }

  return NextResponse.redirect(new URL("/", request.url));
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  let body: DemoSessionRequestBody;

  try {
    body = await readRequestJsonWithLimit<DemoSessionRequestBody>(
      request,
      16 * 1024,
    );
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return buildRequestBodyTooLargeResponse(error.maxBytes);
    }

    return NextResponse.json({ error: "Petición no válida." }, { status: 400 });
  }

  const accessToken =
    typeof body.accessToken === "string" ? body.accessToken.trim() : "";
  const refreshToken =
    typeof body.refreshToken === "string" ? body.refreshToken.trim() : "";

  if (!accessToken || !refreshToken) {
    return NextResponse.json(
      { error: "Faltan las credenciales temporales." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error) {
    console.error("Could not establish local demo session:", error);
    return NextResponse.json(
      { error: "No se pudo establecer la sesión local." },
      { status: 401 },
    );
  }

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
