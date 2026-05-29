import { NextResponse } from "next/server";

import { analyzeInquiryForCompany } from "../../../../lib/inquiryAnalysisService";
import { type CurrentCompany } from "../../../../lib/currentCompany";
import { createClient } from "../../../../lib/supabase/server";

type AnalyzeInquiryRequestBody = {
  customerName?: unknown;
  message?: unknown;
};

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: "No autorizado." },
      { status: 401 }
    );
  }

  let body: AnalyzeInquiryRequestBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "El cuerpo de la petición no es válido." },
      { status: 400 }
    );
  }

  const customerName =
    typeof body.customerName === "string" ? body.customerName.trim() : "";

  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!customerName) {
    return NextResponse.json(
      { error: "El nombre del cliente es obligatorio." },
      { status: 400 }
    );
  }

  if (!message) {
    return NextResponse.json(
      { error: "El mensaje de la consulta es obligatorio." },
      { status: 400 }
    );
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, name, sector, description, tone, language")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<CurrentCompany>();

  if (companyError) {
    return NextResponse.json(
      {
        error: `No se pudo cargar la empresa asociada al usuario: ${
          companyError.message || "sin detalle del error"
        }`,
      },
      { status: 500 }
    );
  }

  if (!company) {
    return NextResponse.json(
      { error: "No hay ninguna empresa asociada al usuario." },
      { status: 404 }
    );
  }

  try {
    const analysis = await analyzeInquiryForCompany({
      customerName,
      message,
      company,
    });

    return NextResponse.json({ analysis });
  } catch (error) {
    console.error("Unexpected inquiry analysis error:", error);

    return NextResponse.json(
      {
        error:
          "No se pudo preparar el análisis de la consulta. Inténtalo de nuevo en unos segundos.",
      },
      { status: 500 }
    );
  }
}
