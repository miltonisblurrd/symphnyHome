import { siteConfig } from "@/lib/site-config";

export default function SiteJsonLd() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: siteConfig.name,
        legalName: siteConfig.legalName,
        url: siteConfig.url,
        email: siteConfig.email,
        description: siteConfig.tagline,
      },
      {
        "@type": "WebSite",
        name: siteConfig.name,
        url: siteConfig.url,
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
