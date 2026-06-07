"use client";

import { useEffect, useState } from "react";

/**
 * Cached eco-mode lookup. Fetched once per page load and shared across
 * components via the module-level cache so we don't hammer /api/eco
 * from every polling effect.
 */

let cached: boolean | null = null;
let inflight: Promise<boolean> | null = null;
const subscribers = new Set<(v: boolean) => void>();

async function fetchEcoOnce(): Promise<boolean> {
  if (cached !== null) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const r = await fetch("/api/eco");
      if (!r.ok) {
        cached = false;
        return false;
      }
      const j = (await r.json()) as { enabled?: boolean };
      cached = !!j.enabled;
      return cached;
    } catch {
      cached = false;
      return false;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Returns the current eco-mode flag. Defaults to false until the first
 *  fetch resolves. Subsequent updates broadcast to all subscribers. */
export function useEcoMode(): boolean {
  const [v, setV] = useState<boolean>(cached ?? false);
  useEffect(() => {
    let alive = true;
    subscribers.add(setV);
    void fetchEcoOnce().then((val) => {
      if (alive) setV(val);
    });
    return () => {
      alive = false;
      subscribers.delete(setV);
    };
  }, []);
  return v;
}

/** Toggle and broadcast to subscribers so polling intervals update live. */
export async function setEcoMode(enabled: boolean): Promise<boolean> {
  const r = await fetch("/api/eco", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  if (!r.ok) return cached ?? false;
  cached = enabled;
  for (const s of subscribers) s(enabled);
  return enabled;
}

/** Multiplier applied to UI polling intervals when eco mode is ON. */
export const ECO_INTERVAL_MULTIPLIER = 4;
