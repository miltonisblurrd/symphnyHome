import { siteConfig } from "@/lib/site-config";

export type LegalSection = {
  id: string;
  title: string;
  paragraphs: string[];
  list?: string[];
};

const effectiveDate = "June 4, 2026";

export const termsSections: LegalSection[] = [
  {
    id: "agreement",
    title: "1. Agreement to these terms",
    paragraphs: [
      `These Terms of Service ("Terms") are a binding legal agreement between you ("you," "User," or "Customer") and ${siteConfig.legalName}, a Nevada limited liability company ("Symphony Studio," "we," "us," or "our").`,
      `By accessing or using our website at ${siteConfig.url}, our AI chat, MCP interfaces, APIs, subscribing to any paid or free service tier, booking a call, submitting a contact form, or otherwise using our offerings (collectively, the "Services"), you agree to these Terms and our Privacy Policy. If you do not agree, do not use the Services.`,
      `For paid subscriptions, you represent that you have authority to bind your organization. Your organization's use of the Services constitutes acceptance on its behalf.`,
    ],
  },
  {
    id: "eligibility",
    title: "2. Eligibility",
    paragraphs: [
      "You must be at least 18 years old and able to form a binding contract. You may not use the Services if you are barred under applicable law or if we have previously suspended or terminated your access.",
    ],
  },
  {
    id: "services",
    title: "3. Services",
    paragraphs: [
      "Symphony Studio provides business orchestration consulting, workflow coordination, AI integration guidance, and related professional services as described on our site and in separate statements of work or order forms where applicable.",
      "Website content, chat responses, and MCP tool outputs are for general information and sales discovery. They do not constitute legal, financial, tax, or professional advice unless expressly agreed in a signed engagement letter.",
    ],
  },
  {
    id: "subscriptions",
    title: "4. Subscriptions and payment",
    paragraphs: [
      "Subscription tiers, pricing, and scope are described on our Pricing page and in your order or contract. Fees are billed as stated at signup unless otherwise agreed in writing.",
      "Unless your contract states otherwise, subscriptions renew automatically until cancelled. You are responsible for applicable taxes. Late or failed payment may result in suspension.",
      "Refunds are provided only where required by law or expressly stated in your agreement.",
    ],
  },
  {
    id: "chat-ai",
    title: "5. AI chat and automated tools",
    paragraphs: [
      "Our chat and AI features may produce inaccurate, incomplete, or outdated information. You must independently verify any output before relying on it for business decisions.",
      "You are solely responsible for prompts you submit and for how you use outputs. Do not submit confidential information you are not authorized to share, regulated health data, payment card data, or illegal content through chat unless we have executed a data processing agreement covering that use.",
      "We may use third-party AI providers (e.g., Anthropic) to process prompts. Their use is subject to our Privacy Policy and acceptable use restrictions.",
    ],
  },
  {
    id: "acceptable-use",
    title: "6. Acceptable use",
    paragraphs: ["You agree not to:"],
    list: [
      "Violate any law, regulation, or third-party rights;",
      "Probe, scan, or test vulnerabilities; bypass rate limits or access controls;",
      "Scrape, harvest, or bulk-download site or API content without written permission;",
      "Reverse engineer, decompile, or attempt to extract source code or models except as permitted by law;",
      "Upload malware, spam, or content that is harassing, defamatory, obscene, or infringing;",
      "Impersonate Symphony Studio, our personnel, or other users;",
      "Use the Services to develop competing products using unauthorized access to our systems;",
      "Abuse chat or APIs (including automated flooding, jailbreak attempts, or resource exhaustion).",
    ],
  },
  {
    id: "user-responsibility",
    title: "7. Your responsibility and conduct",
    paragraphs: [
      "You are responsible for all activity under your account, devices, and network. Any misuse, abuse, or violation of these Terms attributable to you or your organization is your fault and liability, not ours.",
      "You agree to cooperate with reasonable abuse investigations. We may preserve and disclose information as required by law or to protect our rights, users, and systems.",
    ],
  },
  {
    id: "ip",
    title: "8. Intellectual property",
    paragraphs: [
      "We own the Services, site content, branding, and materials we provide, except for your data and pre-existing materials. You receive a limited, non-exclusive, non-transferable license to use the Services during your subscription or while we make them available.",
      "You retain ownership of content you submit. You grant us a license to host, process, and display that content as needed to operate the Services and improve safety and quality.",
    ],
  },
  {
    id: "confidentiality",
    title: "9. Confidentiality",
    paragraphs: [
      "Non-public information exchanged under a mutual NDA or engagement letter remains confidential as stated there. Public website and marketing materials are not confidential.",
    ],
  },
  {
    id: "disclaimer",
    title: "10. Disclaimer of warranties",
    paragraphs: [
      'THE SERVICES ARE PROVIDED "AS IS" AND "AS AVAILABLE." TO THE MAXIMUM EXTENT PERMITTED BY NEVADA AND FEDERAL LAW, WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, AND ACCURACY OF AI OUTPUTS.',
    ],
  },
  {
    id: "liability",
    title: "11. Limitation of liability",
    paragraphs: [
      "TO THE MAXIMUM EXTENT PERMITTED BY LAW, SYMPHONY STUDIO AND ITS MEMBERS, MANAGERS, OFFICERS, EMPLOYEES, AND AGENTS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR LOST PROFITS, REVENUE, DATA, OR GOODWILL.",
      `OUR TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF THESE TERMS OR THE SERVICES WILL NOT EXCEED THE GREATER OF (A) AMOUNTS YOU PAID US FOR THE SERVICES IN THE TWELVE (12) MONTHS BEFORE THE CLAIM, OR (B) ONE HUNDRED U.S. DOLLARS ($100).`,
      "Some jurisdictions do not allow certain limitations; in those cases our liability is limited to the fullest extent permitted.",
    ],
  },
  {
    id: "indemnity",
    title: "12. Indemnification",
    paragraphs: [
      "You will defend, indemnify, and hold harmless Symphony Studio and its affiliates from any claims, damages, losses, liabilities, costs, and expenses (including reasonable attorneys' fees) arising from: (a) your use or misuse of the Services; (b) your content or conduct; (c) your violation of these Terms or law; or (d) dispute between you and any third party related to your use of the Services.",
    ],
  },
  {
    id: "termination",
    title: "13. Suspension and termination",
    paragraphs: [
      "We may suspend or terminate access immediately for breach, abuse, risk to systems or users, non-payment, or legal requirement. You may stop using the Services at any time; cancellation terms follow your subscription agreement.",
      "Sections that by nature should survive (payment obligations, IP, disclaimers, liability limits, indemnity, dispute resolution, governing law) survive termination.",
    ],
  },
  {
    id: "disputes",
    title: "14. Dispute resolution",
    paragraphs: [
      `Before filing suit, you agree to email ${siteConfig.legalEmail} with a written description of the dispute and allow thirty (30) days to resolve informally.`,
      `Except for injunctive relief for IP or abuse, any dispute arising from these Terms or the Services will be resolved by binding arbitration administered by the American Arbitration Association under its Commercial Arbitration Rules. The seat of arbitration is ${siteConfig.governingLawState}. The arbitrator may award costs and fees to the prevailing party as permitted by law.`,
      "YOU AND SYMPHONY STUDIO WAIVE ANY RIGHT TO A JURY TRIAL OR TO PARTICIPATE IN A CLASS ACTION, COLLECTIVE ACTION, OR REPRESENTATIVE PROCEEDING.",
    ],
  },
  {
    id: "governing-law",
    title: "15. Governing law and venue",
    paragraphs: [
      `These Terms are governed by the laws of the State of ${siteConfig.governingLawState}, without regard to conflict-of-law rules.`,
      `For matters not subject to arbitration, you consent to exclusive jurisdiction in the state and federal courts located in ${siteConfig.venueCounty} County, ${siteConfig.governingLawState}, and waive objections to venue and forum non conveniens.`,
    ],
  },
  {
    id: "changes",
    title: "16. Changes",
    paragraphs: [
      `We may update these Terms by posting a revised version with a new effective date. Material changes will be noted on the site. Continued use after the effective date constitutes acceptance. If you disagree, stop using the Services.`,
    ],
  },
  {
    id: "misc",
    title: "17. General",
    paragraphs: [
      "These Terms, the Privacy Policy, and any signed order form or SOW together form the entire agreement regarding the Services unless otherwise stated.",
      "If any provision is unenforceable, the remainder stays in effect. Our failure to enforce a provision is not a waiver. You may not assign these Terms without our consent; we may assign in connection with a merger or sale.",
    ],
  },
  {
    id: "contact",
    title: "18. Contact",
    paragraphs: [
      `Questions: ${siteConfig.legalEmail} · ${siteConfig.email}`,
      `Effective date: ${effectiveDate}`,
    ],
  },
];

export const privacySections: LegalSection[] = [
  {
    id: "intro",
    title: "1. Introduction",
    paragraphs: [
      `${siteConfig.legalName} ("Symphony Studio," "we," "us") respects your privacy. This Privacy Policy explains how we collect, use, disclose, and protect information when you visit ${siteConfig.url}, use chat or MCP features, subscribe to services, or contact us.`,
      "By using the Services, you acknowledge this Policy. If you do not agree, do not use the Services.",
    ],
  },
  {
    id: "controller",
    title: "2. Who we are",
    paragraphs: [
      `Controller: ${siteConfig.legalName}`,
      `Privacy inquiries: ${siteConfig.privacyEmail}`,
      `General contact: ${siteConfig.email}`,
      `Registered / principal state: ${siteConfig.governingLawState}, United States`,
    ],
  },
  {
    id: "collect",
    title: "3. Information we collect",
    paragraphs: ["We may collect:"],
    list: [
      "Identifiers: name, email, company, phone, billing contact when you submit forms or contracts;",
      "Commercial information: subscription tier, transaction history;",
      "Internet activity: pages viewed, referrers, device/browser type, approximate location from IP;",
      "Chat content: messages and prompts you send to our AI chat, and responses generated;",
      "Technical logs: timestamps, API usage, security and abuse signals;",
      "Cookies and similar technologies as described below.",
    ],
  },
  {
    id: "use",
    title: "4. How we use information",
    paragraphs: ["We use information to:"],
    list: [
      "Provide, operate, and secure the Services;",
      "Respond to inquiries and deliver subscribed orchestration services;",
      "Process payments and manage accounts;",
      "Improve site performance, chat quality, and user experience;",
      "Detect abuse, fraud, and violations of our Terms;",
      "Comply with law and enforce our agreements;",
      "Send service-related communications (you may opt out of marketing where required).",
    ],
  },
  {
    id: "ai",
    title: "5. AI and chat processing",
    paragraphs: [
      "Chat messages may be processed by third-party AI providers to generate responses. Do not submit information you are not permitted to share. We instruct providers contractually where available to use data only to provide the service, not for their public model training, subject to their policies.",
      "We may retain chat logs for safety, quality, and legal compliance for a limited period, then delete or de-identify them per our retention schedule.",
    ],
  },
  {
    id: "share",
    title: "6. When we disclose information",
    paragraphs: ["We may share information with:"],
    list: [
      "Service providers (hosting, CDN, email, analytics, payment, AI inference) under confidentiality obligations;",
      "Professional advisors (lawyers, accountants) under privilege where applicable;",
      "Authorities when required by law or to protect rights and safety;",
      "Successors in a merger, acquisition, or asset sale with notice where required.",
    ],
  },
  {
    id: "no-sale",
    title: "6a. No sale of personal information",
    paragraphs: ["We do not sell your personal information for money."],
  },
  {
    id: "cookies",
    title: "7. Cookies and analytics",
    paragraphs: [
      "We use essential cookies for security and session operation. If we enable analytics (e.g., privacy-focused analytics), we will disclose the provider here and honor opt-out mechanisms where applicable.",
      "You can control cookies through browser settings; disabling some cookies may limit functionality.",
    ],
  },
  {
    id: "retention",
    title: "8. Retention",
    paragraphs: [
      "We retain information only as long as needed for the purposes above, contractual obligations, and legal requirements. Chat logs and server logs are typically retained for shorter periods unless needed for an investigation or dispute.",
    ],
  },
  {
    id: "security",
    title: "9. Security",
    paragraphs: [
      "We implement reasonable administrative, technical, and organizational safeguards. No method of transmission or storage is 100% secure. Notify us promptly at privacy@symphonystudio.io if you believe your account or data has been compromised.",
    ],
  },
  {
    id: "rights",
    title: "10. Your rights",
    paragraphs: [
      "Depending on where you live, you may have rights to access, correct, delete, or port personal information, and to opt out of certain processing (including targeted advertising or sale/sharing under California and Nevada privacy laws).",
      "Nevada residents may submit opt-out requests regarding sale of covered information (we do not sell personal information as defined by NRS 603A).",
      "To exercise rights, email privacy@symphonystudio.io. We may verify your identity. We will not discriminate against you for exercising privacy rights.",
    ],
  },
  {
    id: "children",
    title: "11. Children",
    paragraphs: [
      "The Services are not directed to children under 18. We do not knowingly collect their information. Contact us to request deletion if you believe we have collected a minor's data.",
    ],
  },
  {
    id: "international",
    title: "12. International users",
    paragraphs: [
      "We are based in the United States. If you access the Services from other regions, you consent to transfer and processing in the U.S., which may have different privacy laws than your country.",
    ],
  },
  {
    id: "changes-privacy",
    title: "13. Changes",
    paragraphs: [
      `We may update this Policy with a new effective date. Material changes will be posted on the site. Continued use constitutes acceptance.`,
      `Effective date: ${effectiveDate}`,
    ],
  },
];
