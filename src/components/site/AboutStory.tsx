"use client";

import Link from "next/link";
import AboutProof from "@/components/site/AboutProof";
import AboutReveal from "@/components/site/AboutReveal";
import { brand, philosophy, successMetrics, symphonyModel } from "@/data/studio-data";
import { headerCta } from "@/data/site-nav";
import styles from "./site.module.css";

const pillarCopy = philosophy.designPrinciples.slice(0, 3);

export default function AboutStory() {
  return (
    <>
      <section className={styles.aboutPillars} aria-labelledby="about-pillars-title">
        <div className={styles.aboutSectionInner}>
          <AboutReveal>
            <p className={styles.aboutEyebrow} id="about-pillars-title">
              What we stand for
            </p>
            <h2 className={styles.aboutSectionTitle}>
              {brand.pillars.join(" · ")}
            </h2>
          </AboutReveal>

          <div className={styles.aboutPillarGrid}>
            {pillarCopy.map((pillar, index) => (
              <AboutReveal key={pillar.name} delay={index * 90}>
                <article className={styles.aboutPillarCard}>
                  <span className={styles.aboutPillarIndex}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className={styles.aboutPillarName}>{pillar.name}</h3>
                  <p className={styles.aboutPillarText}>{pillar.description}</p>
                </article>
              </AboutReveal>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.aboutBeliefs} aria-labelledby="about-beliefs-title">
        <div className={styles.aboutSectionInner}>
          <AboutReveal>
            <blockquote className={styles.aboutQuote}>
              <p>{philosophy.coreBeliefs[0]}</p>
            </blockquote>
          </AboutReveal>

          <AboutReveal delay={80}>
            <h2 id="about-beliefs-title" className={styles.aboutSectionTitleDark}>
              What we believe
            </h2>
            <ul className={styles.aboutBeliefList}>
              {philosophy.coreBeliefs.map((belief) => (
                <li key={belief}>{belief}</li>
              ))}
            </ul>
          </AboutReveal>
        </div>
      </section>

      <section className={styles.aboutProblem} aria-labelledby="about-problem-title">
        <div className={styles.aboutSectionInner}>
          <AboutReveal>
            <p className={styles.aboutEyebrowLight}>The problem we exist to solve</p>
            <h2 id="about-problem-title" className={styles.aboutProblemTitle}>
              Most businesses don&apos;t have a software problem.
              <span className={styles.aboutProblemAccent}>
                {" "}
                They have a coordination problem.
              </span>
            </h2>
            <p className={styles.aboutProblemBody}>
              Leads come in, sales follows up, operations schedules, project managers
              coordinate, accounting tracks invoices, leadership tries to see what&apos;s
              happening—everyone is talented, everyone has tools, yet things still feel
              chaotic.
            </p>
            <p className={styles.aboutProblemMono}>
              The instruments aren&apos;t playing together.
            </p>
          </AboutReveal>
        </div>
      </section>

      <section className={styles.aboutModel} aria-labelledby="about-model-title">
        <div className={styles.aboutSectionInner}>
          <AboutReveal>
            <p className={styles.aboutEyebrow}>The symphony model</p>
            <h2 id="about-model-title" className={styles.aboutSectionTitle}>
              From musicians to conductor
            </h2>
            <p className={styles.aboutSectionLead}>
              We explain what we do through the metaphor of an orchestra—because
              coordination, not more tools, is what creates performance.
            </p>
          </AboutReveal>

          <ol className={styles.aboutModelTimeline}>
            {symphonyModel.map((layer, index) => (
              <AboutReveal key={layer.layer} delay={index * 70}>
                <li className={styles.aboutModelStep}>
                  <div className={styles.aboutModelMarker}>
                    <span className={styles.aboutModelNumber}>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <article className={styles.aboutModelCard}>
                    <p className={styles.aboutModelLayer}>{layer.layer}</p>
                    <p className={styles.aboutModelRole}>{layer.role}</p>
                    <p className={styles.aboutModelDescription}>{layer.description}</p>
                    <ul className={styles.aboutModelTags}>
                      {layer.examples.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </article>
                </li>
              </AboutReveal>
            ))}
          </ol>
        </div>
      </section>

      <AboutProof />

      <section className={styles.aboutPrinciples} aria-labelledby="about-principles-title">
        <div className={styles.aboutSectionInner}>
          <AboutReveal>
            <p className={styles.aboutEyebrowDark}>How we orchestrate</p>
            <h2 id="about-principles-title" className={styles.aboutSectionTitleDark}>
              Design principles
            </h2>
          </AboutReveal>

          <div className={styles.aboutPrincipleGrid}>
            {philosophy.designPrinciples.map((principle, index) => (
              <AboutReveal key={principle.name} delay={index * 60}>
                <article className={styles.aboutPrincipleCard}>
                  <h3>{principle.name}</h3>
                  <p>{principle.description}</p>
                </article>
              </AboutReveal>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.aboutMetrics} aria-labelledby="about-metrics-title">
        <div className={styles.aboutSectionInner}>
          <AboutReveal>
            <p className={styles.aboutEyebrowLight}>How we measure success</p>
            <h2 id="about-metrics-title" className={styles.aboutProblemTitle}>
              Success is
              <span
                className={`${styles.aboutProblemAccent} ${styles.aboutMetricsAccentLine}`}
              >
                clarity, coordination, and performance.
              </span>
            </h2>
          </AboutReveal>

          <div className={styles.aboutMetricsGrid}>
            <AboutReveal delay={60}>
              <div className={styles.aboutMetricsColumn}>
                <h3>Operational</h3>
                <ul>
                  {successMetrics.operational.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </AboutReveal>
            <AboutReveal delay={120}>
              <div className={styles.aboutMetricsColumn}>
                <h3>Client experience</h3>
                <ul>
                  {successMetrics.clientExperience.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </AboutReveal>
          </div>

          <AboutReveal delay={160}>
            <p className={`${styles.aboutProblemMono} ${styles.aboutMetricsClose}`}>
              The instruments ARE playing together.
            </p>
          </AboutReveal>
        </div>
      </section>

      <section className={styles.aboutCta} aria-labelledby="about-cta-title">
        <div className={styles.aboutSectionInner}>
          <AboutReveal>
            <p className={styles.aboutEyebrowLight}>Next step</p>
            <h2 id="about-cta-title" className={styles.aboutCtaTitle}>
              Ready for the whole business to perform as one?
            </h2>
            <p className={styles.aboutCtaLead}>{brand.tagline}</p>
            <div className={styles.aboutCtaActions}>
              <Link href={headerCta.href} className={styles.aboutCtaPrimary}>
                {headerCta.label}
              </Link>
              <Link href="/how-it-works" className={styles.aboutCtaSecondary}>
                See how it works
              </Link>
            </div>
          </AboutReveal>
        </div>
      </section>
    </>
  );
}
