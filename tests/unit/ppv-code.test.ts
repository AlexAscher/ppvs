import { describe, it, expect } from "vitest";
import { generatePpvCode } from "@/lib/ppv-code";

const ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789";

describe("generatePpvCode", () => {
  it("is always 12 chars long", () => {
    for (let i = 0; i < 50; i++) {
      expect(generatePpvCode()).toHaveLength(12);
    }
  });

  it("uses only the URL-safe, non-ambiguous alphabet (no l/0/1)", () => {
    const set = new Set(ALPHABET);
    for (let i = 0; i < 50; i++) {
      for (const ch of generatePpvCode()) {
        expect(set.has(ch)).toBe(true);
      }
    }
  });

  it("does not collide across many draws", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(generatePpvCode());
    expect(seen.size).toBe(1000);
  });
});
