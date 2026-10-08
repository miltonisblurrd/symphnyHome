"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import OpsShell from "@/components/inspired-closets/OpsShell";
import {
  CplTargetBar,
  CtrSparkline,
  FrequencyMeter,
  PerformanceTrend,
} from "@/components/inspired-closets/MetaAdsCharts";
import { explainPerformance, type AdDecision } from "@/lib/meta-ads/analytics/decision";
import type { LeadQualityReport } from "@/lib/meta-ads/analytics/lead-quality";
import { formatChange, formatMoney, percentChange } from "@/lib/meta-ads/analytics/metrics";
import { LEAD_GEN_GATES } from "@/lib/meta-ads/analytics/signals";
import type {
  BreakdownReview,
  CreativeReview,
  DeliveryMetrics,
  DemoAccountReview,
  KpiReview,
} from "@/lib/meta-ads/analytics/review";
import type { SignalCode } from "@/lib/meta-ads/types";
import styles from "./ops-meta-ads.module.css";

const SIGNAL_LABELS: Record<SignalCode, string> = {
  CPL_BELOW_TARGET: "CPL below target",
  CPL_ABOVE_TARGET: "CPL above target",
  CPA_BELOW_TARGET: "CPA below target",
  CPA_ABOVE_TARGET: "CPA above target",
  ROAS_ABOVE_TARGET: "ROAS above target",
  ROAS_BELOW_TARGET: "ROAS below target",
  CTR_IMPROVING: "CTR improving",
  CTR_DECLINING: "CTR declining",
  CPC_INCREASING: "CPC increasing",
  CPM_INCREASING: "CPM increasing",
  FREQUENCY_INCREASING: "Frequency increasing",
  POSSIBLE_CREATIVE_FATIGUE: "Possible creative fatigue",
  POTENTIAL_SCALE_OPPORTUNITY: "Possible scale",
  UNDERPERFORMING: "Underperforming",
  SPEND_ANOMALY: "Spend anomaly",
  CONVERSION_DROP: "Conversion drop",
  ZERO_CONVERSION_SPEND: "Spend without conversions",
  CAMPAIGN_NOT_SPENDING: "Not spending",
  POSSIBLE_TRACKING_ISSUE: "Possible tracking issue",
  INSUFFICIENT_DATA: "Insufficient data",
  NO_ACTION_NEEDED: "No action",
};

const DECISION_COLUMNS: Array<{ id: AdDecision; label: string; hint: string; tone: string }> = [
  { id: "keep", label: "Keep running", hint: "Working, or steady enough to leave on.", tone: styles.toneGood },
  { id: "watch", label: "Watch", hint: "Below the 5-lead, 7-day, or $100 minimum.", tone: styles.toneNeutral },
  { id: "test", label: "Test a variation", hint: "Something moved. Try a new opening before replacing it.", tone: styles.toneWatch },
  { id: "replace", label: "Consider replacing", hint: "Weak enough to plan a different ad.", tone: styles.toneBad },
];

const DECISION_TONE: Record<AdDecision, string> = {
  keep: styles.toneGood,
  watch: styles.toneNeutral,
  test: styles.toneWatch,
  replace: styles.toneBad,
};

export default function OpsMetaAdsWorkspace({
  review,
  leadQuality,
}: {
  review: DemoAccountReview;
  leadQuality: LeadQualityReport;
}) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), 60 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [router]);

  const explanation = explainPerformance(review.changeInput, leadQuality);
  const sorted = [...review.creatives].sort(
    (a, b) =>
      DECISION_COLUMNS.findIndex((column) => column.id === a.decision) -
        DECISION_COLUMNS.findIndex((column) => column.id === b.decision) || b.spend - a.spend,
  );
  const creatives = sorted.filter((creative) => creative.spend > 0);
  const idle = sorted.filter((creative) => creative.spend <= 0);

  return (
    <OpsShell
      title="Meta Ads"
      subtitle={`${review.currentLabel} (${review.currentRange}) compared with the ${review.previousLabel.toLowerCase()} (${review.previousRange}).`}
    >
      <div className={styles.wrap}>
        {review.isDemo ? (
          <p className={styles.demoStrip}>
            <strong>Demo data.</strong> {review.company} is a sample account for testing. It is not Inspired Closets performance, and this tab cannot change ads in Meta.
          </p>
        ) : (
          <p className={styles.liveStrip}>
            <strong>Live Meta data.</strong> {review.company}
            {review.syncedLabel ? ` · synced ${review.syncedLabel}` : ""}. This tab can read the account. It cannot change ads.
          </p>
        )}

        {review.isDemo ? null : (
          <div className={styles.ranges} aria-label="Date range">
            {([7, 30, 60] as const).map((days) => (
              <Link
                key={days}
                href={`/ops/ads?range=${days}`}
                className={`${styles.range} ${review.rangeDays === days ? styles.rangeActive : ""}`}
              >
                Last {days} days
              </Link>
            ))}
          </div>
        )}

        <section className={styles.plan} aria-label="Content plan">
          <div className={styles.planHead}>
            <p className={styles.kicker}>{review.rangeDays === 7 ? "This week's content plan" : `Content plan · last ${review.rangeDays} days`}</p>
            <ul className={styles.points}>
              {review.summaryPoints.map((point) => (
                <li key={point.label} className={styles[`point_${point.tone}`]}>
                  <span className={styles.pointDot} aria-hidden />
                  <span className={styles.pointLabel}>{point.label}</span>
                  <span className={styles.pointDetail}>{point.detail}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className={styles.planGrid}>
            {DECISION_COLUMNS.map((column) => (
              <PlanColumn
                key={column.id}
                label={column.label}
                hint={column.hint}
                tone={column.tone}
                items={sorted.filter((creative) => creative.decision === column.id)}
              />
            ))}
          </div>
        </section>

        <AdsAnalystChat rangeDays={review.isDemo ? 7 : (review.rangeDays as 7 | 30 | 60)} />

        <div className={styles.kpiGrid}>
          {summaryKpis(review, leadQuality).map((kpi) => (
            <Kpi key={kpi.label} kpi={kpi} />
          ))}
          <TargetEditor
            targetCpl={review.targetCpl}
            targetQualifiedCpl={review.targetQualifiedCpl}
            disabled={review.isDemo}
          />
        </div>
        <p className={styles.body}>{leadQuality.available ? leadQuality.sourceNote : leadQuality.reason}</p>

        <LeadQualityPanel quality={leadQuality} />

        <section className={styles.panel}>
          <div className={styles.chartHead}>
            <div>
              <p className={styles.kicker}>Trend</p>
              <p className={styles.body}>Spend, leads, and cost per lead. The comparison line is {review.previousRange}.</p>
            </div>
            <div className={styles.legend}>
              <span><i className={styles.legendMuted} /> {review.previousRange}</span>
              <span><i className={styles.legendInk} /> {review.currentRange}</span>
            </div>
          </div>
          <PerformanceTrend points={review.daily} />
        </section>

        <WhyChanged explanation={explanation} />

        <DecisionTable creatives={sorted} />

        <FunnelTable title="Delivery and funnel, by ad" rows={funnelRows(sorted)} />

        <Breakdowns sections={review.breakdowns} synced={review.breakdowns.length > 0} />

        <AttributionPanel attribution={review.attribution} />

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.heading}>Your ads</h2>
            <p className={styles.body}>
              {review.targetCpl == null
                ? "Ads that delivered in this period, strongest first. Each card shows the creative, its cost per lead versus the previous period, and what to make next."
                : `Strongest first. Each card shows the ad, how it is doing against the ${review.targetCplLabel} lead target, and what to make next.`}
            </p>
          </div>
          {creatives.length === 0 ? (
            <p className={styles.emptyNote}>No ads delivered in this period.</p>
          ) : (
            <div className={styles.cards}>
              {creatives.map((creative) => (
                <CreativeCard key={creative.key} creative={creative} targetCpl={review.targetCpl} />
              ))}
            </div>
          )}
        </section>

        {idle.length ? (
          <section id="no-spend" className={styles.panel}>
            <p className={styles.kicker}>No spend in this period</p>
            <p className={styles.body}>
              Status, whether Meta served any impressions, the launch date, and the delivery reason when Meta returned one.
            </p>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Ad</th>
                    <th>Status</th>
                    <th>Impressions</th>
                    <th>Turned on</th>
                    <th>Why there was no delivery</th>
                  </tr>
                </thead>
                <tbody>
                  {idle.map((creative) => (
                    <tr key={creative.key}>
                      <td>
                        <span className={styles.planItemName}>{creative.name}</span>
                        <span className={styles.planItemMeta}>{creative.campaignName}</span>
                      </td>
                      <td>{creative.statusLabel}</td>
                      <td className={styles.num}>{formatCount(creative.delivery.impressions)}</td>
                      <td>{creative.launchedOn ?? "Not in this sync"}</td>
                      <td>{creative.deliveryReason ?? "Meta did not return a reason."}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <section className={styles.panel}>
          <p className={styles.kicker}>Campaign budgets</p>
          <p className={styles.body}>For whoever sets spend in Ads Manager. Budget changes are suggestions only.</p>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Status</th>
                  <th>Spend</th>
                  <th>Impressions</th>
                  <th>Reach</th>
                  <th>Clicks</th>
                  <th>CTR</th>
                  <th>Leads</th>
                  <th>Cost per lead</th>
                  <th>Frequency</th>
                  <th>Suggestion</th>
                </tr>
              </thead>
              <tbody>
                {review.campaigns.map((campaign) => (
                  <tr key={campaign.key}>
                    <td>{campaign.name}</td>
                    <td>{campaign.statusLabel}</td>
                    <td className={styles.num}>{usd(campaign.spend)}</td>
                    <td className={styles.num}>{formatCount(campaign.delivery.impressions)}</td>
                    <td className={styles.num}>{formatCount(campaign.delivery.reach)}</td>
                    <td className={styles.num}>{formatCount(campaign.delivery.clicks)}</td>
                    <td className={styles.num}>{campaign.ctrLabel}</td>
                    <td className={styles.num}>{campaign.leads}</td>
                    <td>
                      {campaign.previousCplLabel} → {campaign.cplLabel}
                    </td>
                    <td className={styles.num}>{campaign.frequencyLabel}</td>
                    <td>{campaign.recommendation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </OpsShell>
  );
}

const PLAN_PREVIEW = 4;

function usd(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatCount(value: number | null): string {
  if (value == null) return "—";
  return Number.isInteger(value) ? Math.round(value).toLocaleString("en-US") : value.toFixed(1);
}

function formatRate(value: number | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 2 }).format(value);
}

function summaryKpis(review: DemoAccountReview, quality: LeadQualityReport): KpiReview[] {
  const spend = review.kpis.find((kpi) => kpi.label === "Spend");
  const leads = review.kpis.find((kpi) => kpi.label === "Leads");
  const cpl = review.kpis.find((kpi) => kpi.label === "Cost per lead");
  const currentSpend = review.changeInput.spend;
  const previousSpend = review.changeInput.previousSpend;
  return [
    leads ?? metricCard("Leads", review.changeInput.leads, review.changeInput.previousLeads, (value) => String(value), "higher"),
    countCard("Qualified leads", quality.current.qualified, quality.previous.qualified, "higher"),
    countCard("Appointments", quality.current.appointments, quality.previous.appointments, "higher"),
    countCard("Customers", quality.current.customers, quality.previous.customers, "higher"),
    spend ?? metricCard("Spend", currentSpend, previousSpend, (value) => formatMoney(value), "neutral"),
    cpl ?? metricCard("Cost per lead", review.changeInput.cpl, review.changeInput.previousCpl, (value) => formatMoney(value), "lower"),
    rateCard("Cost per qualified lead", currentSpend, previousSpend, quality.current.qualified, quality.previous.qualified),
    rateCard("Cost per appointment", currentSpend, previousSpend, quality.current.appointments, quality.previous.appointments),
  ];
}

function countCard(
  label: string,
  current: number | null,
  previous: number | null,
  goal: "higher" | "lower" | "neutral",
): KpiReview {
  if (current == null || previous == null) {
    return { label, value: "—", previous: "—", changeLabel: "CRM not linked", direction: "unknown" };
  }
  return metricCard(label, current, previous, (value) => String(value), goal);
}

function rateCard(
  label: string,
  spend: number,
  previousSpend: number,
  count: number | null,
  previousCount: number | null,
): KpiReview {
  if (count == null || previousCount == null) {
    return { label, value: "—", previous: "—", changeLabel: "Needs CRM counts", direction: "unknown" };
  }
  const current = count > 0 ? spend / count : null;
  const previous = previousCount > 0 ? previousSpend / previousCount : null;
  return metricCard(label, current, previous, (value) => formatMoney(value), "lower");
}

function metricCard(
  label: string,
  current: number | null,
  previous: number | null,
  format: (value: number) => string,
  goal: "higher" | "lower" | "neutral",
): KpiReview {
  const change = percentChange(current, previous);
  let direction: KpiReview["direction"] = "unknown";
  if (change != null) {
    if (Math.abs(change) < 0.02 || goal === "neutral") direction = "flat";
    else if (goal === "higher") direction = change > 0 ? "better" : "worse";
    else direction = change < 0 ? "better" : "worse";
  }
  return {
    label,
    value: current == null ? "—" : format(current),
    previous: previous == null ? "—" : format(previous),
    changeLabel: formatChange(change),
    direction,
  };
}

function LeadQualityPanel({ quality }: { quality: LeadQualityReport }) {
  const rows = [
    ["Duplicates", quality.current.duplicates],
    ["Spam", quality.current.spam],
    ["Unreachable", quality.current.unreachable],
    ["Still new", quality.current.unresolved],
    ["Not qualified", quality.current.notQualified],
    [
      "Revenue",
      quality.current.revenueCents == null ? null : quality.current.revenueCents / 100,
    ],
  ] as const;
  return (
    <section className={styles.panel}>
      <p className={styles.kicker}>Lead quality</p>
      <p className={styles.body}>
        Qualified means the office kept the lead: it is not junk, not a duplicate, and not still unanswered. Appointments are scheduled, rescheduled, or booked and then canceled. Customers are sold, signed, or converted to a job. Revenue is the sold amount on those leads, for the whole account.
      </p>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Check</th>
              <th>This period</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}>
                <td>{label}</td>
                <td className={styles.num}>
                  {value == null ? "—" : label === "Revenue" ? formatMoney(value) : String(value)}
                </td>
              </tr>
            ))}
            <tr>
              <td>Revenue by ad</td>
              <td>Not available. No Meta ad id is stored on the lead.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function WhyChanged({ explanation }: { explanation: ReturnType<typeof explainPerformance> }) {
  const blocks = [
    ["Observed", explanation.observed],
    ["Likely possibilities", explanation.possible],
    ["Not proven", explanation.notProven],
    ["Next check", explanation.nextCheck],
  ] as const;
  return (
    <section className={styles.panel}>
      <p className={styles.kicker}>Why performance changed</p>
      <div className={styles.whyGrid}>
        {blocks.map(([title, lines]) => (
          <div key={title}>
            <p className={styles.planLabel}>{title}</p>
            <ul className={styles.whyList}>
              {lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function DecisionTable({ creatives }: { creatives: CreativeReview[] }) {
  return (
    <section className={styles.panel}>
      <p className={styles.kicker}>Ad decisions</p>
      <p className={styles.body}>
        A recommendation waits for {LEAD_GEN_GATES.minimumDays} days, {LEAD_GEN_GATES.minimumLeads} leads, and {formatMoney(LEAD_GEN_GATES.minimumSpend)} of spend.
      </p>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Ad</th>
              <th>Spend</th>
              <th>Leads</th>
              <th>CPL</th>
              <th>CTR</th>
              <th>Frequency</th>
              <th>Qualified leads</th>
              <th>Status</th>
              <th>Confidence</th>
              <th>Recommendation</th>
            </tr>
          </thead>
          <tbody>
            {creatives.map((creative) => (
              <tr key={creative.key}>
                <td>
                  {creative.spend > 0 ? (
                    <a href={`#creative-${creative.key}`} className={styles.planItemName}>
                      {creative.name}
                    </a>
                  ) : (
                    <span className={styles.planItemName}>{creative.name}</span>
                  )}
                  {creative.sampleNote ? <span className={styles.sampleNote}>{creative.sampleNote}</span> : null}
                </td>
                <td className={styles.num}>{usd(creative.spend)}</td>
                <td className={styles.num}>{creative.leads}</td>
                <td className={styles.num}>{creative.cplLabel}</td>
                <td className={styles.num}>{creative.ctrLabel}</td>
                <td className={styles.num}>{creative.frequency == null ? "—" : creative.frequency.toFixed(1)}</td>
                <td title="The CRM does not store which ad a lead came from.">—</td>
                <td>{creative.statusLabel}</td>
                <td>{creative.confidence.toLowerCase()}</td>
                <td>
                  {creative.decisionLabel}
                  <span className={styles.planItemMeta}>{creative.contentDirection}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function funnelRows(creatives: CreativeReview[]) {
  return creatives.map((creative) => ({
    key: creative.key,
    name: creative.name,
    delivery: creative.delivery,
    ctr: creative.ctrLabel,
    frequency: creative.frequency,
    leads: creative.leads,
  }));
}

function FunnelTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ key: string; name: string; delivery: DeliveryMetrics; ctr: string; frequency: number | null; leads: number }>;
}) {
  return (
    <section className={styles.panel}>
      <p className={styles.kicker}>{title}</p>
      <p className={styles.body}>
        Clicks are all clicks until a sync includes link clicks. Form starts stay blank when Meta does not report that action. Conversion rate is leads divided by clicks.
      </p>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Ad</th>
              <th>Impressions</th>
              <th>Reach</th>
              <th>Frequency</th>
              <th>Clicks</th>
              <th>Link clicks</th>
              <th>CTR</th>
              <th>Landing page views</th>
              <th>Form starts</th>
              <th>Leads</th>
              <th>Conv. rate</th>
              <th>CPC</th>
              <th>Cost / landing page view</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>{row.name}</td>
                <td className={styles.num}>{formatCount(row.delivery.impressions)}</td>
                <td className={styles.num}>{formatCount(row.delivery.reach)}</td>
                <td className={styles.num}>{row.frequency == null ? "—" : row.frequency.toFixed(1)}</td>
                <td className={styles.num}>{formatCount(row.delivery.clicks)}</td>
                <td className={styles.num}>{formatCount(row.delivery.linkClicks)}</td>
                <td className={styles.num}>{row.ctr}</td>
                <td className={styles.num}>{formatCount(row.delivery.landingPageViews)}</td>
                <td className={styles.num}>{formatCount(row.delivery.formStarts)}</td>
                <td className={styles.num}>{row.leads}</td>
                <td className={styles.num}>{formatRate(row.delivery.conversionRate)}</td>
                <td className={styles.num}>{row.delivery.cpc == null ? "—" : formatMoney(row.delivery.cpc)}</td>
                <td className={styles.num}>
                  {row.delivery.costPerLandingPageView == null ? "—" : formatMoney(row.delivery.costPerLandingPageView)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function funnelSentence(delivery: DeliveryMetrics): string {
  return [
    `${formatCount(delivery.impressions)} impressions`,
    `${formatCount(delivery.reach)} reach`,
    `${formatCount(delivery.clicks)} clicks`,
    `${formatCount(delivery.linkClicks)} link clicks`,
    `${formatCount(delivery.landingPageViews)} landing-page views`,
    `${formatCount(delivery.formStarts)} form starts`,
    `${formatRate(delivery.conversionRate)} click-to-lead`,
    delivery.cpc == null ? "—" : `${formatMoney(delivery.cpc)} CPC`,
  ].join(" · ");
}

function breakdownLines(section: BreakdownReview) {
  const current = new Map(section.rows.map((row) => [row.label, row]));
  const previous = new Map(section.previousRows.map((row) => [row.label, row]));
  const labels = [...new Set([...current.keys(), ...previous.keys()])];
  return labels
    .map((label) => {
      const row = current.get(label);
      return {
        label,
        spend: row?.spend ?? 0,
        previousSpend: previous.get(label)?.spend ?? 0,
        impressions: row?.impressions ?? 0,
        clicks: row?.clicks ?? 0,
        ctr: row?.ctr ?? null,
        leads: row?.leads ?? 0,
        cpl: row?.cpl ?? null,
      };
    })
    .sort((a, b) => b.spend - a.spend || b.previousSpend - a.previousSpend);
}

function Breakdowns({ sections, synced }: { sections: BreakdownReview[]; synced: boolean }) {
  return (
    <section className={styles.panel}>
      <p className={styles.kicker}>Audience and placement</p>
      <p className={styles.body}>
        {synced
          ? "Audience is the ad set name. Reach is left off these tables because daily reach would count the same person more than once."
          : "Placement, device, age, gender, and location are not in this snapshot yet. They are requested on the next Meta sync. Until then, a drop cannot be separated into creative versus where the ads ran."}
      </p>
      {sections.map((section) => (
        <div key={section.id} className={styles.breakdownBlock}>
          <p className={styles.planLabel}>{section.title}</p>
          {section.rows.length === 0 && section.previousRows.length === 0 ? (
            <p className={styles.emptyNote}>No rows for this period.</p>
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{section.title}</th>
                    <th>Spend</th>
                    <th>Previous spend</th>
                    <th>Impressions</th>
                    <th>Clicks</th>
                    <th>CTR</th>
                    <th>Leads</th>
                    <th>CPL</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdownLines(section).map((row) => (
                    <tr key={row.label}>
                      <td>{row.label}</td>
                      <td className={styles.num}>{formatMoney(row.spend)}</td>
                      <td className={styles.num}>{formatMoney(row.previousSpend)}</td>
                      <td className={styles.num}>{formatCount(row.impressions)}</td>
                      <td className={styles.num}>{formatCount(row.clicks)}</td>
                      <td className={styles.num}>{formatRate(row.ctr)}</td>
                      <td className={styles.num}>{formatCount(row.leads)}</td>
                      <td className={styles.num}>{row.cpl == null ? "—" : formatMoney(row.cpl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

function AttributionPanel({ attribution }: { attribution: DemoAccountReview["attribution"] }) {
  return (
    <section className={styles.panel}>
      <p className={styles.kicker}>Attribution and what a lead means</p>
      <ul className={styles.whyList}>
        <li>{attribution.window}</li>
        <li>{attribution.leadSource}</li>
        <li>{attribution.reportingDelay}</li>
        <li>{attribution.comparison}</li>
      </ul>
    </section>
  );
}

function TargetEditor({
  targetCpl,
  targetQualifiedCpl,
  disabled,
}: {
  targetCpl: number | null;
  targetQualifiedCpl: number | null;
  disabled: boolean;
}) {
  const router = useRouter();
  const [cpl, setCpl] = useState(targetCpl == null ? "" : String(targetCpl));
  const [qualified, setQualified] = useState(targetQualifiedCpl == null ? "" : String(targetQualifiedCpl));
  const [status, setStatus] = useState<string | null>(targetCpl == null ? "No target is saved." : null);
  const [pending, setPending] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (disabled || pending) return;
    const parsed = {
      targetCpl: parseTarget(cpl),
      targetQualifiedCpl: parseTarget(qualified),
    };
    if (parsed.targetCpl === "invalid" || parsed.targetQualifiedCpl === "invalid") {
      setStatus("Enter a dollar amount, or leave a field blank to clear it.");
      return;
    }
    setPending(true);
    setStatus(null);
    try {
      const response = await fetch("/api/inspired-closets/ops/ads/target", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !body.ok) {
        setStatus(body.error ?? "The target could not be saved.");
        return;
      }
      setStatus("Saved.");
      router.refresh();
    } catch {
      setStatus("The target could not be saved.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={styles.panel}>
      <p className={styles.kicker}>CPL target</p>
      <form className={styles.targetForm} onSubmit={(event) => void save(event)}>
        <label>
          Cost per lead
          <input value={cpl} onChange={(event) => setCpl(event.target.value)} inputMode="decimal" disabled={disabled || pending} placeholder="Not set" />
        </label>
        <label>
          Cost per qualified lead
          <input value={qualified} onChange={(event) => setQualified(event.target.value)} inputMode="decimal" disabled={disabled || pending} placeholder="Not set" />
        </label>
        <button type="submit" disabled={disabled || pending}>
          {disabled ? "Demo" : pending ? "Saving" : "Save"}
        </button>
      </form>
      {status ? <p className={styles.vizNote}>{status}</p> : null}
    </section>
  );
}

function parseTarget(value: string): number | null | "invalid" {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const amount = Number(trimmed.replace(/[$,]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) return "invalid";
  return Math.round(amount * 100) / 100;
}

function PlanColumn({
  label,
  hint,
  tone,
  items,
}: {
  label: string;
  hint: string;
  tone: string;
  items: CreativeReview[];
}) {
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, PLAN_PREVIEW);
  const hidden = items.length - shown.length;
  return (
    <div className={`${styles.planColumn} ${tone}`}>
      <div className={styles.planColumnHead}>
        <span className={styles.planCount}>{items.length}</span>
        <div>
          <p className={styles.planLabel}>{label}</p>
          <p className={styles.planHint}>{hint}</p>
        </div>
      </div>
      {items.length === 0 ? (
        <p className={styles.planEmpty}>Nothing here this period.</p>
      ) : (
        <ul className={styles.planList}>
          {shown.map((creative) => (
            <li key={creative.key}>
              <a href={creative.spend > 0 ? `#creative-${creative.key}` : "#no-spend"} className={styles.planItem}>
                {creative.image ? <img src={creative.image} alt="" className={styles.planThumb} /> : null}
                <span>
                  <span className={styles.planItemName}>{creative.name}</span>
                  <span className={styles.planItemMeta}>
                    {creative.sampleNote ?? creative.contentDirection}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {items.length > PLAN_PREVIEW ? (
        <button type="button" className={styles.planMore} onClick={() => setOpen((value) => !value)}>
          {open ? "Show less" : `Show ${hidden} more`}
        </button>
      ) : null}
    </div>
  );
}

const STARTERS = [
  "Which ads should I remake?",
  "Why did cost per lead change?",
  "What should I make more of?",
];

function AdsAnalystChat({ rangeDays }: { rangeDays: 7 | 30 | 60 }) {
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(text: string) {
    const content = text.trim();
    if (!content || pending) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setDraft("");
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/inspired-closets/ops/ads/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ range: rangeDays, messages: next.slice(-12) }),
      });
      const body = (await response.json()) as { ok?: boolean; reply?: string; error?: string };
      if (!response.ok || !body.reply) {
        setError(body.error ?? "The analyst could not answer.");
        return;
      }
      setMessages([...next, { role: "assistant", content: body.reply }]);
    } catch {
      setError("The analyst could not be reached.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={styles.panel}>
      <p className={styles.kicker}>Ask the ads analyst</p>
      <p className={styles.body}>
        Questions use the {rangeDays}-day numbers on this page. The analyst can explain them. It cannot change the ads.
      </p>
      {messages.length === 0 ? (
        <div className={styles.starters}>
          {STARTERS.map((prompt) => (
            <button key={prompt} type="button" className={styles.starter} onClick={() => void send(prompt)} disabled={pending}>
              {prompt}
            </button>
          ))}
        </div>
      ) : (
        <div className={styles.thread}>
          {messages.map((message, index) => (
            <p key={`${message.role}-${index}`} className={message.role === "user" ? styles.userTurn : styles.analystTurn}>
              {message.content}
            </p>
          ))}
          {pending ? <p className={styles.analystTurn}>Looking at the numbers…</p> : null}
        </div>
      )}
      {error ? <p className={styles.chatError}>{error}</p> : null}
      <form
        className={styles.chatForm}
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
      >
        <input
          className={styles.chatInput}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask about these ads"
          disabled={pending}
        />
        <button type="submit" className={styles.chatSend} disabled={pending || !draft.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}

function Kpi({ kpi }: { kpi: KpiReview }) {
  const tone =
    kpi.direction === "better" ? styles.changeGood : kpi.direction === "worse" ? styles.changeBad : styles.changeFlat;
  return (
    <section className={styles.panel}>
      <p className={styles.kicker}>{kpi.label}</p>
      <p className={styles.metric}>{kpi.value}</p>
      <p className={styles.body}>
        {kpi.value === "—" && kpi.direction === "unknown" ? (
          kpi.changeLabel
        ) : (
          <>
            <span className={`${styles.change} ${tone}`}>{kpi.changeLabel}</span> vs {kpi.previous} in the previous period
          </>
        )}
      </p>
    </section>
  );
}

function CreativeCard({ creative, targetCpl }: { creative: CreativeReview; targetCpl: number | null }) {
  const tone = DECISION_TONE[creative.decision];
  return (
    <article id={`creative-${creative.key}`} className={`${styles.creative} ${tone}`}>
      <div className={styles.creativeMedia}>
        {creative.videoUrl ? (
          <video
            className={styles.creativeImage}
            controls
            playsInline
            preload="metadata"
            poster={creative.image || undefined}
            src={creative.videoUrl}
          />
        ) : creative.image ? (
          <img src={creative.image} alt={`${creative.name} ad`} className={styles.creativeImage} />
        ) : (
          <div className={styles.creativeFallback}>{creative.name}</div>
        )}
        <span className={styles.mediaTag}>{creative.format}</span>
      </div>

      <div className={styles.creativeBody}>
        <div className={styles.creativeTop}>
          <span className={styles.actionChip}>{creative.decisionLabel}</span>
          <span className={styles.confidence}>{creative.confidence.toLowerCase()} confidence</span>
        </div>
        <h3 className={styles.cardTitle}>{creative.name}</h3>
        <p className={styles.creativeMeta}>
          {creative.statusLabel} · {creative.angle} · running {creative.runningDays} days · {creative.campaignName}
        </p>
        <p className={styles.creativeHeadline}>{creative.headline}</p>
        {creative.sampleNote ? <p className={styles.sampleNote}>{creative.sampleNote}</p> : null}
        <dl className={styles.copyList}>
          <div>
            <dt>Primary text</dt>
            <dd>{creative.primaryText ?? "Not in this sync"}</dd>
          </div>
          <div>
            <dt>Headline</dt>
            <dd>{creative.creativeHeadline ?? "Not in this sync"}</dd>
          </div>
          <div>
            <dt>Call to action</dt>
            <dd>{creative.callToAction ?? "Not in this sync"}</dd>
          </div>
          <div>
            <dt>Type</dt>
            <dd>{creative.format}</dd>
          </div>
          <div>
            <dt>Launched</dt>
            <dd>{creative.launchedOn ?? "Not in this sync"}</dd>
          </div>
          <div>
            <dt>Post</dt>
            <dd>{creative.postSourceLabel}</dd>
          </div>
        </dl>
        <p className={styles.vizNote}>
          {funnelSentence(creative.delivery)} Qualified leads for this ad are not available. The CRM does not store a Meta ad id.
        </p>

        <div className={styles.vizGrid}>
          <div>
            <p className={styles.vizLabel}>
              Cost per lead <span>{creative.previousCplLabel} → <b>{creative.cplLabel}</b></span>
            </p>
            <CplTargetBar previous={creative.previousCpl} current={creative.cpl} target={targetCpl} />
          </div>
          <div>
            <p className={styles.vizLabel}>
              Clicks by day (CTR) <span>{creative.previousCtrLabel} → <b>{creative.ctrLabel}</b></span>
            </p>
            <CtrSparkline values={creative.dailyCtr} />
            <p className={styles.sparkAxis}>
              <span>Previous</span>
              <span>Current</span>
            </p>
          </div>
          <div>
            <p className={styles.vizLabel}>
              Times each person saw it{" "}
              <span>
                {creative.previousFrequency?.toFixed(1) ?? "—"} → <b>{creative.frequency?.toFixed(1) ?? "—"}</b>
              </span>
            </p>
            <FrequencyMeter
              previous={creative.previousFrequency}
              current={creative.frequency}
              watchAt={LEAD_GEN_GATES.elevatedFrequency}
            />
            <p className={styles.vizNote}>Shaded past {LEAD_GEN_GATES.elevatedFrequency}: worth watching, not proof of fatigue.</p>
          </div>
        </div>

        <div className={styles.direction}>
          <p className={styles.directionLabel}>What to make next</p>
          <p>{creative.contentDirection}</p>
        </div>

        <details className={styles.why}>
          <summary>Why the analyst says this</summary>
          <p>{creative.reasoning}</p>
          <p className={styles.whyMeta}>
            {creative.leads} {creative.leads === 1 ? "lead" : "leads"} · {creative.spend.toLocaleString("en-US", { style: "currency", currency: "USD" })} spend
            {creative.signals.length ? ` · ${creative.signals.map((signal) => SIGNAL_LABELS[signal]).join(", ")}` : ""}
          </p>
        </details>
      </div>
    </article>
  );
}
