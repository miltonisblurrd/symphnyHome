import { calculateCpl, percentChange } from "@/lib/meta-ads/analytics/metrics";
import type { ConfidenceLevel, MetricValue, SignalCode } from "@/lib/meta-ads/types";

/**
 * Default lead-generation gates. These are settings, not advertising laws.
 * Frequency by itself never produces a fatigue signal.
 */
export const LEAD_GEN_GATES = {
  minimumSpend: 100,
  minimumLeads: 5,
  minimumDays: 7,
  meaningfulMove: 0.15,
  targetGap: 0.1,
  /** Used only as one input beside CTR and CPL movement. */
  elevatedFrequency: 4,
} as const;

export type LeadCampaignSample = {
  spend: number;
  leads: number;
  ctr: MetricValue;
  frequency: MetricValue;
  previousCpl: MetricValue;
  previousCtr: MetricValue;
  days: number;
  /** Null means no cost-per-lead target is saved, so target signals stay off. */
  targetCpl: number | null;
};

export type LeadSignalResult = {
  cpl: MetricValue;
  cplChange: MetricValue;
  ctrChange: MetricValue;
  signals: SignalCode[];
  confidence: ConfidenceLevel;
  sufficient: boolean;
};

export function detectLeadSignals(sample: LeadCampaignSample): LeadSignalResult {
  const cpl = calculateCpl(sample.spend, sample.leads);
  const cplChange = percentChange(cpl, sample.previousCpl);
  const ctrChange = percentChange(sample.ctr, sample.previousCtr);
  const sufficient =
    sample.days >= LEAD_GEN_GATES.minimumDays &&
    sample.leads >= LEAD_GEN_GATES.minimumLeads &&
    sample.spend >= LEAD_GEN_GATES.minimumSpend;

  if (!sufficient) {
    return {
      cpl,
      cplChange,
      ctrChange,
      signals: ["INSUFFICIENT_DATA"],
      confidence: "LOW",
      sufficient: false,
    };
  }

  const signals: SignalCode[] = [];
  if (cpl != null && sample.targetCpl != null && sample.targetCpl > 0) {
    const gap = (cpl - sample.targetCpl) / sample.targetCpl;
    if (gap <= -LEAD_GEN_GATES.targetGap) signals.push("CPL_BELOW_TARGET");
    if (gap >= LEAD_GEN_GATES.targetGap) signals.push("CPL_ABOVE_TARGET");
  }

  if (ctrChange != null && ctrChange >= LEAD_GEN_GATES.meaningfulMove) signals.push("CTR_IMPROVING");
  if (ctrChange != null && ctrChange <= -LEAD_GEN_GATES.meaningfulMove) signals.push("CTR_DECLINING");

  const cplWorse = cplChange != null && cplChange >= LEAD_GEN_GATES.meaningfulMove;
  const cplBetter = cplChange != null && cplChange <= -LEAD_GEN_GATES.meaningfulMove;
  const frequencyNoted =
    sample.frequency != null && sample.frequency >= LEAD_GEN_GATES.elevatedFrequency;

  if (signals.includes("CTR_DECLINING") && cplWorse && frequencyNoted) {
    signals.push("POSSIBLE_CREATIVE_FATIGUE");
  }

  if (signals.includes("CPL_ABOVE_TARGET") && cplWorse) {
    signals.push("UNDERPERFORMING");
  }

  const ctrHealthy = !signals.includes("CTR_DECLINING");
  const frequencyOpen = sample.frequency == null || sample.frequency < LEAD_GEN_GATES.elevatedFrequency;
  if (signals.includes("CPL_BELOW_TARGET") && cplBetter && ctrHealthy && frequencyOpen) {
    signals.push("POTENTIAL_SCALE_OPPORTUNITY");
  }

  return {
    cpl,
    cplChange,
    ctrChange,
    signals,
    confidence: confidenceFor(sample, signals.length),
    sufficient: true,
  };
}

function confidenceFor(sample: LeadCampaignSample, signalCount: number): ConfidenceLevel {
  if (sample.days >= 7 && sample.leads >= 30 && signalCount >= 2) return "HIGH";
  if (sample.days >= 7 && sample.leads >= LEAD_GEN_GATES.minimumLeads) return "MEDIUM";
  return "LOW";
}
