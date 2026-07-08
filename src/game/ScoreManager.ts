import type { JudgmentTier } from "./JudgmentEngine";

const TIER_SCORE: Record<JudgmentTier, number> = {
  Great: 100,
  Good: 50,
  Bad: 0,
};

export class ScoreManager {
  private score: number;
  private counts: Record<JudgmentTier, number>;

  constructor() {
    this.score = 0;
    this.counts = { Great: 0, Good: 0, Bad: 0 };
  }

  addJudgment(tier: JudgmentTier): void {
    this.score += TIER_SCORE[tier];
    this.counts[tier] += 1;
  }

  getScore(): number {
    return this.score;
  }

  getCounts(): Record<JudgmentTier, number> {
    return { ...this.counts };
  }
}
