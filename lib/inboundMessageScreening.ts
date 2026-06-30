export type InboundScreeningClassification =
  | "legitimate"
  | "spam"
  | "commercial_solicitation"
  | "automated"
  | "rate_limited"
  | "blocked_sender";

export type InboundScreeningResult = {
  classification: InboundScreeningClassification;
  score: number;
  reasons: string[];
  shouldQuarantine: boolean;
};

type ScreenInboundMessageInput = {
  senderKey?: string | null;
  subject?: string | null;
  body: string;
  senderRule?: "allow" | "block" | null;
  rateLimited?: boolean;
};

const COMMERCIAL_PATTERNS = [
  /\bseo\b/i,
  /\bbacklinks?\b/i,
  /\bguest posts?\b/i,
  /\blead generation\b/i,
  /\bmarketing agency\b/i,
  /\bposicionamiento web\b/i,
  /\bprimera página de google\b/i,
  /\bcomprar seguidores\b/i,
  /\bcasino\b/i,
  /\bcrypto(?:currency|monedas?)?\b/i,
  /\binvestment opportunity\b/i,
  /\boferta comercial\b/i,
  /\bservicios de captación\b/i,
  /\bbase de datos de empresas\b/i,
];

const STRONG_COMMERCIAL_PATTERNS = [
  /\b(?:queremos|quisiera|querr[ií]a|me gustar[ií]a)\s+ofrecer(?:te|les|os)?\s+(?:nuestros|mis)\s+servicios\b/i,
  /\b(?:we|i)\s+(?:help|helped)\s+(?:companies|businesses)\b/i,
  /\bi (?:just )?wanted to reach out\b/i,
  /\bhe visto (?:vuestra|tu) (?:web|página)\b/i,
  /\bpodemos ayudaros? a (?:conseguir|captar|generar)\b/i,
  /\bagendar una (?:llamada|reunión) para (?:mostrar|presentar)\b/i,
];

const SPAM_PATTERNS = [
  /\bclick here\b/i,
  /\bact now\b/i,
  /\bgan[aá] dinero r[aá]pido\b/i,
  /\bfree money\b/i,
  /\bclaim (?:your )?(?:prize|reward)\b/i,
  /\bpassword (?:has been )?compromised\b/i,
  /\burgent transfer\b/i,
];

const AUTOMATED_SENDER_PATTERNS = [
  /^mailer-daemon@/i,
  /^postmaster@/i,
  /^no-?reply@/i,
  /^donotreply@/i,
];

const AUTOMATED_BODY_PATTERNS = [
  /\bout of office\b/i,
  /\brespuesta autom[aá]tica\b/i,
  /\bdelivery status notification\b/i,
  /\bundeliver(?:ed|able)\b/i,
  /\bmail delivery failed\b/i,
];

function countUrls(value: string) {
  return value.match(/https?:\/\/|www\./gi)?.length ?? 0;
}

function normalizeScore(score: number) {
  return Math.min(Math.max(Math.round(score), 0), 100);
}

export function screenInboundMessage({
  senderKey,
  subject,
  body,
  senderRule,
  rateLimited = false,
}: ScreenInboundMessageInput): InboundScreeningResult {
  if (senderRule === "allow") {
    return {
      classification: "legitimate",
      score: 0,
      reasons: ["Remitente permitido manualmente"],
      shouldQuarantine: false,
    };
  }

  if (senderRule === "block") {
    return {
      classification: "blocked_sender",
      score: 100,
      reasons: ["Remitente bloqueado manualmente"],
      shouldQuarantine: true,
    };
  }

  if (rateLimited) {
    return {
      classification: "rate_limited",
      score: 100,
      reasons: ["Volumen anómalo de mensajes del mismo remitente"],
      shouldQuarantine: true,
    };
  }

  const content = `${subject ?? ""}\n${body}`.trim();
  const cleanSender = senderKey?.trim() ?? "";
  const reasons: string[] = [];

  if (
    AUTOMATED_SENDER_PATTERNS.some((pattern) => pattern.test(cleanSender)) ||
    AUTOMATED_BODY_PATTERNS.some((pattern) => pattern.test(content))
  ) {
    return {
      classification: "automated",
      score: 90,
      reasons: ["Mensaje automático o notificación técnica detectada"],
      shouldQuarantine: true,
    };
  }

  const commercialMatches = COMMERCIAL_PATTERNS.filter((pattern) =>
    pattern.test(content),
  ).length;
  const strongCommercialMatches = STRONG_COMMERCIAL_PATTERNS.filter((pattern) =>
    pattern.test(content),
  ).length;
  const spamMatches = SPAM_PATTERNS.filter((pattern) =>
    pattern.test(content),
  ).length;
  const urlCount = countUrls(content);

  let spamScore = spamMatches * 35;
  const commercialScore =
    commercialMatches * 30 + strongCommercialMatches * 60;

  if (urlCount >= 3) {
    spamScore += 25;
    reasons.push("Incluye numerosos enlaces");
  }

  if (commercialMatches > 0 || strongCommercialMatches > 0) {
    reasons.push("Contiene una oferta comercial no solicitada");
  }

  if (spamMatches > 0) {
    reasons.push("Contiene patrones frecuentes de spam");
  }

  if (content.length > 0) {
    const uppercaseLetters = content.match(/[A-ZÁÉÍÓÚÜÑ]/g)?.length ?? 0;
    const letters = content.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g)?.length ?? 0;

    if (letters >= 40 && uppercaseLetters / letters > 0.65) {
      spamScore += 15;
      reasons.push("Uso anómalo de mayúsculas");
    }
  }

  if (spamScore >= 60) {
    return {
      classification: "spam",
      score: normalizeScore(spamScore),
      reasons,
      shouldQuarantine: true,
    };
  }

  if (commercialScore >= 45) {
    return {
      classification: "commercial_solicitation",
      score: normalizeScore(commercialScore),
      reasons,
      shouldQuarantine: true,
    };
  }

  return {
    classification: "legitimate",
    score: normalizeScore(Math.max(spamScore, commercialScore)),
    reasons,
    shouldQuarantine: false,
  };
}
