import { enAuth } from "./en.auth";
import { enDiscover } from "./en.discover";
import { enMessages } from "./en.messages";
import { enAdmin } from "./en.admin";
import { enBilling } from "./en.billing";
import { enSupport } from "./en.support";

export const en = {
  meta: {
    languageName: "English",
    dir: "ltr",
  },
  brand: {
    name: "LYVE",
    tagline: "Meet. Match. Belong.",
  },
  nav: {
    skipToContent: "Skip to main content",
    openMenu: "Open navigation menu",
    closeMenu: "Close navigation menu",
    howItWorks: "How it works",
    compatibility: "Compatibility",
    intent: "Intent",
    safety: "Safety",
    premium: "Premium",
    faq: "FAQ",
    signIn: "Sign in",
    getStarted: "Create Your Profile",
    languageLabel: "Language",
    changeLanguage: "Change language",
  },
  hero: {
    eyebrow: "Global 18+ dating, relationships & marriage",
    title: "LYVE",
    tagline: "Meet. Match. Belong.",
    supporting: "Discover people who match your vibe, goals, and way of life.",
    primaryCta: "Create Your Profile",
    secondaryCta: "Explore LYVE",
    note: "LYVE is an 18+ platform. You choose what you are looking for — we never assume it.",
    cardName: "Example profile",
    cardMeta: "Placeholder — illustrative UI only",
    cardIntent: "Serious Relationship",
  },
  how: {
    title: "How LYVE works",
    subtitle: "A calm, deliberate path from first hello to something real.",
    steps: [
      {
        title: "Create your profile",
        body: "Share who you are, what you enjoy, and how you live — in your words.",
      },
      {
        title: "Declare your intent",
        body: "Tell us what you are looking for. Your intent shapes everything you see.",
      },
      {
        title: "Discover thoughtfully",
        body: "See people suggested for compatibility, not endless scrolling.",
      },
      {
        title: "Match and talk",
        body: "Conversations open when interest is mutual, with safety tools built in.",
      },
      {
        title: "Get to know each other",
        body: "Move at your own pace with prompts that go beyond small talk.",
      },
      {
        title: "Build a relationship",
        body: "Whatever belonging means to you — LYVE is designed to support it.",
      },
    ],
  },
  compatibility: {
    title: "Compatibility, explained",
    subtitle: "LYVE shows why someone may suit you — never a black box, never a promise.",
    exampleBadge: "UI example",
    scoreLabel: "Match",
    reasonsTitle: "Why this could work",
    reasons: [
      "Shared interests",
      "Similar lifestyle",
      "Compatible relationship goals",
      "Preferred age range",
    ],
    disclaimer:
      "Example only. This score is illustrative interface content, not a real calculated result.",
  },
  intent: {
    title: "You define what you are looking for",
    subtitle: "Intent is set by you and can be changed at any time in your settings.",
    items: [
      { title: "Dating", body: "Meet people, enjoy the moment, see where it goes." },
      {
        title: "Serious Relationship",
        body: "Looking for commitment and a shared direction.",
      },
      { title: "Marriage", body: "Ready to build a life with the right person." },
      {
        title: "New Connections",
        body: "Widen your world and meet people who get you.",
      },
      {
        title: "Open to Possibilities",
        body: "Still figuring it out — and honest about it.",
      },
    ],
  },
  safety: {
    title: "Designed for safer connections",
    subtitle:
      "Safety is part of the product, not a page in the help centre. Some protections below are planned for later phases and are clearly marked.",
    items: [
      { title: "18+ only", body: "Date of birth is required and adults only, always." },
      { title: "Reporting", body: "Report any profile, photo, or message in a few taps." },
      { title: "Blocking", body: "Block and unmatch instantly — no explanation needed." },
      {
        title: "Verification",
        body: "Tiered verification badges so you know who you are talking to.",
      },
      {
        title: "Privacy controls",
        body: "Control who sees you. We never show your phone, email, or exact location.",
      },
      {
        title: "Scam awareness",
        body: "Warnings around money requests and common romance-scam patterns.",
      },
      {
        title: "Moderation",
        body: "Human review for high-risk reports, with an appeal path.",
      },
    ],
    plannedBadge: "Planned",
    note: "Identity verification and automated moderation are not yet operational. Nothing here is a guarantee of safety.",
  },
  premium: {
    title: "LYVE Premium",
    subtitle: "A preview of planned features. Nothing is for sale yet.",
    plannedBadge: "Planned feature",
    items: [
      "Unlimited Likes",
      "See Who Likes You",
      "Advanced Filters",
      "Incognito Mode",
      "Boost",
      "Super Like",
    ],
    note: "No payment provider is connected. Pricing and availability will be announced later.",
  },
  testimonials: {
    title: "Stories from the community",
    subtitle: "Real member stories will appear here once LYVE launches.",
    placeholder: "Testimonial placeholder",
    placeholderBody:
      "This space is reserved for a verified member story. We do not publish invented reviews.",
  },
  faq: {
    title: "Frequently asked questions",
    subtitle: "Everything you may want to know before you start.",
    items: [
      {
        q: "Is LYVE a religious dating platform?",
        a: "No. LYVE is a global platform for adults of any background looking for dating, serious relationships, marriage, or new connections.",
      },
      {
        q: "Who can join LYVE?",
        a: "Adults aged 18 and over. A date of birth is required at sign-up and underage accounts are removed.",
      },
      {
        q: "How does LYVE decide what to show me?",
        a: "Your declared intent carries the most weight, alongside interests, lifestyle, and your discovery preferences. Every suggestion comes with readable reasons.",
      },
      {
        q: "Is the compatibility score on this page real?",
        a: "No. All numbers and profiles shown on this page are interface examples used to illustrate the design.",
      },
      {
        q: "Does LYVE cost money?",
        a: "LYVE will have a free tier. Premium features are still in design and no payment system is connected yet.",
      },
    ],
  },
  footer: {
    description:
      "A global 18+ platform for dating, relationships, and marriage. Meet. Match. Belong.",
    product: "Product",
    company: "Company",
    legal: "Legal",
    links: {
      howItWorks: "How it works",
      compatibility: "Compatibility",
      safety: "Safety",
      premium: "Premium",
      faq: "FAQ",
      about: "About",
      careers: "Careers",
      press: "Press",
      contact: "Contact",
      privacy: "Privacy Policy",
      terms: "Terms of Service",
      cookies: "Cookie Policy",
      guidelines: "Community Guidelines",
      safetyCentre: "Safety Centre",
    },
    comingSoon: "Coming soon",
    companyInfo: {
      nameLabel: "Company",
      nameValue: "LYVE",
      locationLabel: "Based in",
      locationValue: "United States",
      supportLabel: "Support",
      supportValue:
        "Official support runs through in-app tickets — open one from your account for questions, complaints, or reports.",
    },
    rights: "All rights reserved.",
    ageNotice: "18+ only",
  },

  theme: {
    label: "Appearance",
    light: "Light",
    dark: "Dark",
    switchToDark: "Switch to dark mode",
    switchToLight: "Switch to light mode",
  },
  legal: {
    backToHome: "Back to home",
    statusLabel: "Status",
    statusValue: "Draft — not final",
    effectiveLabel: "Last updated",
    draftTitle: "This document is a draft",
    draftBody:
      "The text below is a structural placeholder created during early product design. It is not legal advice, not a binding agreement, and it has not been reviewed by a lawyer. Final wording will be published before LYVE opens to the public.",
    outlineTitle: "What this document will cover",
    contentsTitle: "Contents",
    questionsTitle: "Questions about this page",
    questionsBody:
      "Contact details will be published together with the final version of this document.",
    pages: {
      privacy: {
        title: "Privacy Policy",
        description:
          "How LYVE collects, uses, stores, and deletes personal data, and how to request deletion.",
        status: "In effect",
        effective: "16 August 2026",
        intro:
          "LYVE is operated by LYVE, based in the United States. This policy explains what information we collect, why we collect it, where it is processed, how long we keep it, and how you can access or delete it.",
        notice: {
          title: "Data is processed in the United States",
          body: "LYVE stores and processes member data on servers located in the United States. If you use LYVE from outside the United States, you understand that your information — including profile content, photos, and messages — is transferred to and processed in the United States, which may have different data protection laws than your country. By creating an account you consent to this transfer.",
        },
        contact: {
          title: "Deletion requests and privacy contact",
          body: 'You can delete your account at any time from Settings, which starts a scheduled purge of your data. To request access, correction, export, or deletion in writing, open a support ticket inside the app with the category "Account"; that ticket is our official channel for privacy requests and is answered by the LYVE privacy team. Include the email address on your account so we can verify the request.',
        },
        sections: [
          {
            title: "Information we collect",
            body: "Account details (email, date of birth, first name), profile content you choose to add (photos, prompts, preferences, relationship intent), messages you send on the platform, safety signals such as reports and blocks, and technical data needed to run and secure the service.",
          },
          {
            title: "Why we use it",
            body: "To create and operate your account, verify that you are 18 or older, suggest compatible members, deliver messages, detect abuse and fraud, meet legal obligations, and improve the product. We do not sell personal data.",
          },
          {
            title: "What is never shown to other members",
            body: "Your email address, phone number, exact address, precise GPS coordinates, date of birth, and any payment data are never displayed to other members. Location is shown only as an approximate area you have chosen.",
          },
          {
            title: "Where data is processed",
            body: "Data is hosted and processed in the United States by LYVE and its infrastructure providers, who act on our instructions under contract. Cross-border access by our support and safety staff is limited to what a request or investigation requires and is logged.",
          },
          {
            title: "Your choices and controls",
            body: "You can edit or remove profile content, change visibility settings, unmatch, block, and report at any time, request a copy of your data, correct inaccurate information, and delete your account.",
          },
          {
            title: "Retention and deletion",
            body: "Active account data is kept while your account exists. When you delete your account, your profile and photos stop being visible immediately and are permanently purged on a scheduled daily job. Limited records — safety reports, moderation decisions, audit logs, and billing records — are retained for a longer period where required for platform safety, fraud prevention, and legal or tax obligations.",
          },
          {
            title: "Minors",
            body: "LYVE is strictly for adults 18 and over. We do not knowingly collect data from anyone under 18; accounts found to belong to a minor are terminated and their data deleted.",
          },
          {
            title: "Security",
            body: "Access to member data is restricted by row-level database policies, role-based staff permissions, and audit logging. Photos are stored in private storage and served through short-lived signed links.",
          },
          {
            title: "Changes to this policy",
            body: "If we make material changes we will update the date at the top of this page and notify members in the app before the change takes effect.",
          },
        ],
      },
      terms: {
        title: "Terms of Service",
        description:
          "The rules for using LYVE: 18+ eligibility, member conduct, account termination, and deletion.",
        status: "In effect",
        effective: "16 August 2026",
        intro:
          "These terms form the agreement between you and LYVE, based in the United States. By creating an account you accept them. If you do not accept them, do not use LYVE.",
        notice: {
          title: "LYVE is strictly 18+",
          body: "You must be at least 18 years old to create or use a LYVE account. You confirm your date of birth at sign-up, and providing a false date of birth is a breach of these terms. Any account we determine belongs to a person under 18 is terminated immediately and its data deleted, without notice and without refund.",
        },
        contact: {
          title: "Contact, appeals, and account deletion",
          body: "Support, legal notices, appeals against moderation decisions, and account deletion requests all go through the in-app support ticket system, which is our official contact channel. You can also delete your account yourself at any time from Settings; deletion removes your profile from LYVE immediately and purges your data on our scheduled daily job.",
        },
        sections: [
          {
            title: "Eligibility",
            body: "LYVE is available to adults aged 18 and over who are legally able to enter a contract and who have not previously been removed from the platform. One account per person.",
          },
          {
            title: "Your account",
            body: "You are responsible for the accuracy of the information you provide, for keeping your credentials secure, and for all activity on your account. Impersonation and shared or resold accounts are prohibited.",
          },
          {
            title: "Acceptable use",
            body: "No harassment, hate speech, threats, sexual content involving minors, nudity sent without consent, impersonation, spam, solicitation, fundraising, commercial promotion, scams, or requests for money. No scraping, automated access, or attempts to bypass safety systems.",
          },
          {
            title: "Content you share",
            body: "You keep ownership of the content you post and remain responsible for it. You grant LYVE a limited, non-exclusive licence to host, display, and process that content solely to operate the service. You must have the right to share every photo you upload.",
          },
          {
            title: "Safety, moderation, and appeals",
            body: "We may warn, limit features, suspend, or terminate an account that breaches these terms or endangers members. Where a decision is not the result of a legal requirement or severe harm, you may appeal it through the in-app support ticket system.",
          },
          {
            title: "Ending your account",
            body: "You may delete your account at any time from Settings. We may terminate accounts for breach of these terms, for a legal requirement, or if we discontinue the service. Provisions on liability, disputes, and retained records survive termination.",
          },
          {
            title: "Paid features",
            body: "Premium features are not currently sold. If and when paid subscriptions launch, they will be billed through the Apple App Store or Google Play, and their pricing, renewal, cancellation, and refund terms will be published and shown to you before purchase.",
          },
          {
            title: "Disclaimers and limits",
            body: 'LYVE does not run background checks on members and cannot guarantee any member\'s identity, conduct, or intentions. You are responsible for your own safety when interacting with or meeting other members. The service is provided "as is" to the maximum extent permitted by law.',
          },
          {
            title: "Governing law",
            body: "These terms are governed by the laws of the United States and the state in which LYVE is established, without regard to conflict-of-law rules.",
          },
          {
            title: "Changes to these terms",
            body: "We may update these terms; the date at the top of this page shows the last change. Material changes are announced in the app before they take effect, and continued use after that date means you accept them.",
          },
        ],
      },
      guidelines: {
        title: "Community Guidelines",
        description: "Draft outline of the behaviour LYVE expects and what is not tolerated.",
        intro:
          "These guidelines will describe the tone of the community: respectful, honest, and free from pressure.",
        sections: [
          {
            title: "Be genuine",
            body: "Use your own photos, your real age, and describe yourself honestly.",
          },
          {
            title: "Be respectful",
            body: "No harassment, hate speech, threats, or unsolicited explicit content.",
          },
          {
            title: "Respect intent",
            body: "Every member chooses what they are looking for. Do not pressure anyone to change it.",
          },
          {
            title: "No commercial or financial activity",
            body: "No selling, promotion, fundraising, or requests for money of any kind.",
          },
          {
            title: "How enforcement will work",
            body: "Warnings, feature limits, and removal, with a route to appeal a decision.",
          },
        ],
      },

      safety: {
        title: "Safety Centre",
        description:
          "Draft outline of LYVE safety guidance, reporting tools, and planned protections.",
        intro:
          "This page will bring together practical safety advice and the tools available inside LYVE. Some tools described in the product are planned and not yet operational.",
        sections: [
          {
            title: "Before you meet",
            body: "Take your time, keep chats on the platform, and share plans with someone you trust.",
          },
          {
            title: "Meeting in person",
            body: "Choose a public place, arrange your own transport, and leave whenever you want to.",
          },
          {
            title: "Recognising romance scams",
            body: "Requests for money, urgency, refusal to video call, and stories that keep changing.",
          },
          {
            title: "Reporting and blocking",
            body: "How to report a profile, photo, or message, and how blocking will work.",
          },
          {
            title: "Local emergency help",
            body: "If you are in immediate danger, contact your local emergency services first.",
          },
        ],
      },
    },
  },
  ...enAuth,
  ...enDiscover,
  ...enMessages,
  ...enAdmin,
  ...enBilling,
  ...enSupport,
};

export type Dictionary = typeof en;
