import MarketingPage from "@/components/site/MarketingPage";
import styles from "@/components/site/site.module.css";
import { buildMetadata, pageContent } from "@/data/site-content";
import { philosophy } from "@/data/studio-data";

export const metadata = buildMetadata("trust");

export default function TrustPage() {
  const content = pageContent.trust;
  const trustPrinciples = philosophy.designPrinciples.filter((p) =>
    ["Clarity", "Coordination", "Observability Is Mandatory", "Human Control Is Preserved"].includes(
      p.name
    )
  );

  return (
    <MarketingPage title={content.title} lead={content.lead}>
      <section className={styles.marketingSection}>
        {trustPrinciples.map((principle) => (
          <div key={principle.name}>
            <h2>{principle.name}</h2>
            <p>{principle.description}</p>
          </div>
        ))}
        <p>
          Enterprise leaders don&apos;t wake up asking how to use AI—they ask why
          teams are disconnected, why work takes so long, and why systems keep
          breaking. Trust comes from coordination you can see and explain.
        </p>
      </section>
    </MarketingPage>
  );
}
