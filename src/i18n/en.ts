import { enAuth } from "./en.auth";
import { enDiscover } from "./en.discover";
import { enMessages } from "./en.messages";

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
    subtitle:
      "LYVE shows why someone may suit you — never a black box, never a promise.",
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
    subtitle:
      "Intent is set by you and can be changed at any time in your settings.",
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
    cta: "Join the waitlist",
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
      {
        q: "Which languages does LYVE support?",
        a: "English and Arabic at launch, with full right-to-left support. More languages will follow.",
      },
    ],
  },
  cta: {
    title: "Ready to meet someone who fits your life?",
    body: "Create a profile, set your intent, and start meeting people on your terms.",
    primary: "Create Your Profile",
    secondary: "Explore LYVE",
    emailLabel: "Email address",
    emailPlaceholder: "you@example.com",
    submit: "Notify me",
    errorRequired: "Please enter your email address.",
    errorInvalid: "Please enter a valid email address.",
    success: "Thanks — this is a Phase 0 preview, so nothing was sent or stored.",
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
    draftTitle: "This document is a draft",
    draftBody:
      "The text below is a structural placeholder created during early product design. It is not legal advice, not a binding agreement, and it has not been reviewed by a lawyer. Final wording will be published before LYVE opens to the public.",
    outlineTitle: "What this document will cover",
    questionsTitle: "Questions about this page",
    questionsBody:
      "Contact details will be published together with the final version of this document.",
    pages: {
      privacy: {
        title: "Privacy Policy",
        description:
          "Draft outline of how LYVE plans to handle personal data, choices, and controls.",
        intro:
          "This page will explain what information LYVE collects, why it is collected, how long it is kept, and the controls you have over it.",
        sections: [
          {
            title: "Information we plan to collect",
            body: "Account details, profile content you choose to share, and technical data needed to run the service.",
          },
          {
            title: "How information will be used",
            body: "To operate your account, suggest people, keep the platform safe, and improve the product.",
          },
          {
            title: "What we will never display",
            body: "Your phone number, email address, exact address, precise location, and payment data are never shown to other members.",
          },
          {
            title: "Your choices and controls",
            body: "Visibility settings, data export, correction, and account deletion will be described here in detail.",
          },
          {
            title: "Retention and deletion",
            body: "How long different categories of data are kept, and what happens after you delete your account.",
          },
        ],
      },
      terms: {
        title: "Terms of Service",
        description:
          "Draft outline of the rules for using LYVE, eligibility, and account responsibilities.",
        intro:
          "This page will set out the agreement between you and LYVE: who may use the service, what is expected of members, and how accounts can end.",
        sections: [
          {
            title: "Eligibility",
            body: "LYVE is for adults aged 18 and over. Accounts belonging to minors are removed.",
          },
          {
            title: "Your account",
            body: "Accuracy of the information you provide, keeping access secure, and one account per person.",
          },
          {
            title: "Acceptable use",
            body: "Behaviour that is not allowed, including harassment, impersonation, solicitation, and fraud.",
          },
          {
            title: "Content you share",
            body: "What you remain responsible for, and the limited permissions LYVE needs to display it.",
          },
          {
            title: "Suspension and ending an account",
            body: "When access may be limited, how appeals work, and how you can close your account.",
          },
        ],
      },
      guidelines: {
        title: "Community Guidelines",
        description:
          "Draft outline of the behaviour LYVE expects and what is not tolerated.",
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
};

export type Dictionary = typeof en;
