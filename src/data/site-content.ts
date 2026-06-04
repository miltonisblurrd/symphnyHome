import type { Metadata } from "next";
import { siteConfig } from "@/lib/site-config";

type PageContent = {
  title: string;
  description: string;
  lead?: string;
  stub?: string;
};

export const pageContent = {
  about: {
    title: "About Us",
    description:
      "Where technology meets harmony. Symphony Studio orchestrates systems, workflows, and intelligence so businesses perform at their best.",
    lead:
      "Symphony Studio helps businesses perform at their best by orchestrating the systems, workflows, and intelligence that drive modern operations.",
  },
  howItWorks: {
    title: "How It Works",
    description:
      "The symphony model: musicians, sheet music, performers, orchestra pit, and conductor—applied to modern operations.",
    lead:
      "Most businesses keep buying instruments. We help you hire a conductor—ongoing orchestration with clarity, coordination, and performance.",
  },
  pricing: {
    title: "Pricing",
    description: "Prelude, Concerto, and Symphony Enterprise—ongoing orchestration, not one-off projects.",
    lead:
      "A symphony isn't rehearsed once and forgotten. Subscription tiers reflect continuous tuning as your business scales.",
  },
  enterprise: {
    title: "Enterprise",
    description:
      "Orchestration for complex environments—when coordination, security, and visibility are non-negotiable.",
    lead:
      "Enterprise leaders ask why teams are disconnected, why work takes so long, and why systems keep breaking. We orchestrate the answer.",
  },
  solutions: {
    title: "Solutions We Offer",
    description:
      "Workflow orchestration, AI performers, and enterprise orchestration layers from Symphony Studio.",
    lead:
      "We don't sell software, AI, or automation. We orchestrate systems, workflows, and intelligence into one coordinated operating system.",
  },
  caseStudies: {
    title: "Case Studies",
    description: "When coordination—not talent—was the bottleneck, and what changed.",
    lead: "Talented teams, capable tools—and chaos until the instruments played together.",
  },
  contact: {
    title: "Contact Sales",
    description: "Reach Symphony Studio or book a discovery call.",
    lead:
      "Tell us where coordination breaks down today—handoffs, visibility, disconnected tools—and what performance should look like.",
  },
  safety: {
    title: "Safety Approach",
    description: "Reliability-first orchestration—coordination that reduces stress, not creates it.",
    lead:
      "We stabilize before we accelerate. Orchestration should make operations calmer, not more fragile.",
  },
  security: {
    title: "Security & Privacy",
    description: "The orchestra pit—governed access connecting intelligence to real information.",
    lead:
      "Without a secure orchestration layer, AI guesses. With it, performers understand—through permissions, audit trails, and control.",
  },
  trust: {
    title: "Trust & Transparency",
    description: "Clarity and observability—so coordination doesn't fail silently.",
    lead:
      "If you can't see it fail, it will fail silently. We design for visibility, human checkpoints, and explainable systems.",
  },
  news: {
    title: "News",
    description: "Symphony Studio news and updates.",
    stub: "Updates and announcements will be published here. Check back soon.",
  },
  careers: {
    title: "Careers",
    description: "Work at Symphony Studio.",
    stub:
      "We're building the team that helps businesses perform at their best through orchestration—not more noise. Open roles will be listed here.",
  },
  howToVideos: {
    title: "How-To Videos",
    description: "Symphony Studio how-to videos and walkthroughs.",
    stub: "Video guides on coordination, orchestration, and performance will be added here.",
  },
  faq: {
    title: "FAQs",
    description: "Frequently asked questions about Symphony Studio.",
    lead: "Coordination, subscription, enterprise, and how we're different from automation agencies and AI vendors.",
  },
  terms: {
    title: "Terms of Service",
    description: "Symphony Studio terms of service.",
    stub:
      "Draft placeholder. Final terms of service will be published after legal review. Contact hello@symphonystudio.io with questions.",
  },
  privacy: {
    title: "Privacy Policy",
    description: "Symphony Studio privacy policy.",
    stub:
      "Draft placeholder. Final privacy policy will be published after legal review. Contact hello@symphonystudio.io with questions.",
  },
} as const satisfies Record<string, PageContent>;

const pagePaths: Record<keyof typeof pageContent, string> = {
  about: "/about",
  howItWorks: "/how-it-works",
  pricing: "/pricing",
  enterprise: "/enterprise",
  solutions: "/solutions",
  caseStudies: "/case-studies",
  contact: "/contact",
  safety: "/safety",
  security: "/security",
  trust: "/trust",
  faq: "/faq",
  news: "/news",
  careers: "/careers",
  howToVideos: "/how-to-videos",
  terms: "/terms",
  privacy: "/privacy",
};

export function buildMetadata(key: keyof typeof pageContent): Metadata {
  const page = pageContent[key];
  const title = `${page.title} | Symphony Studio`;
  const url = `${siteConfig.url.replace(/\/$/, "")}${pagePaths[key]}`;

  return {
    title,
    description: page.description,
    metadataBase: new URL(siteConfig.url),
    openGraph: {
      title,
      description: page.description,
      url,
      siteName: siteConfig.name,
      images: [{ url: siteConfig.ogImage, width: 1200, height: 630, alt: siteConfig.name }],
      locale: "en_US",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: page.description,
      images: [siteConfig.ogImage],
    },
  };
}
