import assert from "node:assert/strict";
import test from "node:test";
import { calculateCpl, percentChange } from "@/lib/meta-ads/analytics/metrics";
import { detectLeadSignals } from "@/lib/meta-ads/analytics/signals";
import { reviewDemoAccount } from "@/lib/meta-ads/analytics/review";

test("CPL uses spend divided by leads", () => {
  const cpl = calculateCpl(1240, 39);
  assert.ok(cpl != null);
  assert.equal(Math.round(cpl * 100) / 100, 31.79);
});

test("CPL is missing when leads are zero", () => {
  assert.equal(calculateCpl(100, 0), null);
  assert.equal(calculateCpl(0, 0), null);
});

test("CPL distinguishes zero spend from missing inputs", () => {
  assert.equal(calculateCpl(0, 4), 0);
  assert.equal(calculateCpl(null, 4), null);
  assert.equal(calculateCpl(40, null), null);
});

test("percent change refuses a zero baseline", () => {
  assert.equal(percentChange(10, 0), null);
  assert.equal(percentChange(null, 10), null);
});

test("demo account separates scale, fatigue, and insufficient data", () => {
  const review = reviewDemoAccount();
  const byKey = Object.fromEntries(review.campaigns.map((campaign) => [campaign.key, campaign]));

  assert.equal(review.isDemo, true);
  assert.equal(review.spendLabel, "$2,173.00");
  assert.equal(review.leadsLabel, "51");
  assert.equal(byKey["prospecting-homeowners"]?.bucket, "opportunity");
  assert.equal(byKey["prospecting-homeowners"]?.suggestedBudgetChangePercent, 10);
  assert.ok(byKey["prospecting-homeowners"]?.signals.includes("POTENTIAL_SCALE_OPPORTUNITY"));
  assert.equal(byKey["retargeting-homeowners"]?.bucket, "attention");
  assert.ok(byKey["retargeting-homeowners"]?.signals.includes("POSSIBLE_CREATIVE_FATIGUE"));
  assert.equal(byKey["retargeting-homeowners"]?.suggestedBudgetChangePercent, null);
  assert.deepEqual(byKey["new-creative-test"]?.signals, ["INSUFFICIENT_DATA"]);
  assert.equal(byKey["new-creative-test"]?.bucket, "wait");
});

test("creatives get one content action each, grounded in their own numbers", () => {
  const review = reviewDemoAccount();
  const byKey = Object.fromEntries(review.creatives.map((creative) => [creative.key, creative]));

  assert.equal(byKey["closet-reveal"]?.action, "make_more");
  assert.equal(byKey["pantry-before-after"]?.action, "keep");
  assert.equal(byKey["designer-walkthrough-3"]?.action, "refresh");
  assert.equal(byKey["garage-reel"]?.action, "wait");
});

test("daily series agrees with the weekly totals", () => {
  const review = reviewDemoAccount();
  const current = review.daily.filter((point) => point.period === "current");
  assert.equal(current.length, 7);
  assert.equal(current.reduce((total, point) => total + point.leads, 0), 51);
  assert.equal(review.kpis[1]?.previous, "46");
  assert.equal(review.kpis[2]?.direction, "flat");
});

test("insufficient samples do not emit optimization signals", () => {
  const result = detectLeadSignals({
    spend: 63,
    leads: 1,
    ctr: 0.02,
    frequency: 6,
    previousCpl: 20,
    previousCtr: 0.04,
    days: 2,
    targetCpl: 40,
  });
  assert.deepEqual(result.signals, ["INSUFFICIENT_DATA"]);
  assert.equal(result.confidence, "LOW");
});
