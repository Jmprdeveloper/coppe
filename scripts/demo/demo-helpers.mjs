import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

export const DEMO_COMPANY_NAME = "Hotel Costa Azul — Demo COPPE";
export const DEMO_OWNER_EMAIL = "responsable.demo@coppe.es";
export const DEMO_MEMBER_EMAIL = "recepcion.demo@coppe.es";

export const DEMO_IDS = {
  customers: Array.from(
    { length: 12 },
    (_, index) =>
      `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`
  ),
  inquiries: Array.from(
    { length: 10 },
    (_, index) =>
      `22222222-2222-4222-8222-${String(index + 1).padStart(12, "0")}`
  ),
  messages: Array.from(
    { length: 24 },
    (_, index) =>
      `33333333-3333-4333-8333-${String(index + 1).padStart(12, "0")}`
  ),
  followUps: Array.from(
    { length: 5 },
    (_, index) =>
      `44444444-4444-4444-8444-${String(index + 1).padStart(12, "0")}`
  ),
  appointments: Array.from(
    { length: 4 },
    (_, index) =>
      `55555555-5555-4555-8555-${String(index + 1).padStart(12, "0")}`
  ),
  notes: Array.from(
    { length: 4 },
    (_, index) =>
      `66666666-6666-4666-8666-${String(index + 1).padStart(12, "0")}`
  ),
  auditLogs: Array.from(
    { length: 6 },
    (_, index) =>
      `77777777-7777-4777-8777-${String(index + 1).padStart(12, "0")}`
  ),
};

function parseEnvFile(content) {
  return Object.fromEntries(
    content
      .split(/\r?\n/)
      .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        const key = line.slice(0, separatorIndex);
        const rawValue = line.slice(separatorIndex + 1).trim();
        const value = rawValue.replace(/^['"]|['"]$/g, "");

        return [key, value];
      })
  );
}

export function loadDemoEnvironment() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  const fileEnvironment = fs.existsSync(envPath)
    ? parseEnvFile(fs.readFileSync(envPath, "utf8"))
    : {};
  const environment = {
    ...fileEnvironment,
    ...process.env,
  };
  const supabaseUrl = environment.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey =
    environment.SUPABASE_SECRET_KEY ||
    environment.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !secretKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY en .env.local."
    );
  }

  return {
    environment,
    supabaseUrl,
    secretKey,
  };
}

export function createDemoAdminClient() {
  const { supabaseUrl, secretKey } = loadDemoEnvironment();

  return createClient(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function ensureDemoUser(
  admin,
  { email, fullName, roleLabel }
) {
  let page = 1;

  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 100,
    });

    if (error) {
      throw new Error(`No se pudieron consultar usuarios: ${error.message}`);
    }

    const matchingUser = data.users.find(
      (user) => user.email?.toLowerCase() === email.toLowerCase()
    );

    if (matchingUser) {
      const { data: updatedData, error: updateError } =
        await admin.auth.admin.updateUserById(matchingUser.id, {
          email_confirm: true,
          user_metadata: {
            ...matchingUser.user_metadata,
            full_name: fullName,
            demo_role: roleLabel,
          },
        });

      if (updateError) {
        throw new Error(
          `No se pudo actualizar ${email}: ${updateError.message}`
        );
      }

      return updatedData.user;
    }

    if (data.users.length < 100) {
      break;
    }

    page += 1;
  }

  const generatedPassword = `${crypto.randomUUID()}!aA1`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: generatedPassword,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      demo_role: roleLabel,
    },
  });

  if (error || !data.user) {
    throw new Error(
      `No se pudo crear ${email}: ${error?.message ?? "respuesta vacía"}`
    );
  }

  return data.user;
}

export async function getDemoContext(admin) {
  const { data: company, error: companyError } = await admin
    .from("companies")
    .select(
      "id, name, sector, description, tone, language, public_intake_token"
    )
    .eq("name", DEMO_COMPANY_NAME)
    .maybeSingle();

  if (companyError) {
    throw new Error(
      `No se pudo consultar la empresa demo: ${companyError.message}`
    );
  }

  if (!company) {
    throw new Error(
      `No existe "${DEMO_COMPANY_NAME}". Ejecuta primero npm run demo:seed.`
    );
  }

  const { data: usersData, error: usersError } =
    await admin.auth.admin.listUsers({
      page: 1,
      perPage: 100,
    });

  if (usersError) {
    throw new Error(`No se pudieron consultar usuarios: ${usersError.message}`);
  }

  const owner = usersData.users.find(
    (user) => user.email?.toLowerCase() === DEMO_OWNER_EMAIL.toLowerCase()
  );
  const member = usersData.users.find(
    (user) => user.email?.toLowerCase() === DEMO_MEMBER_EMAIL.toLowerCase()
  );

  if (!owner || !member) {
    throw new Error(
      "Faltan los usuarios de demostración. Ejecuta npm run demo:seed."
    );
  }

  return {
    company,
    owner,
    member,
  };
}

export function isoAtOffset(days, hour = 10, minute = 0) {
  const value = new Date();

  value.setHours(hour, minute, 0, 0);
  value.setDate(value.getDate() + days);

  return value.toISOString();
}

export async function upsertRows(admin, table, rows) {
  const { error } = await admin.from(table).upsert(rows, {
    onConflict: "id",
  });

  if (error) {
    throw new Error(`Error preparando ${table}: ${error.message}`);
  }
}

export async function countDemoRows(admin, table, ids) {
  const { count, error } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .in("id", ids);

  if (error) {
    throw new Error(`Error verificando ${table}: ${error.message}`);
  }

  return count ?? 0;
}
