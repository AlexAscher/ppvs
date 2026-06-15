import { randomBytes } from "node:crypto";

/**
 * Crypto-strong URL-safe code for /pay/{code} and /tip/{code}. 12 chars from a
 * 33-char alphabet → 33^12 ≈ 1.6e18 — not enumerable. Rejection sampling
 * avoids modulo bias (33 ≠ a power of 2). Kept in its own tiny module (no
 * sharp/telegram/supabase imports) so it can be unit-tested in isolation.
 */
export function generatePpvCode(): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyz23456789";
  const TARGET = 12;
  const out: string[] = [];
  while (out.length < TARGET) {
    const buf = randomBytes(32);
    for (let i = 0; i < buf.length && out.length < TARGET; i++) {
      const v = buf[i] & 0x3f; // 0..63 — 33 fits in 6 bits
      if (v < alphabet.length) out.push(alphabet[v]);
    }
  }
  return out.join("");
}
