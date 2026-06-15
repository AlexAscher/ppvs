import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { consume, getClientIp, tooManyRequests } from "@/lib/rate-limit";

describe("consume (sliding-window rate limit)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows up to `limit` events, then blocks within the window", () => {
    const key = "test|allow-then-block";
    expect(consume(key, 3, 1000)).toBe(true);
    expect(consume(key, 3, 1000)).toBe(true);
    expect(consume(key, 3, 1000)).toBe(true);
    expect(consume(key, 3, 1000)).toBe(false);
  });

  it("allows again after the window slides past old events", () => {
    const key = "test|window-slide";
    expect(consume(key, 2, 1000)).toBe(true);
    expect(consume(key, 2, 1000)).toBe(true);
    expect(consume(key, 2, 1000)).toBe(false);
    vi.setSystemTime(new Date(1500)); // past the 1000ms window
    expect(consume(key, 2, 1000)).toBe(true);
  });

  it("tracks each key independently", () => {
    expect(consume("test|k-a", 1, 1000)).toBe(true);
    expect(consume("test|k-a", 1, 1000)).toBe(false);
    expect(consume("test|k-b", 1, 1000)).toBe(true);
  });
});

describe("getClientIp", () => {
  it("prefers the first x-forwarded-for hop", () => {
    const req = { headers: new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }) };
    expect(getClientIp(req)).toBe("1.2.3.4");
  });
  it("falls back to cf-connecting-ip / x-real-ip", () => {
    expect(getClientIp({ headers: new Headers({ "cf-connecting-ip": "9.9.9.9" }) })).toBe("9.9.9.9");
    expect(getClientIp({ headers: new Headers({ "x-real-ip": "8.8.8.8" }) })).toBe("8.8.8.8");
  });
  it("returns 'unknown' when no IP header is present", () => {
    expect(getClientIp({ headers: new Headers() })).toBe("unknown");
  });
});

describe("tooManyRequests", () => {
  it("returns a 429 with a retry-after header", async () => {
    const res = tooManyRequests(42);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("42");
    expect((await res.json()).error).toMatch(/too many/i);
  });
});
