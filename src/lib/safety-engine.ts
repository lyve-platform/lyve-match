/**
 * LYVE Safety Engine — deterministic, local, advisory.
 *
 * The engine accepts content and returns a structured assessment:
 *
 *   { riskLevel, categories, signals }
 *
 * It is NOT AI, it never calls an external service, it never blocks delivery,
 * and it never takes an automatic enforcement action. Its only job is to hand
 * authorised moderation systems a prioritisation hint. Human review remains
 * the final authority.
 *
 * A future provider plugs in by implementing `ContentScreener` and being
 * passed to `assessContent` — no call site has to change.
 */

export const SAFETY_CATEGORIES = [
  "scam",
  "financial_solicitation",
  "spam",
  "harassment",
  "threat",
  "suspicious_link",
  "sexual_exploitation",
  "impersonation",
] as const;

export type SafetyCategory = (typeof SAFETY_CATEGORIES)[number];

/** Ordered from least to most severe; the assessment takes the maximum. */
export const RISK_LEVELS = ["none", "low", "medium", "high"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export type SafetySignal = {
  category: SafetyCategory;
  /** Per-rule severity, folded into the overall risk level. */
  severity: Exclude<RiskLevel, "none">;
  /** Stable machine-readable rule id. Detection patterns are never exposed. */
  rule: string;
};

export type SafetyAssessment = {
  riskLevel: RiskLevel;
  categories: SafetyCategory[];
  signals: SafetySignal[];
  screener: string;
};

export interface ContentScreener {
  readonly id: string;
  assess(content: string): Promise<SafetyAssessment> | SafetyAssessment;
}

type Rule = {
  rule: string;
  category: SafetyCategory;
  severity: Exclude<RiskLevel, "none">;
  pattern: RegExp;
};

/**
 * Internal rule table. Deliberately not exported: exact detection rules are
 * not something the product should reveal to reported users or attackers.
 */
const RULES: Rule[] = [
  {
    rule: "fin.transfer",
    category: "financial_solicitation",
    severity: "high",
    pattern:
      /\b(send|wire|transfer|lend|borrow)\s+(me\s+)?(some\s+)?(money|cash|funds)\b|\b(western union|moneygram|iban|paypal\.me|cash ?app|zelle|gift ?card)\b/i,
  },
  {
    rule: "scam.investment",
    category: "scam",
    severity: "high",
    pattern:
      /\b(crypto|bitcoin|btc|usdt|forex|binary option|investment opportunity|guaranteed (return|profit)|double your money)\b/i,
  },
  {
    rule: "threat.violence",
    category: "threat",
    severity: "high",
    pattern: /\b(kill you|hurt you|find you|i know where you live|watch your back)\b/i,
  },
  {
    rule: "harassment.abuse",
    category: "harassment",
    severity: "medium",
    pattern: /\b(shut up|worthless|stupid bitch|you're disgusting|slut|whore)\b/i,
  },
  {
    rule: "spam.promotion",
    category: "spam",
    severity: "low",
    pattern: /\b(follow me on|subscribe to my|promo code|click here now|limited offer)\b/i,
  },
  {
    rule: "link.shortener",
    category: "suspicious_link",
    severity: "medium",
    pattern: /\b(?:https?:\/\/)?(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|is\.gd|cutt\.ly)\/\S+/i,
  },
  {
    rule: "sexual.exploitation",
    category: "sexual_exploitation",
    severity: "high",
    pattern:
      /\b(nudes?|sex ?cam|only ?fans|pay(?:ing)? for (?:photos|content)|sugar (?:daddy|mommy|baby))\b/i,
  },
  {
    rule: "impersonation.identity",
    category: "impersonation",
    severity: "medium",
    pattern:
      /\b(this is my (?:real|other) account|i am actually|verify (?:your|my) (?:identity|account) (?:here|now)|official (?:support|admin) team)\b/i,
  },
];

const RANK: Record<RiskLevel, number> = { none: 0, low: 1, medium: 2, high: 3 };

function foldRisk(signals: SafetySignal[]): RiskLevel {
  let level: RiskLevel = "none";
  for (const signal of signals) {
    if (RANK[signal.severity] > RANK[level]) level = signal.severity;
  }
  // Several independent low/medium hits together are worth a closer look.
  if (level === "low" && signals.length >= 3) return "medium";
  if (level === "medium" && signals.length >= 3) return "high";
  return level;
}

/** The built-in, local, non-AI screener. Deterministic and dependency free. */
export const heuristicContentScreener: ContentScreener = {
  id: "lyve-heuristic-v2",
  assess(content: string): SafetyAssessment {
    const text = (content ?? "").slice(0, 4000);
    const signals: SafetySignal[] = RULES.filter(({ pattern }) => pattern.test(text)).map(
      ({ rule, category, severity }) => ({ rule, category, severity }),
    );
    return {
      riskLevel: foldRisk(signals),
      categories: [...new Set(signals.map((signal) => signal.category))],
      signals,
      screener: heuristicContentScreener.id,
    };
  },
};

/**
 * Assesses content. Failures are swallowed so a screening outage can never
 * drop or delay a message.
 */
export async function assessContent(
  content: string,
  screener: ContentScreener = heuristicContentScreener,
): Promise<SafetyAssessment> {
  try {
    return await screener.assess(content);
  } catch {
    return { riskLevel: "none", categories: [], signals: [], screener: "unavailable" };
  }
}
