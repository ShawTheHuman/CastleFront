import { BALANCE, TARGETS_PER_MAP } from '../data/balance';

/**
 * The difficulty ladder: the uniform level a "reference army" has when facing each target. Used
 * to size the outposts and to stagger the rival's late-unlocking buildings.
 */

/** Uniform level the reference army has when facing target `index` (0-based) of `map`. */
export function targetLevel(map: number, index: number): number {
  const cap = BALANCE.levelCapPerMap;
  const start = map === 1 ? 0 : cap * (map - 2) + BALANCE.hqLevel;
  const end = cap * (map - 1) + BALANCE.hqLevel;
  const frac = Math.pow((index + 1) / TARGETS_PER_MAP, BALANCE.sectorCurve);
  return Math.max(1, Math.round(start + (end - start) * frac));
}

/** Reference level of the target cleared just before reaching a global progress index. */
export function targetLevelAtProgress(progress: number): number {
  if (progress <= 0) return 0;
  const map = Math.floor((progress - 1) / TARGETS_PER_MAP) + 1;
  return targetLevel(map, (progress - 1) % TARGETS_PER_MAP);
}
