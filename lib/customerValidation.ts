export function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }
  
  export function normalizePhoneForComparison(
    value: string | null | undefined
  ) {
    const digitsOnly = (value ?? "").replace(/\D/g, "");
  
    if (!digitsOnly) {
      return "";
    }
  
    if (/^0034\d{9}$/.test(digitsOnly)) {
      return digitsOnly.slice(4);
    }
  
    if (/^34\d{9}$/.test(digitsOnly)) {
      return digitsOnly.slice(2);
    }
  
    return digitsOnly;
  }
  
  export function isValidPhone(value: string) {
    const cleanValue = value.trim();
  
    if (!cleanValue) {
      return false;
    }
  
    if (!/^[+\d\s().-]+$/.test(cleanValue)) {
      return false;
    }
  
    const normalizedPhone = normalizePhoneForComparison(cleanValue);
  
    return normalizedPhone.length >= 7 && normalizedPhone.length <= 15;
  }
  
  export function getCustomerDatabaseErrorMessage(message: string) {
    if (message.includes("customers_company_email_unique")) {
      return "Ya existe un cliente con ese email en esta empresa.";
    }
  
    if (
      message.includes("customers_company_phone_digits_unique") ||
      message.includes("customers_company_phone_normalized_unique")
    ) {
      return "Ya existe un cliente con ese teléfono en esta empresa.";
    }
  
    if (message.includes("duplicate key")) {
      return "Ya existe un cliente con esos datos en esta empresa.";
    }
  
    return message || "sin detalle del error";
  }