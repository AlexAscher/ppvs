import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// crypto.ts requires a 32-byte base64 SESSION_ENC_KEY. Derive a deterministic
// test key from a 32-char string so the encrypt/decrypt round-trip tests run
// without a real secret. (Test-only — never used outside the runner.)
const SESSION_ENC_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: { SESSION_ENC_KEY },
    coverage: {
      provider: "v8",
      include: ["src/lib/**"],
      reporter: ["text-summary"],
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
