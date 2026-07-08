import type { JudgmentResult } from "../game/JudgmentEngine";
import { SCRATCH_LANE } from "../game/types";
import type { KeyZone, ScratchZone } from "../handTracking/ZoneLayout";

interface ActiveJudgment extends JudgmentResult {
  expiresAtMs: number;
}

const DISPLAY_DURATION_MS = 500;

const TIER_COLOR: Record<string, string> = {
  Great: "#00f0ff",
  Good: "#39ff8a",
  Bad: "#ff2ee0",
};

export class JudgmentRenderer {
  private ctx: CanvasRenderingContext2D;
  private active: ActiveJudgment[];

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    this.active = [];
  }

  register(result: JudgmentResult): void {
    this.active.push({ ...result, expiresAtMs: performance.now() + DISPLAY_DURATION_MS });
  }

  draw(zones: KeyZone[], scratchZone: ScratchZone, width: number, height: number): void {
    const now = performance.now();
    this.active = this.active.filter((judgment) => judgment.expiresAtMs > now);

    const hitLineY = (zones[0]?.yMin ?? 0.66) * height;

    for (const judgment of this.active) {
      const isScratch = judgment.lane === SCRATCH_LANE;
      const zone = zones[judgment.lane];
      const cx = isScratch ? scratchZone.centerXPct * width : zone ? ((zone.xMin + zone.xMax) / 2) * width : width / 2;
      const baseY = isScratch ? scratchZone.centerYPct * height : hitLineY;

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
      this.ctx.fillText(judgment.tier, cx, baseY - 30 - riseOffset);
      this.ctx.shadowBlur = 0;
      this.ctx.globalAlpha = 1;
    }
    this.ctx.textAlign = "start";
  }
}
