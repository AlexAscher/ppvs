import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * App-level encryption for sensitive secrets stored in the DB
 * (`models.session_string`, `models.api_hash`). Uses AES-256-GCM with a
 * single key in `SESSION_ENC_KEY` (base64, 32 bytes).
 *
 * Encoding: `v1:<iv_b64>:<ciphertext_b64>:<tag_b64>`
 *   - "v1:" prefix lets us detect legacy plaintext rows during migration
 *     (existing rows just pass through `decryptIfNeeded` unchanged).
 *   - Per-record random IV (12 bytes), 16-byte auth tag (GCM default).
 *
 * Never expose decrypted secrets to the browser.
 */

const VERSION = "v1";
const ALGO = "aes-256-gcm";

let cachedKey: Buffer | null = null;

function loadKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.SESSION_ENC_KEY;
  if (!raw) {
    throw new Error(
      "SESSION_ENC_KEY is not set. Generate one: " +
        "node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\" " +
        "and add it to .env.local.",
    );
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error(`SESSION_ENC_KEY must decode to 32 bytes (got ${buf.length}).`);
  }
  cachedKey = buf;
  return buf;
}

/** True if the value looks like a ciphertext produced by `encrypt()`. */
export function isEncrypted(value: string | null | undefined): boolean {
  return !!value && value.startsWith(`${VERSION}:`);
}

/** Encrypt a plaintext string. Returns the encoded blob. */
export function encrypt(plain: string): string {
  const key = loadKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString("base64")}:${ct.toString("base64")}:${tag.toString("base64")}`;
}

/** Decrypt a blob produced by `encrypt()`. Throws on tamper/key mismatch. */
export function decrypt(encoded: string): string {
  if (!isEncrypted(encoded)) {
    throw new Error("decrypt: not an encrypted blob");
  }
  const [, ivB64, ctB64, tagB64] = encoded.split(":");
  if (!ivB64 || !ctB64 || !tagB64) throw new Error("decrypt: malformed blob");
  const key = loadKey();
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const pt = Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]);
  return pt.toString("utf8");
}

/**
 * Transparent decrypt: returns plaintext for encrypted blobs, or the input
 * as-is for legacy plaintext rows (so we can roll this out without a one-off
 * data migration — rows get re-encrypted next time they're saved).
 */
export function decryptIfNeeded(value: string | null | undefined): string | null {
  if (value == null) return null;
  if (!isEncrypted(value)) return value;
  try {
    return decrypt(value);
  } catch (e) {
    console.error("[crypto] decryptIfNeeded failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
