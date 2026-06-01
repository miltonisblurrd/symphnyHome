export type NavLink = {
  label: string;
  href: string;
};

export type FooterColumn = {
  title: string;
  links: NavLink[];
};

export const footerColumns: FooterColumn[] = [
  {
    title: "Company",
    links: [
      { label: "About Us", href: "/about" },
      { label: "How It Works", href: "/how-it-works" },
      { label: "Pricing", href: "/pricing" },
      { label: "Enterprise", href: "/enterprise" },
    ],
  },
  {
    title: "For Business",
    links: [
      { label: "Solutions We Offer", href: "/solutions" },
      { label: "Case Studies", href: "/case-studies" },
      { label: "Contact Sales", href: "/contact" },
    ],
  },
  {
    title: "Safety",
    links: [
      { label: "Safety Approach", href: "/safety" },
      { label: "Security & Privacy", href: "/security" },
      { label: "Trust & Transparency", href: "/trust" },
    ],
  },
  {
    title: "Support/Resources",
    links: [
      { label: "News", href: "/news" },
      { label: "Careers", href: "/careers" },
      { label: "How-To Videos", href: "/how-to-videos" },
      { label: "FAQs", href: "/faq" },
    ],
  },
  {
    title: "Terms & Policies",
    links: [
      { label: "Terms of Service", href: "/terms" },
      { label: "Privacy Policy", href: "/privacy" },
    ],
  },
];

export const headerCta = {
  label: "Give Us a Call",
  href: "/contact",
};
