import { describe, it, expect } from "vitest";
import { emojiFilename, emojiFallbackFilename, emojiUrl, EMOJI_BASE } from "@/lib/emoji";

describe("emojiFilename", () => {
  it("uses bare codepoints for emoji-presentation glyphs", () => {
    expect(emojiFilename("😀")).toBe("1f600");
    expect(emojiFilename("👍")).toBe("1f44d");
  });
  it("appends fe0f for text-default glyphs that carry a variation selector", () => {
    expect(emojiFilename("❤️")).toBe("2764-fe0f");
  });
  it("inserts fe0f before the keycap combining mark", () => {
    expect(emojiFilename("1️⃣")).toBe("0031-fe0f-20e3");
  });
});

describe("emojiFallbackFilename", () => {
  it("strips every variation selector", () => {
    expect(emojiFallbackFilename("❤️")).toBe("2764");
    expect(emojiFallbackFilename("1️⃣")).toBe("0031-20e3");
  });
});

describe("emojiUrl", () => {
  it("builds the iamcal CDN url", () => {
    expect(emojiUrl("😀")).toBe(`${EMOJI_BASE}/1f600.png`);
  });
});
