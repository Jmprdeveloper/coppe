const DEFAULT_ACKNOWLEDGEMENT =
  "Hola, gracias por contactar con {empresa}. Hemos recibido tu mensaje correctamente y nuestro equipo lo revisará lo antes posible.";

export function buildAutomaticAcknowledgementText({
  companyName,
  customMessage,
}: {
  companyName: string;
  customMessage?: string | null;
}) {
  const template = customMessage?.trim() || DEFAULT_ACKNOWLEDGEMENT;
  const safeCompanyName = companyName.trim() || "nuestro equipo";

  return template
    .replaceAll("{empresa}", safeCompanyName)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
}
