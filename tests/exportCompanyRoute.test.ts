import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  getCurrentCompany: vi.fn(),
  checkServerApiRateLimit: vi.fn(),
}));

vi.mock("../lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("../lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("../lib/currentCompany", () => ({
  getCurrentCompany: mocks.getCurrentCompany,
}));

vi.mock("../lib/serverApiRateLimit", () => ({
  checkServerApiRateLimit: mocks.checkServerApiRateLimit,
}));

import { GET } from "../app/api/privacy/export-company/route";

describe("company privacy export route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated exports", async () => {
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: null },
          error: null,
        })),
      },
    });

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.getCurrentCompany).not.toHaveBeenCalled();
  });

  it("allows only company owners to export tenant data", async () => {
    const supabase = {
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "user-1" } },
          error: null,
        })),
      },
    };

    mocks.createClient.mockResolvedValue(supabase);
    mocks.getCurrentCompany.mockResolvedValue({
      data: {
        id: "company-1",
        name: "Company",
        sector: "other",
        description: null,
        tone: null,
        language: "es",
        userRole: "member",
      },
      error: null,
    });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
