import {
  KEY_GAP_PCT,
  KEY_WIDTH_PCT,
  KEY_ZONE_X_START,
  KEY_ZONE_Y_RANGE,
  NUM_KEYS,
  SCRATCH_DISK_CENTER,
  SCRATCH_DISK_RADIUS_PCT,
} from "../app/AppConfig";

export interface KeyZone {
  lane: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface ScratchZone {
  centerXPct: number;
  centerYPct: number;
  radiusPct: number;
}

export function computeKeyZones(): KeyZone[] {
  const [yMin, yMax] = KEY_ZONE_Y_RANGE;
  const zones: KeyZone[] = [];
  for (let lane = 0; lane < NUM_KEYS; lane++) {
    const xMin = KEY_ZONE_X_START + lane * (KEY_WIDTH_PCT + KEY_GAP_PCT);
    zones.push({ lane, xMin, xMax: xMin + KEY_WIDTH_PCT, yMin, yMax });
  }
  return zones;
}

export function computeScratchZone(): ScratchZone {
  return {
    centerXPct: SCRATCH_DISK_CENTER.xPct,
    centerYPct: SCRATCH_DISK_CENTER.yPct,
    radiusPct: SCRATCH_DISK_RADIUS_PCT,
  };
}

export interface ResolvedScratchZone {
  cx: number;
  cy: number;
  r: number;
}

/** Resolves a ScratchZone's fractional geometry into actual pixels for the CURRENT canvas size,
 *  clamping the center on BOTH axes so the disk never extends past any edge. centerXPct/centerYPct
 *  were tuned against a specific aspect ratio, but the radius's basis (min(width,height)) diverges
 *  from width or height individually as the aspect ratio changes — e.g. a portrait-shaped canvas
 *  (width < height) has radius based on the narrow dimension while centerXPct is applied against
 *  that same narrow width, so a large-enough radius pushes cx + r past the right edge even though
 *  the disk fits fine vertically. Clamping only cy (as a previous version of this function did) left
 *  that horizontal case completely unguarded. Every consumer (the renderer, hit-testing, note/
 *  judgment placement) must go through this one function rather than each re-deriving cx/cy/r
 *  itself, or the visual disk and the interactive zone could drift apart. */
export function resolveScratchZone(zone: ScratchZone, width: number, height: number): ResolvedScratchZone {
  const r = zone.radiusPct * Math.min(width, height);
  const marginPx = 12;
  const clamp = (ideal: number, dimension: number) => Math.min(Math.max(ideal, r + marginPx), dimension - r - marginPx);
  return {
    cx: clamp(zone.centerXPct * width, width),
    cy: clamp(zone.centerYPct * height, height),
    r,
  };
}

/** x, y must already be in displayed (mirrored) screen-space fractions, matching zone coordinates. */
export function findZoneAt(zones: KeyZone[], x: number, y: number): KeyZone | null {
  return zones.find((zone) => x >= zone.xMin && x < zone.xMax && y >= zone.yMin && y <= zone.yMax) ?? null;
}
