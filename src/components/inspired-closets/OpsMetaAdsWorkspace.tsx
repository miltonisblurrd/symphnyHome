"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import OpsShell from "@/components/inspired-closets/OpsShell";
import {
  CplTargetBar,
  CtrSparkline,
  DailyLeadsChart,
  FrequencyMeter,
} from "@/components/inspired-closets/MetaAdsCharts";
import { LEAD_GEN_GATES } from "@/lib/meta-ads/analytics/signals";
import type {
  CreativeAction,
  CreativeReview,
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

const ACTION_ORDER: CreativeAction[] = ["make_more", "refresh", "keep", "wait"];

const PLAN_COLUMNS: Array<{ id: string; label: string; hint: string; actions: CreativeAction[]; tone: string }> = [
  { id: "make", label: "Make more like this", hint: "Working. New versions in the same style.", actions: ["make_more"], tone: styles.toneGood },
  { id: "refresh", label: "Refresh", hint: "Wearing out. Needs a new version.", actions: ["refresh"], tone: styles.toneBad },
  { id: "leave", label: "Leave alone", hint: "Steady, or not enough leads to change yet.", actions: ["keep", "wait"], tone: styles.toneNeutral },
];

const ACTION_TONE: Record<CreativeAction, string> = {
  make_more: styles.toneGood,
  refresh: styles.toneBad,
  keep: styles.toneNeutral,
  wait: styles.toneNeutral,
};

export default function OpsMetaAdsWorkspace({ review }: { review: DemoAccountReview }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), 60 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [router]);

  const sorted = [...review.creatives].sort(
    (a, b) => ACTION_ORDER.indexOf(a.action) - ACTION_ORDER.indexOf(b.action) || b.spend - a.spend,
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
                href={`/inspired-closets/ops/ads?range=${days}`}
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
            {PLAN_COLUMNS.map((column) => (
              <PlanColumn
                key={column.id}
                label={column.label}
                hint={column.hint}
                tone={column.tone}
                items={creatives.filter((creative) => column.actions.includes(creative.action))}
              />
            ))}
          </div>
        </section>

        <AdsAnalystChat rangeDays={review.isDemo ? 7 : (review.rangeDays as 7 | 30 | 60)} />

        <div className={styles.kpiGrid}>
          {review.kpis.map((kpi) => (
            <Kpi key={kpi.label} kpi={kpi} />
          ))}
        </div>

        <section className={styles.panel}>
          <div className={styles.chartHead}>
            <div>
              <p className={styles.kicker}>Leads per day</p>
              <p className={styles.body}>Every campaign combined. Hover a bar for spend.</p>
            </div>
            <div className={styles.legend}>
              <span><i className={styles.legendMuted} /> {review.previousRange}</span>
              <span><i className={styles.legendInk} /> {review.currentRange}</span>
            </div>
          </div>
          <DailyLeadsChart points={review.daily} />
        </section>

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
          <section className={styles.panel}>
            <p className={styles.kicker}>Switched on, no spend</p>
            <p className={styles.body}>
              These {idle.length} ads are turned on in Meta but did not deliver in this period, so there is nothing to judge yet.
            </p>
            <ul className={styles.idleList}>
              {idle.map((creative) => (
                <li key={creative.key} className={styles.idleItem}>
                  {creative.image ? <img src={creative.image} alt="" className={styles.planThumb} /> : null}
                  <span>
                    <span className={styles.planItemName}>{creative.name}</span>
                    <span className={styles.planItemMeta}>{creative.campaignName}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className={styles.panel}>
          <p className={styles.kicker}>Campaign budgets</p>
          <p className={styles.body}>For whoever sets spend in Ads Manager. Budget changes are suggestions only.</p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Spend</th>
                <th>Leads</th>
                <th>Cost per lead</th>
                <th>Suggestion</th>
              </tr>
            </thead>
            <tbody>
              {review.campaigns.map((campaign) => (
                <tr key={campaign.key}>
                  <td>{campaign.name}</td>
                  <td>{campaign.spend.toLocaleString("en-US", { style: "currency", currency: "USD" })}</td>
                  <td>{campaign.leads}</td>
                  <td>
                    {campaign.previousCplLabel} → {campaign.cplLabel}
                  </td>
                  <td>{campaign.recommendation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </OpsShell>
  );
}

const PLAN_PREVIEW = 4;

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
              <a href={`#creative-${creative.key}`} className={styles.planItem}>
                {creative.image ? <img src={creative.image} alt="" className={styles.planThumb} /> : null}
                <span>
                  <span className={styles.planItemName}>{creative.name}</span>
                  <span className={styles.planItemMeta}>
                    {creative.cpl == null ? `${creative.leads} leads` : `${creative.cplLabel} per lead`}
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
        <span className={`${styles.change} ${tone}`}>{kpi.changeLabel}</span> vs {kpi.previous} in the previous period
      </p>
    </section>
  );
}

function CreativeCard({ creative, targetCpl }: { creative: CreativeReview; targetCpl: number | null }) {
  const tone = ACTION_TONE[creative.action];
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
          <span className={styles.actionChip}>{creative.actionLabel}</span>
          <span className={styles.confidence}>{creative.confidence.toLowerCase()} confidence</span>
        </div>
        <h3 className={styles.cardTitle}>{creative.name}</h3>
        <p className={styles.creativeMeta}>
          {creative.statusLabel} · {creative.angle} · running {creative.runningDays} days · {creative.campaignName}
        </p>
        <p className={styles.creativeHeadline}>{creative.headline}</p>

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
