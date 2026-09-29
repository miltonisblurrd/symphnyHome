import type { MetricValue } from "@/lib/meta-ads/types";

/** Null stays missing. Zero stays zero. Division by zero returns null, never Infinity. */

function finite(value: MetricValue): value is number {
  return value != null && Number.isFinite(value);
}

export function calculateCpl(spend: MetricValue, leads: MetricValue): MetricValue {
  if (!finite(spend) || !finite(leads) || leads === 0) return null;
  return spend / leads;
}

export function calculateCpa(spend: MetricValue, conversions: MetricValue): MetricValue {
  if (!finite(spend) || !finite(conversions) || conversions === 0) return null;
  return spend / conversions;
}

export function calculateRoas(conversionValue: MetricValue, spend: MetricValue): MetricValue {
  if (!finite(conversionValue) || !finite(spend) || spend === 0) return null;
  return conversionValue / spend;
}

export function percentChange(current: MetricValue, previous: MetricValue): MetricValue {
  if (!finite(current) || !finite(previous) || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

export function formatMoney(value: MetricValue, currency = "USD"): string {
  if (!finite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatRate(value: MetricValue): string {
  if (!finite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Unsigned size of a change, for sentences that already say "fell" or "rose". */
export function formatChangeSize(value: MetricValue): string {
  if (!finite(value)) return "—";
  return new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 }).format(Math.abs(value));
}

export function formatChange(value: MetricValue): string {
  if (!finite(value)) return "—";
  const formatted = new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1,
    signDisplay: "always",
  }).format(value);
  return formatted;
}
