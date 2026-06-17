import { describe, it, expect } from "vitest";
import { PLATFORM_FEE_PCT, platformFee, agencyNet } from "@/lib/platform";

describe("platform economics", () => {
  it("defaults to a 12% platform fee", () => {
    expect(PLATFORM_FEE_PCT).toBe(0.12);
  });

  it("platformFee takes the configured cut of gross", () => {
    expect(platformFee(100)).toBeCloseTo(12, 10);
    expect(platformFee(0)).toBe(0);
    expect(platformFee(55.5)).toBeCloseTo(6.66, 10);
  });

  it("agencyNet is gross minus the platform fee", () => {
    expect(agencyNet(100)).toBeCloseTo(88, 10);
    expect(agencyNet(0)).toBe(0);
  });

  it("platformFee + agencyNet always reconstructs gross", () => {
    for (const gross of [1, 5, 19.99, 100, 1234.56]) {
      expect(platformFee(gross) + agencyNet(gross)).toBeCloseTo(gross, 10);
    }
  });
});
