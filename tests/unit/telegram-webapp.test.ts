import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";
import {
  buildMiniAppLink,
  getPayBotUsername,
  verifyInitData,
  InitDataInvalidError,
} from "@/lib/telegram-webapp";

const BOT_TOKEN = "123456:TEST_BOT_TOKEN";

/** Build a correctly-signed initData string the way Telegram would. */
function signInitData(values: Record<string, string>): string {
  const dcs = Object.entries(values)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const hash = crypto.createHmac("sha256", secret).update(dcs).digest("hex");
  const p = new URLSearchParams(values);
  p.set("hash", hash);
  return p.toString();
}

describe("buildMiniAppLink / getPayBotUsername", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_PAY_BOT_USERNAME;
    delete process.env.NEXT_PUBLIC_PAY_APP_NAME;
  });

  it("returns null when no pay bot is configured", () => {
    delete process.env.NEXT_PUBLIC_PAY_BOT_USERNAME;
    expect(getPayBotUsername()).toBeNull();
    expect(buildMiniAppLink({ startParam: "abc" })).toBeNull();
  });

  it("builds a t.me deep link with an encoded start param", () => {
    process.env.NEXT_PUBLIC_PAY_BOT_USERNAME = "ppvspaybot";
    expect(buildMiniAppLink({ startParam: "code 1" })).toBe(
      "https://t.me/ppvspaybot/pay?startapp=code%201",
    );
    expect(buildMiniAppLink({ startParam: "x", appName: "unlock" })).toBe(
      "https://t.me/ppvspaybot/unlock?startapp=x",
    );
  });
});

describe("verifyInitData", () => {
  beforeEach(() => {
    process.env.TELEGRAM_PAY_BOT_TOKEN = BOT_TOKEN;
  });
  afterEach(() => {
    delete process.env.TELEGRAM_PAY_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_TOKEN;
  });

  it("accepts a correctly signed, fresh payload", () => {
    const now = Math.floor(Date.now() / 1000);
    const initData = signInitData({
      auth_date: String(now),
      query_id: "q1",
      user: JSON.stringify({ id: 42, username: "fan" }),
      start_param: "PPVCODE",
    });
    const res = verifyInitData(initData);
    expect(res.user?.id).toBe(42);
    expect(res.startParam).toBe("PPVCODE");
  });

  it("rejects a tampered hash", () => {
    const now = Math.floor(Date.now() / 1000);
    const initData = signInitData({ auth_date: String(now), query_id: "q1" }).replace(
      /hash=[a-f0-9]+/,
      "hash=deadbeef",
    );
    expect(() => verifyInitData(initData)).toThrow(InitDataInvalidError);
  });

  it("rejects an expired payload", () => {
    const old = Math.floor(Date.now() / 1000) - 100_000;
    const initData = signInitData({ auth_date: String(old), query_id: "q1" });
    expect(() => verifyInitData(initData, { maxAgeSeconds: 60 })).toThrow(/too old/);
  });

  it("rejects when no bot token is configured", () => {
    delete process.env.TELEGRAM_PAY_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_TOKEN;
    expect(() => verifyInitData("auth_date=1&hash=x")).toThrow(InitDataInvalidError);
  });
});
