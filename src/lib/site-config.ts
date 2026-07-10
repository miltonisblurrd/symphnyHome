/** Public site configuration — set NEXT_PUBLIC_SITE_URL in production (e.g. https://symphny.xyz) */

export const siteConfig = {
  name: "Symphony Studio",
  legalName: "Symphony Studio, LLC",
  tagline: "Orchestrating systems, workflows, and intelligence for coordinated performance.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://symphny.xyz",
  email: "hello@symphonystudio.io",
  privacyEmail: "privacy@symphonystudio.io",
  legalEmail: "legal@symphonystudio.io",
  /** Nevada — update county if your registered office differs */
  governingLawState: "Nevada",
  venueCounty: "Clark",
  ogImage: "/og-orchestra-dither.png",
  bookingUrl:
    process.env.NEXT_PUBLIC_BOOKING_URL ?? "https://calendly.com/symphonystudio/discovery",
} as const;
