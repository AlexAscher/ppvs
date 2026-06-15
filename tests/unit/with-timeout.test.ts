import { describe, it, expect, afterEach, vi } from "vitest";
import { withTimeout } from "@/lib/with-timeout";

describe("withTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with the value when the promise settles in time", async () => {
    await expect(withTimeout(Promise.resolve(42), 1000, "fast")).resolves.toBe(42);
  });

  it("propagates a rejection from the wrapped promise", async () => {
    await expect(
      withTimeout(Promise.reject(new Error("boom")), 1000, "err"),
    ).rejects.toThrow("boom");
  });

  it("rejects with a labelled timeout error when too slow", async () => {
    vi.useFakeTimers();
    const never = new Promise<number>(() => {});
    const r = withTimeout(never, 1000, "slow-op");
    const assertion = expect(r).rejects.toThrow("slow-op timed out after 1000ms");
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });
});
