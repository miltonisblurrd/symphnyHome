import SiteCtaBand from "@/components/site/sections/SiteCtaBand";
import SiteSection from "@/components/site/sections/SiteSection";
import { philosophy } from "@/data/studio-data";
import styles from "../site.module.css";

type TrustSafetyStoryProps = {
  focus: "safety" | "security" | "trust";
};

const focusCopy = {
  safety: {
    quote: philosophy.riskPhilosophy[0],
    items: philosophy.riskPhilosophy,
    ctaSecondary: { href: "/trust", label: "Trust & transparency" },
  },
  security: {
    quote: "Without a secure orchestration layer, AI guesses.",
    items: philosophy.designPrinciples
      .filter((p) => ["Observability Is Mandatory", "Human Control Is Preserved"].includes(p.name))
      .map((p) => p.description),
    ctaSecondary: { href: "/enterprise", label: "Enterprise" },
  },
  trust: {
    quote: philosophy.designPrinciples.find((p) => p.name === "Observability Is Mandatory")
      ?.description,
    items: philosophy.riskPhilosophy,
    ctaSecondary: { href: "/safety", label: "Safety approach" },
  },
};

export default function TrustSafetyStory({ focus }: TrustSafetyStoryProps) {
  const copy = focusCopy[focus];

  return (
    <>
      <SiteSection variant="light">
        <blockquote className={styles.siteQuote}>
          <p>{copy.quote}</p>
        </blockquote>
        <ul className={styles.siteBeliefList}>
          {copy.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </SiteSection>

      <SiteSection variant="dark">
        <h2 className={styles.siteProblemTitle}>
          Reliability beats speed.
          <span className={styles.siteProblemAccent}> Coordination reduces stress.</span>
        </h2>
        <p className={styles.siteProblemMono}>
          A symphony isn&apos;t rehearsed once and forgotten—neither is a business.
        </p>
      </SiteSection>

      <SiteCtaBand
        title="Talk through governance and fit"
        secondaryHref={copy.ctaSecondary.href}
        secondaryLabel={copy.ctaSecondary.label}
      />
    </>
  );
}
