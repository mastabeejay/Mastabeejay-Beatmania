import type { JudgmentResult } from "../game/JudgmentEngine";
import { SCRATCH_LANE } from "../game/types";
import { resolveScratchZone, type KeyZone, type ScratchZone } from "../handTracking/ZoneLayout";
import { t, type TKey } from "../i18n";

interface ActiveJudgment extends JudgmentResult {
  expiresAtMs: number;
  /** Combo count *after* this judgment — 0 for a Bad (which breaks the combo), so no "Combo 0" is
   *  ever shown. */
  combo: number;
}

const DISPLAY_DURATION_MS = 500;

const TIER_COLOR: Record<string, string> = {
  Excellent: "#ffd200",
  Great: "#00f0ff",
  Good: "#39ff8a",
  Bad: "#ff2ee0",
};

// The popup shows the translated judgment word (per the site owner's request — these were English
// in every language before); the internal tier names stay English as code-level identifiers.
const TIER_LABEL_KEY: Record<string, TKey> = {
  Excellent: "judgeExcellent",
  Great: "judgeGreat",
  Good: "judgeGood",
  Bad: "judgeBad",
};

export class JudgmentRenderer {
  private ctx: CanvasRenderingContext2D;
  private active: ActiveJudgment[];

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    this.active = [];
  }

  register(result: JudgmentResult, combo: number): void {
    this.active.push({ ...result, combo, expiresAtMs: performance.now() + DISPLAY_DURATION_MS });
  }

  draw(zones: KeyZone[], scratchZone: ScratchZone, width: number, height: number): void {
    const now = performance.now();
    this.active = this.active.filter((judgment) => judgment.expiresAtMs > now);

    const hitLineY = (zones[0]?.yMin ?? 0.66) * height;
    const resolvedScratch = resolveScratchZone(scratchZone, width, height);

    for (const judgment of this.active) {
      const isScratch = judgment.lane === SCRATCH_LANE;
      const zone = zones[judgment.lane];
      const cx = isScratch ? resolvedScratch.cx : zone ? ((zone.xMin + zone.xMax) / 2) * width : width / 2;
      const baseY = isScratch ? resolvedScratch.cy : hitLineY;

      const remaining = (judgment.expiresAtMs - now) / DISPLAY_DURATION_MS; // 1 -> 0
      const riseOffset = (1 - remaining) * 30;
      const alpha = Math.min(1, remaining * 2);

      const color = TIER_COLOR[judgment.tier] ?? "#fff";
      this.ctx.globalAlpha = alpha;
      this.ctx.fillStyle = color;
      this.ctx.font = "900 28px Orbitron, sans-serif";
      this.ctx.textAlign = "center";
      this.ctx.shadowColor = color;
      this.ctx.shadowBlur = 16;
      const tierLabel = TIER_LABEL_KEY[judgment.tier] ? t(TIER_LABEL_KEY[judgment.tier]) : judgment.tier;
      this.ctx.fillText(tierLabel, cx, baseY - 30 - riseOffset);
      if (judgment.combo > 0) {
        this.ctx.font = "700 15px Orbitron, sans-serif";
        this.ctx.fillStyle = "#ffd200";
        this.ctx.shadowColor = "#ffd200";
        this.ctx.fillText(`${t("comboLabel")} ${judgment.combo}`, cx, baseY - 8 - riseOffset);
      }
      this.ctx.shadowBlur = 0;
      this.ctx.globalAlpha = 1;
    }
    this.ctx.textAlign = "start";
  }
}
