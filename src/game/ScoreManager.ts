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
  private combo: number;
  private counts: Record<JudgmentTier, number>;

  constructor() {
    this.score = 0;
    this.combo = 0;
    this.counts = { Excellent: 0, Great: 0, Good: 0, Bad: 0 };
  }

  /** Good/Great/Excellent extend the combo by 1 and add a combo bonus on top of the tier's own
   *  score; Bad resets the combo to 0 and earns no bonus — same "a miss breaks your streak" rule
   *  as any other rhythm game's combo counter. */
  addJudgment(tier: JudgmentTier): JudgmentOutcome {
    this.counts[tier] += 1;
    if (tier === "Bad") {
      this.combo = 0;
      this.score += TIER_SCORE[tier];
    } else {
      this.combo += 1;
      this.score += TIER_SCORE[tier] + this.combo * COMBO_BONUS_PER_COMBO;
    }
    return { score: this.score, combo: this.combo };
  }

  getScore(): number {
    return this.score;
  }

  getCombo(): number {
    return this.combo;
  }

  getCounts(): Record<JudgmentTier, number> {
    return { ...this.counts };
  }
}
