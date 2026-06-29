import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
}));

vi.mock("../lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { GET } from "../app/api/health/route";

describe("health route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports a healthy database without caching the response", async () => {
    const query = {
      select: vi.fn(() => query),
      limit: vi.fn(async () => ({ data: [], error: null })),
    };

    mocks.createAdminClient.mockReturnValue({
      from: vi.fn(() => query),
    });

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({
      status: "ok",
      database: "ok",
    });
  });

  it("returns 503 without leaking database details", async () => {
    const query = {
      select: vi.fn(() => query),
      limit: vi.fn(async () => ({
        data: null,
        error: { message: "sensitive connection detail" },
      })),
    };

    mocks.createAdminClient.mockReturnValue({
      from: vi.fn(() => query),
    });

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual(
      expect.objectContaining({
        status: "degraded",
        database: "unavailable",
      })
    );
    expect(JSON.stringify(payload)).not.toContain("sensitive");
  });
});
