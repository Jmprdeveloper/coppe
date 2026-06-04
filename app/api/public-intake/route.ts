import { NextResponse } from "next/server";

import { getCustomerDatabaseErrorMessage } from "../../../lib/customerValidation";
import {
  isValidEmail,
  isValidPhone,
  normalizePhoneForComparison,
} from "../../../lib/customerValidation";
import { MAX_ANALYSIS_MESSAGE_LENGTH } from "../../../lib/inquiryAnalysisLimits";
import { analyzeInquiryForCompany } from "../../../lib/inquiryAnalysisService";
import { createAdminClient } from "../../../lib/supabase/admin";

type PublicIntakeRequestBody = {
  publicIntakeToken?: string;
  token?: string;
  customerName?: string;
  email?: string;
  phone?: string;
  message?: string;
};

type PublicIntakeCompany = {
  id: string;
  name: string;
  sector: string;
  description: string | null;
  tone: string | null;
  language: string | null;
  public_intake_enabled: boolean;
};

type PublicIntakeAnalysis = Awaited<ReturnType<typeof analyzeInquiryForCompany>>;

type CustomerRow = {
  id: string;
  company_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  language: string | null;
  status: string;
  last_interaction_at: string | null;
  created_at: string;
};

function buildFallbackSubject(message: string) {
  const firstLine = message
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) {
    return "Nuevo mensaje recibido desde formulario web";
  }

  if (firstLine.length <= 80) {
    return firstLine;
  }

  return `${firstLine.slice(0, 77)}...`;
}

function buildFallbackAnalysis(
  customerName: string,
  message: string,
  company: PublicIntakeCompany
): PublicIntakeAnalysis {
  const language = company.language === "en" ? "en" : "es";
  const subject = buildFallbackSubject(message);

  return {
    language,
    category: "general_info",
    priority: "medium",
    summary: `${customerName} ha enviado un mensaje a través del formulario web.`,
    intent: "Mensaje recibido desde el formulario web público.",
    missingInformation: [],
    recommendedAction:
      "Revisar el mensaje y responder al cliente desde el canal adecuado.",
    suggestedResponse: `Hola ${customerName}, gracias por contactar con ${company.name}. Hemos recibido tu mensaje y lo revisaremos lo antes posible.`,
    subject,
  };
}

async function findExistingCustomer(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  companyId: string,
  email: string,
  phone: string
) {
  if (email) {
    const { data, error } = await supabaseAdmin
      .from("customers")
      .select(
        "id, company_id, name, email, phone, language, status, last_interaction_at, created_at"
      )
      .eq("company_id", companyId)
      .eq("email", email)
      .limit(1)
      .maybeSingle<CustomerRow>();

    if (error) {
      throw new Error(
        `No se pudo comprobar si el cliente ya existe por email: ${
          error.message || "sin detalle del error"
        }`
      );
    }

    if (data) {
      return data;
    }
  }

  if (!phone) {
    return null;
  }

  const normalizedPhone = normalizePhoneForComparison(phone);

  const { data, error } = await supabaseAdmin
    .from("customers")
    .select(
      "id, company_id, name, email, phone, language, status, last_interaction_at, created_at"
    )
    .eq("company_id", companyId);

  if (error) {
    throw new Error(
      `No se pudo comprobar si el cliente ya existe por teléfono: ${
        error.message || "sin detalle del error"
      }`
    );
  }

  return (
    ((data ?? []) as CustomerRow[]).find((customer) => {
      return normalizePhoneForComparison(customer.phone) === normalizedPhone;
    }) ?? null
  );
}

export async function POST(request: Request) {
  const supabaseAdmin = createAdminClient();

  let body: PublicIntakeRequestBody;

  try {
    body = (await request.json()) as PublicIntakeRequestBody;
  } catch {
    return NextResponse.json(
      { error: "El cuerpo de la petición no es válido." },
      { status: 400 }
    );
  }

  const publicIntakeToken =
    typeof body.publicIntakeToken === "string"
      ? body.publicIntakeToken.trim()
      : typeof body.token === "string"
        ? body.token.trim()
        : "";

  const customerName =
    typeof body.customerName === "string" ? body.customerName.trim() : "";

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  const phone = typeof body.phone === "string" ? body.phone.trim() : "";

  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!publicIntakeToken) {
    return NextResponse.json(
      { error: "Falta el identificador público del formulario." },
      { status: 400 }
    );
  }

  if (!customerName) {
    return NextResponse.json(
      { error: "El nombre del cliente es obligatorio." },
      { status: 400 }
    );
  }

  if (!email && !phone) {
    return NextResponse.json(
      {
        error:
          "Introduce al menos un email o un teléfono para poder contactar con el cliente.",
      },
      { status: 400 }
    );
  }

  if (email && !isValidEmail(email)) {
    return NextResponse.json(
      { error: "El email no tiene un formato válido." },
      { status: 400 }
    );
  }

  if (phone && !isValidPhone(phone)) {
    return NextResponse.json(
      { error: "El teléfono no tiene un formato válido." },
      { status: 400 }
    );
  }

  if (!message) {
    return NextResponse.json(
      { error: "El mensaje es obligatorio." },
      { status: 400 }
    );
  }

  if (message.length > MAX_ANALYSIS_MESSAGE_LENGTH) {
    return NextResponse.json(
      {
        error: `El mensaje no puede superar los ${MAX_ANALYSIS_MESSAGE_LENGTH} caracteres.`,
      },
      { status: 400 }
    );
  }

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select(
      "id, name, sector, description, tone, language, public_intake_enabled"
    )
    .eq("public_intake_token", publicIntakeToken)
    .maybeSingle<PublicIntakeCompany>();

  if (companyError) {
    return NextResponse.json(
      {
        error: `No se pudo cargar la empresa asociada al formulario: ${
          companyError.message || "sin detalle del error"
        }`,
      },
      { status: 500 }
    );
  }

  if (!company) {
    return NextResponse.json(
      { error: "El formulario público no existe o ya no está disponible." },
      { status: 404 }
    );
  }

  if (!company.public_intake_enabled) {
    return NextResponse.json(
      { error: "Este formulario público no está activo en este momento." },
      { status: 403 }
    );
  }

  const now = new Date().toISOString();

  let customer: CustomerRow | null = null;

  try {
    customer = await findExistingCustomer(
      supabaseAdmin,
      company.id,
      email,
      phone
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo comprobar si el cliente ya existe.",
      },
      { status: 500 }
    );
  }

  if (customer) {
    const customerUpdates: Partial<CustomerRow> = {
      last_interaction_at: now,
    };

    if (!customer.email && email) {
      customerUpdates.email = email;
    }

    if (!customer.phone && phone) {
      customerUpdates.phone = phone;
    }

    if (!customer.language) {
      customerUpdates.language = company.language ?? "es";
    }

    const { data: updatedCustomer, error: updateCustomerError } =
      await supabaseAdmin
        .from("customers")
        .update(customerUpdates)
        .eq("id", customer.id)
        .select(
          "id, company_id, name, email, phone, language, status, last_interaction_at, created_at"
        )
        .single<CustomerRow>();

    if (updateCustomerError || !updatedCustomer) {
      return NextResponse.json(
        {
          error: `No se pudo actualizar el cliente existente: ${
            updateCustomerError?.message || "sin detalle del error"
          }`,
        },
        { status: 500 }
      );
    }

    customer = updatedCustomer;
  } else {
    const { data: createdCustomer, error: createCustomerError } =
      await supabaseAdmin
        .from("customers")
        .insert({
          company_id: company.id,
          name: customerName,
          email: email || null,
          phone: phone || null,
          language: company.language ?? "es",
          status: "new",
          last_interaction_at: now,
        })
        .select(
          "id, company_id, name, email, phone, language, status, last_interaction_at, created_at"
        )
        .single<CustomerRow>();

    if (createCustomerError || !createdCustomer) {
      return NextResponse.json(
        {
          error: `No se pudo crear el cliente: ${getCustomerDatabaseErrorMessage(
            createCustomerError?.message ?? ""
          )}`,
        },
        { status: 500 }
      );
    }

    customer = createdCustomer;
  }

  let analysis = buildFallbackAnalysis(customerName, message, company);

  try {
    analysis = await analyzeInquiryForCompany({
      customerName,
      message,
      company,
    });
  } catch (error) {
    console.error("Public intake analysis fallback used:", error);
  }

  const { data: createdInquiry, error: createInquiryError } =
    await supabaseAdmin
      .from("inquiries")
      .insert({
        company_id: company.id,
        customer_id: customer.id,
        customer_name: customer.name || customerName,
        source_channel: "Formulario web",
        subject: analysis.subject,
        original_message: message,
        ai_summary: analysis.summary,
        ai_intent: analysis.intent,
        ai_category: analysis.category,
        ai_priority: analysis.priority,
        ai_language: analysis.language,
        sentiment: "neutral",
        missing_information: analysis.missingInformation,
        recommended_action: analysis.recommendedAction,
        suggested_response: analysis.suggestedResponse,
        status: "new",
      })
      .select("id")
      .single<{ id: string }>();

  if (createInquiryError || !createdInquiry) {
    return NextResponse.json(
      {
        error: `No se pudo crear el caso: ${
          createInquiryError?.message || "sin detalle del error"
        }`,
      },
      { status: 500 }
    );
  }

  const { error: createMessageError } = await supabaseAdmin
    .from("inquiry_messages")
    .insert({
      company_id: company.id,
      inquiry_id: createdInquiry.id,
      customer_id: customer.id,
      direction: "inbound",
      author_type: "customer",
      body: message,
      source_channel: "Formulario web",
    });

  if (createMessageError) {
    return NextResponse.json(
      {
        error: `El caso se creó, pero no se pudo guardar el mensaje inicial: ${
          createMessageError.message || "sin detalle del error"
        }`,
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      inquiryId: createdInquiry.id,
      message: "Mensaje recibido correctamente.",
    },
    { status: 201 }
  );
}