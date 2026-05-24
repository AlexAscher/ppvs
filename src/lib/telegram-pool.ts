import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { buildTelegramClientOptions } from "@/lib/telegram-client";

type Entry = {
  client: TelegramClient;
  lastUsedAt: number;
};

// Persist the pool across Next.js hot reloads
declare global {
  var __ppvs_tg_pool__: Map<string, Entry> | undefined;
  var __ppvs_tg_connect_locks__: Map<string, Promise<TelegramClient>> | undefined;
  var __ppvs_tg_cleanup__: ReturnType<typeof setInterval> | undefined;
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
const OPERATION_TIMEOUT_MS = 20_000;

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

function evictBroken(modelId: string, entry: Entry) {
  pool.delete(modelId);
  connectLocks.delete(modelId);
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
      await runWithTimeout(client.connect(), OPERATION_TIMEOUT_MS, "connect");
    } catch (e) {
      try { await client.disconnect(); } catch {}
      throw e;
    }
    pool.set(modelId, { client, lastUsedAt: Date.now() });
    scheduleCleanup();
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
 * - Each operation is hard-capped at OPERATION_TIMEOUT_MS; on
 *   timeout / dead-connection errors the entry is evicted and the next
 *   caller reconnects.
 */
export async function withTelegramClient<T>(
  modelId: string,
  sessionString: string,
  apiId: number,
  apiHash: string,
  fn: (client: TelegramClient) => Promise<T>,
): Promise<T> {
  const client = await connectOrGetClient(modelId, sessionString, apiId, apiHash);

  try {
    const result = await runWithTimeout(fn(client), OPERATION_TIMEOUT_MS, "operation");
    const entry = pool.get(modelId);
    if (entry) entry.lastUsedAt = Date.now();
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (DEAD_CONNECTION_RE.test(msg)) {
      const entry = pool.get(modelId);
      if (entry) evictBroken(modelId, entry);
    }
    throw e;
  }
}

export function evictTelegramClient(modelId: string) {
  const entry = pool.get(modelId);
  if (!entry) return;
  evictBroken(modelId, entry);
}
