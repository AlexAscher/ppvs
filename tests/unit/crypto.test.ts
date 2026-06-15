import { describe, it, expect } from "vitest";
import { encrypt, decrypt, isEncrypted, decryptIfNeeded } from "@/lib/crypto";

// SESSION_ENC_KEY is injected by vitest.config.ts.

describe("crypto (AES-256-GCM secret encryption)", () => {
  it("round-trips encrypt → decrypt", () => {
    const plain = "1a2b3c-telegram-session-string";
    const blob = encrypt(plain);
    expect(decrypt(blob)).toBe(plain);
  });

  it("produces a v1-prefixed blob", () => {
    expect(encrypt("x").startsWith("v1:")).toBe(true);
  });

  it("isEncrypted detects blobs vs plaintext", () => {
    expect(isEncrypted(encrypt("x"))).toBe(true);
    expect(isEncrypted("plaintext")).toBe(false);
    expect(isEncrypted(null)).toBe(false);
    expect(isEncrypted(undefined)).toBe(false);
  });

  it("uses a random IV (same plaintext → different ciphertext)", () => {
    expect(encrypt("same")).not.toBe(encrypt("same"));
  });

  it("decrypt throws on a non-blob or tampered input", () => {
    expect(() => decrypt("not-a-blob")).toThrow();
    const blob = encrypt("secret");
    const tampered = blob.slice(0, -4) + "AAAA";
    expect(() => decrypt(tampered)).toThrow();
  });

  it("decryptIfNeeded passes legacy plaintext through unchanged", () => {
    expect(decryptIfNeeded("legacy-plaintext")).toBe("legacy-plaintext");
    expect(decryptIfNeeded(null)).toBeNull();
  });

  it("decryptIfNeeded decrypts real blobs and returns null on bad blobs", () => {
    expect(decryptIfNeeded(encrypt("hello"))).toBe("hello");
    // a v1: blob that can't be decrypted → null (logged, not thrown)
    expect(decryptIfNeeded("v1:bad:bad:bad")).toBeNull();
  });
});
