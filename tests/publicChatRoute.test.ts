import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  checkServerApiRateLimit: vi.fn(),
}));

vi.mock("../lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("../lib/serverApiRateLimit", () => ({
  checkServerApiRateLimit: mocks.checkServerApiRateLimit,
}));

import {
  GET,
  POST,
} from "../app/api/public-chat/route";

describe("public chat route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not query storage without a conversation token", async () => {
    const response = await GET(
      new Request("http://localhost/api/public-chat")
    );

    expect(response.status).toBe(400);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("rejects follow-up messages without a conversation token", async () => {
    const response = await POST(
      new Request("http://localhost/api/public-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "Hola",
        }),
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.checkServerApiRateLimit).not.toHaveBeenCalled();
  });

  it("accepts honeypot submissions without exposing whether a token exists", async () => {
    const response = await POST(
      new Request("http://localhost/api/public-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          companyWebsite: "https://spam.example",
          message: "spam",
        }),
      })
    );

    expect(response.status).toBe(201);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
