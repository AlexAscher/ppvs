import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { buildTelegramClientOptions } from "@/lib/telegram-client";
import { subscribeAutoReplyEvents } from "@/lib/auto-reply";
import {
  subscribeActivityEvents,
  clearActivitySubscription,
} from "@/lib/telegram-activity";
import { createAdminSupabaseClient } from "@/lib/supabase-server";

type Entry = {
  client: TelegramClient;
  lastUsedAt: number;
};

// Persist the pool across Next.js hot reloads
declare global {
  var __ppvs_tg_pool__: Map<string, Entry> | undefined;
  var __ppvs_tg_connect_locks__: Map<string, Promise<TelegramClient>> | undefined;
  var __ppvs_tg_cleanup__: ReturnType<typeof setInterval> | undefined;
  var __ppvs_tg_expired_marked__: Set<string> | undefined;
}

const pool: Map<string, Entry> =
  globalThis.__ppvs_tg_pool__ ?? new Map<string, Entry>();
globalThis.__ppvs_tg_pool__ = pool;

// In-flight connect promises. Only one connect at a time per model so we
// don't open multiple parallel sessions and confuse Telegram.
const connectLocks: Map<string, Promise<TelegramClient>> =
  globalThis.__ppvs_tg_connect_locks__ ?? new Map<string, Promise<TelegramClient>>();
globalThis.__ppvs_tg_connect_locks__ = connectLocks;

const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 min
// Hard cap on a single gramJS operation. If the underlying socket hangs
// (proxy hiccup, dead Telegram DC) we abort so the next caller isn't blocked.
// Per-call override is supported (see withTelegramClient's `timeoutMs` param) —
// heavier ops like PPV send (download+blur+upload N files) need 2–3 minutes.
const DEFAULT_OPERATION_TIMEOUT_MS = 20_000;

function scheduleCleanup() {
  if (globalThis.__ppvs_tg_cleanup__) return;
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of pool.entries()) {
      if (now - entry.lastUsedAt > IDLE_TIMEOUT_MS) {
        entry.client.disconnect().catch(() => {});
        pool.delete(key);
      }
    }
  }, 60_000);
  if (typeof timer.unref === "function") timer.unref();
  globalThis.__ppvs_tg_cleanup__ = timer;
}

function runWithTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const t = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`${label} TIMEOUT after ${ms}ms`));
    }, ms);
    p.then(
      (v) => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

const DEAD_CONNECTION_RE =
  /AUTH_KEY|CONNECTION_NOT_INITED|disconnect|TIMEOUT|ECONNRESET|Not connected|fetch failed/i;

// Fatal, non-recoverable session errors. These mean the stored
// session_string is dead — the model must re-authenticate (we can't
// silently re-login without a fresh login code). We flag the DB so the
// UI can prompt "Reconnect" and stop hammering a dead session.
const EXPIRED_SESSION_RE =
  /AUTH_KEY_UNREGISTERED|AUTH_KEY_INVALID|AUTH_KEY_DUPLICATED|SESSION_REVOKED|SESSION_EXPIRED|USER_DEACTIVATED/i;

// Avoid spamming the DB with the same update on every failing poll.
const expiredMarked: Set<string> =
  globalThis.__ppvs_tg_expired_marked__ ?? new Set<string>();
globalThis.__ppvs_tg_expired_marked__ = expiredMarked;

async function markSessionExpired(modelId: string) {
  if (expiredMarked.has(modelId)) return;
  expiredMarked.add(modelId);
  try {
    const admin = createAdminSupabaseClient();
    await admin.from("models").update({ session_status: "expired" }).eq("id", modelId);
    console.warn(`[telegram-pool] model ${modelId} session expired — flagged for reconnect`);
  } catch (e) {
    // Non-fatal — clear the guard so a later attempt can retry the flag.
    expiredMarked.delete(modelId);
    console.error(
      "[telegram-pool] failed to flag expired session:",
      e instanceof Error ? e.message : e,
    );
  }
}

/** Inspect an error; if it's a fatal session error, flag the model. */
function noteSessionError(modelId: string, msg: string) {
  if (EXPIRED_SESSION_RE.test(msg)) void markSessionExpired(modelId);
}

/**
 * Clear the in-memory "already flagged expired" guard. Call after a
 * successful re-auth (verify-code) so a future expiry re-flags.
 */
export function clearExpiredFlag(modelId: string) {
  expiredMarked.delete(modelId);
}

function evictBroken(modelId: string, entry: Entry) {
  pool.delete(modelId);
  connectLocks.delete(modelId);
  clearActivitySubscription(modelId);
  entry.client.disconnect().catch(() => {});
}

async function connectOrGetClient(
  modelId: string,
  sessionString: string,
  apiId: number,
  apiHash: string,
): Promise<TelegramClient> {
  const existing = pool.get(modelId);
  if (existing) return existing.client;

  const pending = connectLocks.get(modelId);
  if (pending) return pending;

  const promise = (async () => {
    const client = new TelegramClient(
      new StringSession(sessionString),
      apiId,
      apiHash,
      buildTelegramClientOptions(),
    );
    try {
      await runWithTimeout(client.connect(), DEFAULT_OPERATION_TIMEOUT_MS, "connect");
    } catch (e) {
      try { await client.disconnect(); } catch {}
      throw e;
    }
    pool.set(modelId, { client, lastUsedAt: Date.now() });
    scheduleCleanup();
    // Attach event listeners for typing / new-message activity — used
    // by /api/telegram/activity to derive a fresh "online" badge even
    // when Telegram privacy hides the real user status.
    subscribeActivityEvents(modelId, client);
    // Auto-reply hook: fires once per new fan when they send their first
    // message, if the model has it enabled in Settings.
    subscribeAutoReplyEvents(modelId, client);
    return client;
  })();

  connectLocks.set(modelId, promise);
  try {
    return await promise;
  } finally {
    connectLocks.delete(modelId);
  }
}

/**
 * Run an operation against a persistent TelegramClient for a model.
 *
 * - Connects lazily; only one connect per model is in flight at any time.
 * - Operations run CONCURRENTLY on the same client. gramJS's internal
 *   Sender already serializes the wire format; serializing again at this
 *   layer caused one hung request to block POST sends and every other
 *   poll for 60+ seconds.
 * - Each operation is hard-capped at DEFAULT_OPERATION_TIMEOUT_MS; on
 *   timeout / dead-connection errors the entry is evicted and the next
 *   caller reconnects.
 */
export async function withTelegramClient<T>(
  modelId: string,
  sessionString: string,
  apiId: number,
  apiHash: string,
  fn: (client: TelegramClient) => Promise<T>,
  timeoutMs: number = DEFAULT_OPERATION_TIMEOUT_MS,
  // Transparent one-shot reconnect on a dead-connection error. ONLY pass true
  // for idempotent READ ops (getMessages, getDialogs, downloadMedia). A stale
  // pooled socket throws exactly once, gets evicted, and a fresh reconnect
  // almost always succeeds — so retrying inside the same request turns a
  // user-visible 500 ("No messages yet" on a real chat) into a silent
  // recovery. NEVER pass true for sends (retrying could double-send).
  retryOnDeadConnection: boolean = false,
): Promise<T> {
  // Known-dead session (already flagged expired): don't reconnect or invoke.
  // Hammering a dead key just spams Telegram with AUTH_KEY_* errors (and can
  // destabilize connections for the whole process). Fail fast; the UI shows
  // the "session expired → Reconnect" prompt. A successful re-auth calls
  // clearExpiredFlag() so polling resumes.
  if (expiredMarked.has(modelId)) {
    const stale = pool.get(modelId);
    if (stale) evictBroken(modelId, stale);
    throw new Error("SESSION_EXPIRED: reconnect this creator");
  }

  // A single attempt: connect (or reuse) then run the op under the timeout.
  // On a dead-connection failure it evicts the broken client so a retry (or
  // the next caller) reconnects fresh.
  const attempt = async (): Promise<T> => {
    let client: TelegramClient;
    try {
      client = await connectOrGetClient(modelId, sessionString, apiId, apiHash);
    } catch (e) {
      // Connect itself can fail with a dead-session error.
      noteSessionError(modelId, e instanceof Error ? e.message : String(e));
      throw e;
    }
    try {
      const result = await runWithTimeout(fn(client), timeoutMs, "operation");
      const entry = pool.get(modelId);
      if (entry) entry.lastUsedAt = Date.now();
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Flag a dead session for reconnect (DB), independent of eviction.
      noteSessionError(modelId, msg);
      if (DEAD_CONNECTION_RE.test(msg)) {
        const entry = pool.get(modelId);
        if (entry) evictBroken(modelId, entry);
      }
      throw e;
    }
  };

  try {
    return await attempt();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const recoverable =
      retryOnDeadConnection &&
      DEAD_CONNECTION_RE.test(msg) &&
      !EXPIRED_SESSION_RE.test(msg) &&
      !expiredMarked.has(modelId);
    if (!recoverable) throw e;
    // The broken socket was just evicted — reconnect fresh and try once more.
    return await attempt();
  }
}

export function evictTelegramClient(modelId: string) {
  const entry = pool.get(modelId);
  if (!entry) return;
  evictBroken(modelId, entry);
}
