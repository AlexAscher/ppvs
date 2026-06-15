import { describe, it, expect } from "vitest";
import {
  ppvMediaKind,
  validatePpvFile,
  ppvMediaPathFromUrl,
  PPV_ACCEPT,
} from "@/lib/ppv-storage";

// ppvMediaKind/validatePpvFile only read .name and .type, so a structural
// stand-in for File is enough (avoids depending on a global File ctor).
function fakeFile(name: string, type = ""): File {
  return { name, type } as unknown as File;
}

describe("ppvMediaKind", () => {
  it("classifies images / video / audio by extension", () => {
    expect(ppvMediaKind("photo.JPG")).toBe("image");
    expect(ppvMediaKind("clip.mp4")).toBe("video");
    expect(ppvMediaKind("voice.mp3")).toBe("audio");
  });
  it("ignores query strings on URLs", () => {
    expect(ppvMediaKind("https://x/y/a.png?token=abc")).toBe("image");
  });
  it("rejects Telegram-incompatible types", () => {
    expect(ppvMediaKind("trap.jfif")).toBeNull();
    expect(ppvMediaKind("img.heic")).toBeNull();
    expect(ppvMediaKind("doc.pdf")).toBeNull();
  });
  it("falls back to MIME when there is no extension", () => {
    expect(ppvMediaKind(fakeFile("blob", "image/png"))).toBe("image");
    expect(ppvMediaKind(fakeFile("blob", "video/mp4"))).toBe("video");
  });
});

describe("validatePpvFile", () => {
  it("accepts a supported file", () => {
    expect(validatePpvFile(fakeFile("a.jpg", "image/jpeg"))).toEqual({ ok: true, kind: "image" });
  });
  it("rejects an unsupported file with a helpful error naming the ext", () => {
    const r = validatePpvFile(fakeFile("a.jfif"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(".jfif");
  });
});

describe("ppvMediaPathFromUrl", () => {
  it("extracts the storage path from a public ppvs URL", () => {
    expect(
      ppvMediaPathFromUrl("https://p.supabase.co/storage/v1/object/public/ppvs/user1/abc.jpg"),
    ).toBe("user1/abc.jpg");
  });
  it("strips a trailing query string", () => {
    expect(
      ppvMediaPathFromUrl("https://p.supabase.co/storage/v1/object/public/ppvs/u/x.mp4?token=1"),
    ).toBe("u/x.mp4");
  });
  it("returns null for non-ppvs URLs", () => {
    expect(ppvMediaPathFromUrl("https://example.com/whatever.jpg")).toBeNull();
  });
});

describe("PPV_ACCEPT", () => {
  it("includes representative extensions + wildcard MIME groups", () => {
    expect(PPV_ACCEPT).toContain(".jpg");
    expect(PPV_ACCEPT).toContain(".mp4");
    expect(PPV_ACCEPT).toContain("image/*");
    expect(PPV_ACCEPT).toContain("audio/*");
  });
});
