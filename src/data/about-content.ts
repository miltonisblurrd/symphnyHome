/** About page content — proof, testimonials, media paths */

export type AboutProofStat = {
  value: string;
  label: string;
};

export type AboutProofFeatured = {
  id: string;
  /** Drop file at public path; section falls back to poster if missing */
  videoSrc: string;
  posterSrc: string;
  /** Optional logo image in /public; uses logoText if omitted */
  logoSrc?: string;
  logoText: string;
  quote: string;
  attribution: string;
  role: string;
  stats: AboutProofStat[];
};

export type AboutProofSupporting = {
  id: string;
  title: string;
  clientType: string;
  outcome: string;
};

export const aboutProof = {
  eyebrow: "Proof in performance",
  headline: "When coordination clicks, the business feels it",
  featured: {
    id: "hvac-service",
    videoSrc: "/media/about-testimonial.mp4",
    posterSrc: "/heroes/hero-orchestra-dither-gold.png",
    logoSrc: "/proof-summit-logo.svg",
    logoText: "Summit Mechanical",
    quote:
      "We had talented technicians and good systems—but missed handoffs were still costing us jobs. Symphony didn't sell us more tools. They got sales, scheduling, and the field performing as one ensemble.",
    attribution: "Director of Operations",
    role: "Regional HVAC company",
    stats: [
      { value: "30 days", label: "to visible coordination gains" },
      { value: "Faster response", label: "on inbound service requests" },
      { value: "More booked jobs", label: "with fewer manual handoffs" },
    ],
  } satisfies AboutProofFeatured,
  supporting: [
    {
      id: "agency-growth",
      title: "Growth-stage agency",
      clientType: "Multi-client digital agency",
      outcome:
        "Unified reporting and delivery workflows—leadership finally sees performance across the whole firm.",
    },
    {
      id: "enterprise-ops",
      title: "Enterprise operations",
      clientType: "Regulated operations group",
      outcome:
        "Governed AI access with human-in-the-loop controls—coordination without compromising security.",
    },
  ] satisfies AboutProofSupporting[],
  caseStudiesHref: "/case-studies",
  caseStudiesLabel: "Read full case studies",
};
