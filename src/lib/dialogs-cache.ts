/**
 * IndexedDB-backed cache of the last successful dialog list per model.
 *
 * Rationale: `/api/telegram/dialogs` can transiently 500 (dead pooled
 * socket, DB blip, deploy reload). The chatter workspace poll retries
 * every 3–10s, but between failures the sidebar visibly BLINKS to empty.
 * Persisting the last good list means the chatter always sees the
 * previous snapshot until the server catches up.
 *
 * Load impact:
 *   - Read on chat-open: ~5–15 ms from IDB (async, off main thread).
 *   - Write per successful poll: ~2–5 ms, non-blocking.
 *   - Storage: ~50 dialogs × ~500 B = ~25 KB per model. For 20 models,
 *     500 KB total — trivial.
 *   - Zero extra load on the server; if anything, the client can go
 *     longer without a fresh poll before blanking, so poll cadence can
 *     stay conservative.
 *
 * Client-only. Do not import from server code.
 */

const DB_NAME = "ppvs-cache-v1";
const STORE = "dialogs";
const DB_VERSION = 1;

type CachedEntry<T> = {
  key: string;
  updatedAt: number;
  data: T;
};

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise<IDBDatabase | null>((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    // Private/Incognito Safari or a corrupted DB — no cache, no crash.
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T>,
): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const result = await fn(store);
    return await new Promise<T>((resolve, reject) => {
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    return null;
  }
}

/** Read the last-known-good dialog snapshot for a (modelId, role) key. */
export async function readCachedDialogs<T>(
  modelId: string,
): Promise<{ updatedAt: number; data: T } | null> {
  const key = `dlg:${modelId}`;
  const entry = await withStore("readonly", (store) => {
    const req = store.get(key);
    return new Promise<CachedEntry<T> | null>((resolve) => {
      req.onsuccess = () => resolve((req.result as CachedEntry<T> | undefined) ?? null);
      req.onerror = () => resolve(null);
    });
  });
  if (!entry) return null;
  return { updatedAt: entry.updatedAt, data: entry.data };
}

/** Persist the newest successful snapshot. Fire-and-forget from callers. */
export async function writeCachedDialogs<T>(modelId: string, data: T): Promise<void> {
  const key = `dlg:${modelId}`;
  await withStore("readwrite", (store) => {
    return new Promise<void>((resolve) => {
      const req = store.put({ key, updatedAt: Date.now(), data } satisfies CachedEntry<T>);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  });
}
