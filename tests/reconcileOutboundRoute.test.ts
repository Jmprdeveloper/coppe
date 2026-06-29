import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("../lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("../lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { POST } from "../app/api/inquiries/reconcile-outbound/route";

const outboundMessageId = "a480aa1b-67ce-48b3-a021-e6223d67b24a";

function createRequest(body: unknown) {
  return new Request("http://localhost/api/inquiries/reconcile-outbound", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function createVisibleOutboundQuery(
  result: {
    data: unknown;
    error: { message: string } | null;
  }
) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
  };

  return query;
}

describe("reconcile outbound route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated reconciliation", async () => {
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: null },
          error: null,
        })),
      },
    });

    const response = await POST(
      createRequest({
        outboundMessageId,
        resolution: "confirmed_not_sent",
      })
    );

    expect(response.status).toBe(401);
  });

  it("requires a provider id when delivery is confirmed", async () => {
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "user-1" } },
          error: null,
        })),
      },
    });

    const response = await POST(
      createRequest({
        outboundMessageId,
        resolution: "confirmed_sent",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain("identificador");
  });

  it("reconciles only an RLS-visible unknown delivery", async () => {
    const visibleOutboundQuery = createVisibleOutboundQuery({
      data: {
        id: outboundMessageId,
        company_id: "company-1",
        inquiry_id: "inquiry-1",
        status: "unknown",
      },
      error: null,
    });
    const rpcSingle = vi.fn(async () => ({
      data: {
        outbound_message_id: outboundMessageId,
        outbound_status: "sent",
        inquiry_message_id: "message-1",
        provider_message_id: "provider-1",
      },
      error: null,
    }));
    const rpc = vi.fn(() => ({
      single: rpcSingle,
    }));

    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "user-1" } },
          error: null,
        })),
      },
      from: vi.fn(() => visibleOutboundQuery),
    });
    mocks.createAdminClient.mockReturnValue({ rpc });

    const response = await POST(
      createRequest({
        outboundMessageId,
        resolution: "confirmed_sent",
        providerMessageId: "provider-1",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      status: "sent",
      inquiryMessageId: "message-1",
    });
    expect(rpc).toHaveBeenCalledWith("reconcile_outbound_message", {
      p_outbound_message_id: outboundMessageId,
      p_company_id: "company-1",
      p_actor_user_id: "user-1",
      p_resolution: "confirmed_sent",
      p_provider_message_id: "provider-1",
    });
  });

  it("does not expose another tenant's delivery", async () => {
    const visibleOutboundQuery = createVisibleOutboundQuery({
      data: null,
      error: null,
    });

    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "user-1" } },
          error: null,
        })),
      },
      from: vi.fn(() => visibleOutboundQuery),
    });

    const response = await POST(
      createRequest({
        outboundMessageId,
        resolution: "confirmed_not_sent",
      })
    );

    expect(response.status).toBe(404);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
