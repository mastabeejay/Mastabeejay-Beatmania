import type { JudgmentTier } from "./JudgmentEngine";

const TIER_SCORE: Record<JudgmentTier, number> = {
  Excellent: 60,
  Great: 40,
  Good: 20,
  Bad: -5,
};

/** Points added on top of a hit's own tier score, scaled by the combo count *after* this hit —
 *  e.g. the hit that brings the combo to 4 adds an extra 4 * 5 = 20. */
const COMBO_BONUS_PER_COMBO = 5;

export interface JudgmentOutcome {
  /** Running total after this judgment (tier score + combo bonus already applied). */
  score: number;
  /** Combo count after this judgment — 0 whenever this hit was a Bad, since that breaks it. */
  combo: number;
}

export class ScoreManager {
  private score: number;
  /** Raw consecutive-hit streak — keeps counting from the very first hit, unlike the public
   *  "combo" concept below which only starts once there's actually something to chain. */
  private streak: number;
  private counts: Record<JudgmentTier, number>;

  constructor() {
    this.score = 0;
    this.streak = 0;
    this.counts = { Excellent: 0, Great: 0, Good: 0, Bad: 0 };
  }

  /** Good/Great/Excellent extend the streak by 1; Bad resets it to 0 — same "a miss breaks your
   *  streak" rule as any other rhythm game's combo counter. A single hit isn't a "combo" though
   *  (there's nothing chained together yet), so the reported combo — and its score bonus — stays
   *  0 until the streak reaches 2; only from there on does it track the streak 1:1 and pay out
   *  combo * 5 on top of the tier's own score. */
  addJudgment(tier: JudgmentTier): JudgmentOutcome {
    this.counts[tier] += 1;
    if (tier === "Bad") {
      this.streak = 0;
      this.score += TIER_SCORE[tier];
      return { score: this.score, combo: 0 };
    }
    this.streak += 1;
    const combo = this.streak >= 2 ? this.streak : 0;
    this.score += TIER_SCORE[tier] + combo * COMBO_BONUS_PER_COMBO;
    return { score: this.score, combo };
  }

  getScore(): number {
    return this.score;
  }

  getCombo(): number {
    return this.streak >= 2 ? this.streak : 0;
  }

  getCounts(): Record<JudgmentTier, number> {
    return { ...this.counts };
  }
}
