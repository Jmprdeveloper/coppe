import { NextResponse } from "next/server";

import { createAdminClient } from "../../../lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const checkedAt = new Date().toISOString();

  try {
    const supabaseAdmin = createAdminClient();
    const { error } = await supabaseAdmin
      .from("companies")
      .select("id")
      .limit(1);

    if (error) {
      throw error;
    }

    return NextResponse.json(
      {
        status: "ok",
        database: "ok",
        checkedAt,
        release:
          process.env.VERCEL_GIT_COMMIT_SHA ||
          process.env.COPPE_RELEASE ||
          "local",
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Health check failed:", error);

    return NextResponse.json(
      {
        status: "degraded",
        database: "unavailable",
        checkedAt,
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
