import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  verifyMalumWebhookSignature,
  createMalumPayment,
  type MalumWebhookEvent,
} from "@/lib/malum";

const KEY = "test_webhook_key";
function sign(txn: string, ts: string | number): string {
  return createHash("md5").update(`${txn}|${ts}|${KEY}`).digest("hex");
}

describe("verifyMalumWebhookSignature", () => {
  beforeEach(() => {
    process.env.MALUM_WEBHOOK_KEY = KEY;
  });

  it("accepts a correctly signed payload", () => {
    const ev: MalumWebhookEvent = {
      status: "COMPLETED",
      txn: "txn123",
      timestamp: 1700000000,
      signature: sign("txn123", 1700000000),
    };
    expect(verifyMalumWebhookSignature(ev)).toBe(true);
  });

  it("is case-insensitive on the supplied signature", () => {
    const ev: MalumWebhookEvent = {
      status: "COMPLETED",
      txn: "txn123",
      timestamp: 1700000000,
      signature: sign("txn123", 1700000000).toUpperCase(),
    };
    expect(verifyMalumWebhookSignature(ev)).toBe(true);
  });

  it("rejects a tampered signature", () => {
    const ev: MalumWebhookEvent = {
      status: "COMPLETED",
      txn: "txn123",
      timestamp: 1700000000,
      signature: "deadbeef",
    };
    expect(verifyMalumWebhookSignature(ev)).toBe(false);
  });

  it("rejects when fields are missing", () => {
    expect(
      verifyMalumWebhookSignature({ status: "COMPLETED", txn: "", timestamp: 1, signature: "x" } as MalumWebhookEvent),
    ).toBe(false);
  });

  it("rejects when no webhook key is configured", () => {
    delete process.env.MALUM_WEBHOOK_KEY;
    const ev: MalumWebhookEvent = {
      status: "COMPLETED",
      txn: "txn123",
      timestamp: 1700000000,
      signature: sign("txn123", 1700000000),
    };
    expect(verifyMalumWebhookSignature(ev)).toBe(false);
  });
});

describe("createMalumPayment", () => {
  beforeEach(() => {
    process.env.MALUM_MID = "mid_test";
    process.env.MALUM_SECRET_KEY = "sec_test";
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the hosted-checkout link on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "success", transaction_id: "t1", link: "https://pay/x" }), {
        status: 200,
      }),
    );
    const res = await createMalumPayment({
      amount: 11,
      currency: "USD",
      customer_email: "f@x.com",
      webhook_url: "https://a/webhook",
      success_url: "https://a/ok",
      cancel_url: "https://a/no",
    });
    expect(res.link).toBe("https://pay/x");
    expect(res.transaction_id).toBe("t1");
  });

  it("throws when the gateway returns an error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "error", error: "declined" }), { status: 400 }),
    );
    await expect(
      createMalumPayment({
        amount: 11,
        currency: "USD",
        customer_email: "f@x.com",
        webhook_url: "https://a/webhook",
        success_url: "https://a/ok",
        cancel_url: "https://a/no",
      }),
    ).rejects.toThrow(/declined/);
  });

  it("throws when credentials are missing", async () => {
    delete process.env.MALUM_MID;
    delete process.env.MALUM_SECRET_KEY;
    await expect(
      createMalumPayment({
        amount: 11,
        currency: "USD",
        customer_email: "f@x.com",
        webhook_url: "https://a/webhook",
        success_url: "https://a/ok",
        cancel_url: "https://a/no",
      }),
    ).rejects.toThrow(/not configured/);
  });
});
