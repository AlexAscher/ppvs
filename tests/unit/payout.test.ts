import { describe, it, expect } from "vitest";
import {
  HARDCODED_DEFAULT,
  resolveSplit,
  applySplit,
  type SplitsLookup,
  type SplitPcts,
} from "@/lib/payout";

const lookup: SplitsLookup = {
  defaultPcts: HARDCODED_DEFAULT,
  byModel: new Map<string, SplitPcts>([
    ["m2", { model_pct: 60, chatter_pct: 20, agency_pct: 20 }],
  ]),
  byModelChatter: new Map<string, SplitPcts>([
    ["m1:c1", { model_pct: 70, chatter_pct: 10, agency_pct: 20 }],
  ]),
};

describe("resolveSplit priority", () => {
  it("prefers a chatter-specific split", () => {
    expect(resolveSplit(lookup, "m1", "c1").model_pct).toBe(70);
  });
  it("falls back to a model-level split", () => {
    expect(resolveSplit(lookup, "m2", "cX").model_pct).toBe(60);
  });
  it("falls back to the agency default when nothing matches", () => {
    expect(resolveSplit(lookup, "m3", null)).toEqual(HARDCODED_DEFAULT);
    // m1 has only a chatter-specific rule for c1 — a different chatter → default
    expect(resolveSplit(lookup, "m1", "cX")).toEqual(HARDCODED_DEFAULT);
  });
});

describe("applySplit", () => {
  it("takes the platform fee off the top, then splits the net 50/20/30", () => {
    const cut = applySplit(100, HARDCODED_DEFAULT);
    // 12% off the top -> 88 net, then 50/20/30 of 88.
    expect(cut.platformFee).toBe(12);
    expect(cut.model).toBe(44);
    expect(cut.chatter).toBeCloseTo(17.6, 10);
    expect(cut.agency).toBeCloseTo(26.4, 10);
  });

  it("fee + model + chatter + agency always equals gross (agency absorbs rounding)", () => {
    const cases: Array<[number, SplitPcts]> = [
      [100, HARDCODED_DEFAULT],
      [10, { model_pct: 33, chatter_pct: 33, agency_pct: 34 }],
      [19.99, { model_pct: 50, chatter_pct: 20, agency_pct: 30 }],
      [7.77, { model_pct: 70, chatter_pct: 10, agency_pct: 20 }],
      [1, HARDCODED_DEFAULT],
    ];
    for (const [gross, pcts] of cases) {
      const c = applySplit(gross, pcts);
      expect(c.platformFee + c.model + c.chatter + c.agency).toBeCloseTo(gross, 10);
    }
  });

  it("rounds cents to whole cents", () => {
    // 12% of 10 = 1.20. net = 8.80. 33/33/34 of 8.80:
    const c = applySplit(10, { model_pct: 33, chatter_pct: 33, agency_pct: 34 });
    expect(c.platformFee).toBeCloseTo(1.2, 10);
    expect(c.model).toBeCloseTo(2.9, 10);
    expect(c.chatter).toBeCloseTo(2.9, 10);
    expect(c.agency).toBeCloseTo(3.0, 10);
  });
});
