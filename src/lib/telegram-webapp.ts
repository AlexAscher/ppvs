import crypto from "node:crypto";

/**
 * Verify a Telegram Mini App initData payload.
 *
 * The Mini App SDK ships `window.Telegram.WebApp.initData` — a URL-encoded
 * string containing user + chat + start_param + hash. To trust anything in
 * it server-side we recompute the HMAC-SHA256 of all key=value pairs
 * (sorted, except hash itself) using a secret derived from the bot token
 * and compare it to the supplied hash.
 *
 * Algorithm: per https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 *   data_check_string = sorted("\n".join([f"{k}={v}" for k, v in initData if k != "hash"]))
 *   secret_key        = HMAC_SHA256("WebAppData", bot_token).digest()
 *   computed          = HMAC_SHA256(data_check_string, secret_key).hexdigest()
 *   computed === supplied_hash → trusted
 */

// We deliberately split the Mini App bot from the alert bot — they're two
// different Telegram bots with two different tokens. The Mini App lives on
// the "pay" bot (the username fans see in t.me/<bot>/pay links), while the
// alert bot DMs the agency about sales. They could be the same bot, but we
// support keeping them separate so each one's username/branding is purpose-
// built. Fall back to TELEGRAM_BOT_TOKEN for backward-compat with older
// single-bot setups where only one var was ever set.
const BOT_TOKEN_ENV = "TELEGRAM_PAY_BOT_TOKEN";

export type VerifiedInitData = {
  /** Raw decoded payload — minus the hash. */
  values: Record<string, string>;
  /** Convenience: the parsed `user` JSON if present. */
  user?: {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    language_code?: string;
  };
  /** `start_param` from `t.me/<bot>/<app>?startapp=<value>`. */
  startParam?: string;
  /** ISO timestamp of the auth event — useful for replay-window checks. */
  authDate: Date;
};

export class InitDataInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InitDataInvalidError";
  }
}

/**
 * Verify and parse a Telegram Mini App initData string. Throws
 * InitDataInvalidError if anything's off (missing hash, bad hash, or
 * older than `maxAgeSeconds` if supplied — default 1 day).
 */
export function verifyInitData(
  initData: string,
  opts: { maxAgeSeconds?: number } = {},
): VerifiedInitData {
  // Prefer the dedicated pay-bot token; fall back to TELEGRAM_BOT_TOKEN for
  // backward-compat (some early deploys set just the one).
  const botToken =
    process.env[BOT_TOKEN_ENV] || process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    throw new InitDataInvalidError(
      `${BOT_TOKEN_ENV} not set — Mini App auth is disabled`,
    );
  }
  if (!initData) throw new InitDataInvalidError("empty initData");

  const params = new URLSearchParams(initData);
  const suppliedHash = params.get("hash");
  if (!suppliedHash) throw new InitDataInvalidError("missing hash");

  // Build the data-check-string: every k=v pair except `hash`, sorted by k.
  const entries: [string, string][] = [];
  for (const [k, v] of params.entries()) {
    if (k === "hash") continue;
    entries.push([k, v]);
  }
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  const computed = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (computed !== suppliedHash) {
    throw new InitDataInvalidError("hash mismatch");
  }

  const values = Object.fromEntries(entries);

  // Replay protection.
  const authDateSec = Number(values.auth_date);
  if (!Number.isFinite(authDateSec)) {
    throw new InitDataInvalidError("auth_date missing");
  }
  const authDate = new Date(authDateSec * 1000);
  const maxAge = opts.maxAgeSeconds ?? 24 * 3600;
  const age = (Date.now() - authDate.getTime()) / 1000;
  if (age > maxAge) {
    throw new InitDataInvalidError(`auth_date too old (${Math.round(age)}s)`);
  }

  let user: VerifiedInitData["user"] | undefined;
  if (values.user) {
    try {
      user = JSON.parse(values.user);
    } catch {
      // Non-fatal — we just won't expose `user`.
    }
  }

  return {
    values,
    user,
    startParam: values.start_param,
    authDate,
  };
}

/** Returns the configured bot username (no @ prefix) for building deep
 *  links. Reads NEXT_PUBLIC_PAY_BOT_USERNAME so it's safe to inline on
 *  the client. */
export function getPayBotUsername(): string | null {
  const u = process.env.NEXT_PUBLIC_PAY_BOT_USERNAME?.trim();
  return u || null;
}

/**
 * Build a t.me deep link that opens the Mini App with the given start
 * parameter. The Mini App reads `Telegram.WebApp.initDataUnsafe.start_param`
 * (verified server-side via initData hash) to resolve which PPV/tip the
 * fan landed on.
 *
 * Returns null if no bot is configured — callers fall back to the legacy
 * web pay URL.
 */
export function buildMiniAppLink(opts: {
  startParam: string;
  /** Bot's Mini App name as registered in @BotFather (e.g. "pay"). */
  appName?: string;
}): string | null {
  const bot = getPayBotUsername();
  if (!bot) return null;
  const app = opts.appName ?? process.env.NEXT_PUBLIC_PAY_APP_NAME ?? "pay";
  return `https://t.me/${bot}/${app}?startapp=${encodeURIComponent(opts.startParam)}`;
}
