import { cookies } from "next/headers";
import { createSupabaseServerClient, createAdminSupabaseClient } from "@/lib/supabase-server";

export type ModelRow = {
  session_string: string;
  api_id: number;
  api_hash: string;
  agency_user_id: string;
};

type AuthResult =
  | { model: ModelRow; userId: string }
  | { errorResponse: Response };

// ─── caches ──────────────────────────────────────────────────────────────────
// Polling hammers these endpoints every 5–10s per dialog. Without caching,
// every call hits Supabase auth + a DB lookup, and we've seen the auth call
// hang up to 70s on ECONNRESET. A short TTL is safe: chatter assignments
// don't change that often, and a stale cache is corrected within seconds.

declare global {
  var __ppvs_auth_user_cache__:
    | Map<string, { userId: string; ts: number }>
    | undefined;
  var __ppvs_auth_model_cache__:
    | Map<string, { model: ModelRow; ts: number }>
    | undefined;
  var __ppvs_auth_access_cache__:
    | Map<string, { ts: number }>
    | undefined;
}

const userCache: Map<string, { userId: string; ts: number }> =
  globalThis.__ppvs_auth_user_cache__ ?? new Map();
globalThis.__ppvs_auth_user_cache__ = userCache;

const modelCache: Map<string, { model: ModelRow; ts: number }> =
  globalThis.__ppvs_auth_model_cache__ ?? new Map();
globalThis.__ppvs_auth_model_cache__ = modelCache;

const accessCache: Map<string, { ts: number }> =
  globalThis.__ppvs_auth_access_cache__ ?? new Map();
globalThis.__ppvs_auth_access_cache__ = accessCache;

const USER_TTL_MS = 60_000;
const MODEL_TTL_MS = 30_000;
const ACCESS_TTL_MS = 60_000;
const AUTH_TIMEOUT_MS = 8_000;

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

async function getUserIdFromCookies(): Promise<string | null> {
  // Cookie value identifies the session; using it as a cache key avoids
  // a Supabase round-trip on every poll. The token is opaque to us — we
  // only need a stable identifier per logged-in browser.
  const cookieStore = await cookies();
  const all = cookieStore.getAll();
  const tokenCookie = all.find(
    (c) =>
      c.name.startsWith("sb-") &&
      (c.name.endsWith("-auth-token") || c.name.endsWith("-auth-token.0")),
  );
  const cacheKey = tokenCookie ? `${tokenCookie.name}=${tokenCookie.value}` : "no-token";

  const cached = userCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < USER_TTL_MS) {
    return cached.userId;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await runWithTimeout(
      supabase.auth.getUser(),
      AUTH_TIMEOUT_MS,
      "supabase.auth.getUser",
    );
    const userId = data?.user?.id ?? null;
    if (userId) userCache.set(cacheKey, { userId, ts: Date.now() });
    return userId;
  } catch (e) {
    console.error("[authorize] auth.getUser failed:", e instanceof Error ? e.message : e);
    // If we have ANY recent cached value (within 5min) keep using it rather
    // than locking the user out because Supabase had a momentary blip.
    if (cached && Date.now() - cached.ts < 5 * 60_000) return cached.userId;
    return null;
  }
}

async function getModelRow(modelId: string): Promise<ModelRow | null> {
  const cached = modelCache.get(modelId);
  if (cached && Date.now() - cached.ts < MODEL_TTL_MS) return cached.model;

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("models")
    .select("session_string, api_id, api_hash, agency_user_id")
    .eq("id", modelId)
    .single();
  if (error || !data) return null;
  const row = data as ModelRow;
  modelCache.set(modelId, { model: row, ts: Date.now() });
  return row;
}

async function checkChatterAccess(
  chatterId: string,
  modelId: string,
  agencyId: string,
): Promise<boolean> {
  const key = `${chatterId}|${modelId}|${agencyId}`;
  const cached = accessCache.get(key);
  if (cached && Date.now() - cached.ts < ACCESS_TTL_MS) return true;

  const admin = createAdminSupabaseClient();
  const { data: link } = await admin
    .from("agency_chatters")
    .select("model_id, agency_id")
    .eq("chatter_id", chatterId)
    .maybeSingle();
  const ok = !!link && link.model_id === modelId && link.agency_id === agencyId;
  if (ok) accessCache.set(key, { ts: Date.now() });
  return ok;
}

export async function authorizeModelAccess(modelId: string): Promise<AuthResult> {
  const userId = await getUserIdFromCookies();
  if (!userId) {
    return { errorResponse: Response.json({ error: "Not authenticated" }, { status: 401 }) };
  }

  const model = await getModelRow(modelId);
  if (!model) {
    return { errorResponse: Response.json({ error: "Model not found" }, { status: 404 }) };
  }

  if (model.agency_user_id !== userId) {
    const ok = await checkChatterAccess(userId, modelId, model.agency_user_id);
    if (!ok) {
      return { errorResponse: Response.json({ error: "Forbidden" }, { status: 403 }) };
    }
  }

  return { model, userId };
}
