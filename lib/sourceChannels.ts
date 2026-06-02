export type SourceChannelOption = {
  value: string;
  label: string;
};

export const sourceChannelOptions: SourceChannelOption[] = [
  { value: "Email", label: "Email" },
  { value: "Teléfono", label: "Teléfono" },
  { value: "WhatsApp", label: "WhatsApp" },
  { value: "SMS", label: "SMS" },
  { value: "Formulario web", label: "Formulario web" },
  { value: "Chat web", label: "Chat web" },
  { value: "Instagram", label: "Instagram" },
  { value: "Facebook", label: "Facebook" },
  {
    value: "Perfil de Empresa de Google",
    label: "Perfil de Empresa de Google",
  },
  { value: "Presencial", label: "Presencial" },
  { value: "Portal externo", label: "Portal externo" },
  { value: "Otro", label: "Otro" },
];

const sourceChannelLabelsByKey: Record<string, string> = {
  email: "Email",
  e_mail: "Email",
  mail: "Email",
  correo: "Email",
  correo_electronico: "Email",

  phone: "Teléfono",
  telefono: "Teléfono",
  tel: "Teléfono",
  llamada: "Teléfono",

  whatsapp: "WhatsApp",
  whats_app: "WhatsApp",

  sms: "SMS",

  form: "Formulario web",
  formulario: "Formulario web",
  formulario_web: "Formulario web",
  web_form: "Formulario web",

  web_chat: "Chat web",
  chat_web: "Chat web",
  chat: "Chat web",

  instagram: "Instagram",
  facebook: "Facebook",

  google_business_profile: "Perfil de Empresa de Google",
  google_business: "Perfil de Empresa de Google",
  perfil_de_empresa_de_google: "Perfil de Empresa de Google",
  google: "Perfil de Empresa de Google",

  in_person: "Presencial",
  presencial: "Presencial",

  external_portal: "Portal externo",
  portal_externo: "Portal externo",
  portal: "Portal externo",

  other: "Otro",
  otro: "Otro",
};

function normalizeSourceChannelKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

export function formatSourceChannel(value: string | null | undefined) {
  const cleanValue = (value ?? "").trim();

  if (!cleanValue) {
    return "Canal no indicado";
  }

  const knownOption = sourceChannelOptions.find(
    (option) => option.value === cleanValue || option.label === cleanValue
  );

  if (knownOption) {
    return knownOption.label;
  }

  const normalizedKey = normalizeSourceChannelKey(cleanValue);

  return sourceChannelLabelsByKey[normalizedKey] ?? cleanValue;
}
export function normalizeSourceChannelValue(
  value: string | null | undefined,
  fallback = "Email"
) {
  const formattedChannel = formatSourceChannel(value);

  const matchingOption = sourceChannelOptions.find(
    (option) => option.value === formattedChannel
  );

  return matchingOption?.value ?? fallback;
}
