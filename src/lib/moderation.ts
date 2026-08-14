/**
 * Message safety screening — extension point only.
 *
 * LYVE does NOT run AI moderation today and must never claim to. This module
 * is a deterministic, local, best-effort heuristic that flags a message for
 * later human or automated review. It never blocks delivery, never tells the
 * sender or recipient anything, and never calls an external service.
 *
 * A future moderation provider plugs in by implementing `MessageScreener` and
 * being passed to `screenMessage` — no call site has to change.
 */

export const MODERATION_CATEGORIES = [
  "financial_solicitation",
  "scam",
  "threat",
  "harassment",
  "spam",
  "malicious_link",
  "sexual_exploitation",
] as const;

export type ModerationCategory = (typeof MODERATION_CATEGORIES)[number];

export type ModerationVerdict = {
  /** Categories the screener believes may apply. Advisory only. */
  flags: ModerationCategory[];
  /** True when at least one category matched. */
  flagged: boolean;
  /** Identifier of the screener that produced the verdict. */
  screener: string;
};

export interface MessageScreener {
  readonly id: string;
  screen(body: string): Promise<ModerationVerdict> | ModerationVerdict;
}

const PATTERNS: Array<{ category: ModerationCategory; pattern: RegExp }> = [
  {
    category: "financial_solicitation",
    pattern:
      /\b(send|wire|transfer|lend|borrow)\s+(me\s+)?(some\s+)?(money|cash|funds)\b|\b(western union|moneygram|iban|paypal\.me|cash ?app|zelle|gift ?card)\b/i,
  },
  {
    category: "scam",
    pattern:
      /\b(crypto|bitcoin|btc|usdt|forex|binary option|investment opportunity|guaranteed (return|profit)|double your money)\b/i,
  },
  { category: "threat", pattern: /\b(kill you|hurt you|find you|i know where you live|watch your back)\b/i },
  {
    category: "harassment",
    pattern: /\b(shut up|worthless|stupid bitch|you're disgusting|slut|whore)\b/i,
  },
  {
    category: "spam",
    pattern: /\b(follow me on|subscribe to my|promo code|click here now|limited offer)\b/i,
  },
  {
    category: "malicious_link",
    pattern: /\b(?:https?:\/\/)?(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|is\.gd|cutt\.ly)\/\S+/i,
  },
  {
    category: "sexual_exploitation",
    pattern: /\b(nudes?|sex ?cam|only ?fans|pay(?:ing)? for (?:photos|content)|sugar (?:daddy|mommy|baby))\b/i,
  },
];

/** The built-in, local, non-AI screener. Deterministic and dependency free. */
export const heuristicScreener: MessageScreener = {
  id: "lyve-heuristic-v1",
  screen(body: string): ModerationVerdict {
    const text = (body ?? "").slice(0, 4000);
    const flags = PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ category }) => category);
    return { flags, flagged: flags.length > 0, screener: heuristicScreener.id };
  },
};

/**
 * Screens a message body. Swap `screener` for a moderation provider later;
 * failures are swallowed so a screening outage can never drop a message.
 */
export async function screenMessage(
  body: string,
  screener: MessageScreener = heuristicScreener,
): Promise<ModerationVerdict> {
  try {
    return await screener.screen(body);
  } catch {
    return { flags: [], flagged: false, screener: "unavailable" };
  }
}
