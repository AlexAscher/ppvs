/**
 * Reject a promise if it doesn't settle within `ms`. Used to stop slow
 * Supabase/network calls from hanging API routes for 60–70s when the
 * host's uplink is saturated (e.g. a big PPV upload in flight). The
 * caller decides what to return on timeout — usually a fast fallback.
 */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const t = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`${label} timed out after ${ms}ms`));
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
