/**
 * Message safety screening — thin compatibility layer over the Safety Engine.
 *
 * The real implementation now lives in `src/lib/safety-engine.ts`, which
 * returns a structured `{ riskLevel, categories, signals }` assessment. This
 * module keeps the older flag-shaped API used by the messaging pipeline and
 * the Phase 3 regression suite.
 *
 * LYVE does NOT run AI moderation and must never claim to. Screening is local,
 * deterministic, advisory, and never blocks delivery.
 */
import { assessContent, type SafetyCategory } from "@/lib/safety-engine";

export const MODERATION_CATEGORIES = [
  "financial_solicitation",
  "scam",
  "threat",
  "harassment",
  "spam",
  "malicious_link",
  "sexual_exploitation",
  "impersonation",
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

/** The engine's category names, mapped onto the stored message flag names. */
function toFlag(category: SafetyCategory): ModerationCategory {
  return category === "suspicious_link" ? "malicious_link" : category;
}

export interface MessageScreener {
  readonly id: string;
  screen(body: string): Promise<ModerationVerdict> | ModerationVerdict;
}

/** The built-in, local, non-AI screener. */
export const heuristicScreener: MessageScreener = {
  id: "lyve-heuristic-v2",
  async screen(body: string): Promise<ModerationVerdict> {
    const assessment = await assessContent(body);
    return {
      flags: assessment.categories.map(toFlag),
      flagged: assessment.categories.length > 0,
      screener: assessment.screener,
    };
  },
};

/** Screens a message body. Failures never drop a message. */
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
