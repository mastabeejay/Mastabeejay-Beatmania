import { SCRATCH_LANE, type NoteEvent } from "../game/types";
import type { KeyZone, ResolvedScratchZone } from "../handTracking/ZoneLayout";

const NOTE_HEIGHT_PX = 18;
const SCRATCH_NOTE_RADIUS_PX = 13;

export class NoteRenderer {
  private ctx: CanvasRenderingContext2D;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  draw(notes: NoteEvent[], zones: KeyZone[], resolvedScratch: ResolvedScratchZone, songTimeMs: number, lookaheadMs: number, width: number, height: number): void {
    const hitLineFrac = zones[0]?.yMin ?? 0.66;
    const hitLinePx = hitLineFrac * height;

    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(0, hitLinePx);
    this.ctx.lineTo(width, hitLinePx);
    this.ctx.stroke();

    const { cx: scratchTargetX, cy: scratchTargetY } = resolvedScratch;

    for (const note of notes) {
      // Position is recomputed fresh from songTimeMs every call — never accumulated frame-to-frame —
      // so a dropped/delayed render frame can't drift the note out of sync with the audio.
      const timeUntilHit = note.timeMs - songTimeMs;
      const progress = 1 - timeUntilHit / lookaheadMs;

      if (note.lane === SCRATCH_LANE) {
        // A capsule/tube spanning the whole hold window, not a single instant: the leading (head)
        // end represents the start time and arrives at the disk first; the trailing (tail) end
        // represents the end time and follows behind by an amount proportional to durationMs. The
        // player should keep sliding for as long as the tube is passing through the disk.
        const durationMs = note.durationMs ?? 0;
        const yHead = progress * scratchTargetY;
        const yTail = yHead - (durationMs / lookaheadMs) * scratchTargetY;

        const radius = SCRATCH_NOTE_RADIUS_PX;
        const top = Math.min(yTail, yHead);
        const capsuleHeight = Math.max(Math.abs(yHead - yTail), radius * 2);

        this.ctx.fillStyle = "#ff9100";
        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.roundRect(scratchTargetX - radius, top, radius * 2, capsuleHeight, radius);
        this.ctx.fill();
        this.ctx.stroke();
        continue;
      }

      const zone = zones[note.lane];
      if (!zone) continue;

      const y = progress * hitLinePx;
      const x = zone.xMin * width;
      const w = (zone.xMax - zone.xMin) * width;

      this.ctx.fillStyle = "#00e5ff";
      this.ctx.fillRect(x, y - NOTE_HEIGHT_PX / 2, w, NOTE_HEIGHT_PX);
    }
  }
}
