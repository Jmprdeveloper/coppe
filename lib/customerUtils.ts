import type { CustomerStatus } from "../types";

export function normalizeCustomerStatus(status: string): CustomerStatus {
  if (
    status === "active" ||
    status === "inactive" ||
    status === "archived"
  ) {
    return status;
  }

  return "active";
}
