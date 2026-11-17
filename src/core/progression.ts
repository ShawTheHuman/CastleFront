import { D, Decimal } from './bignum';
import { armyPower, armyPowerFromLevels } from './army';
import { productionMultiplier } from './economy';
import { levelCap, levelOutput } from './formulas';
import type { GameState } from './types';
import { ASSETS } from '../data/assets';
import { BALANCE, TARGETS_PER_MAP } from '../data/balance';

/**
 * Enemies are tuned against a "reference army": every unlocked asset at the same level. That
 * keeps enemy power in step with the player's formulas whatever the balance knobs are, so tuning
 * the economy only changes *how long* things take, never whether they are possible.
 */

/** Uniform level the reference army has when facing target `index` (0-based) of `map`. */
export function targetLevel(map: number, index: number): number {
  const cap = BALANCE.levelCapPerMap;
  const start = map === 1 ? 0 : cap * (map - 2) + BALANCE.hqLevel;
  const end = cap * (map - 1) + BALANCE.hqLevel;
  const frac = Math.pow((index + 1) / TARGETS_PER_MAP, BALANCE.sectorCurve);
  return Math.max(1, Math.round(start + (end - start) * frac));
}

/** Reference level of the target that sits at a global progress index. */
function targetLevelAtProgress(progress: number): number {
  if (progress <= 0) return 0;
  const map = Math.floor((progress - 1) / TARGETS_PER_MAP) + 1;
  return targetLevel(map, (progress - 1) % TARGETS_PER_MAP);
}

/**
 * Reference army for a target. Assets unlocked part-way through lag behind by the level the
 * reference army had when they unlocked, so a new unit type never makes enemies jump.
 */
function referenceLevels(map: number, index: number): Record<string, number> {
  const progress = (map - 1) * TARGETS_PER_MAP + index;
  const lvl = Math.min(targetLevel(map, index), levelCap(map));
  return Object.fromEntries(
    ASSETS.filter((a) => a.unlockProgress <= progress).map((a) => [
      a.id,
      Math.max(0, lvl - targetLevelAtProgress(a.unlockProgress)),
    ]),
  );
}

export function isHQ(index: number): boolean {
  return index === TARGETS_PER_MAP - 1;
}

export function enemyPower(map: number, index: number): Decimal {
  return armyPowerFromLevels(referenceLevels(map, index)).mul(BALANCE.enemyPowerFactor);
}

/** Permanent gold/s added when this target is cleared. */
export function sectorGoldRate(map: number, index: number): Decimal {
  const market = ASSETS.find((a) => a.id === 'market');
  if (!market || market.effect.kind !== 'produce') return D(0);
  return levelOutput(market.effect.base, targetLevel(map, index))
    .mul(productionMultiplier(map))
    .mul(BALANCE.sectorGoldFraction);
}

export function sectorBounty(map: number, index: number): Decimal {
  return sectorGoldRate(map, index).mul(BALANCE.bountySeconds);
}

export function currentEnemyPower(state: GameState): Decimal {
  return enemyPower(state.map, state.sector);
}

export function canClearCurrent(state: GameState): boolean {
  return armyPower(state).gte(currentEnemyPower(state));
}

export type ProgressEvent =
  | { kind: 'sectorCleared'; map: number; index: number; bounty: Decimal; goldRate: Decimal }
  | { kind: 'mapCleared'; map: number; newCap: number };

/** Clear the current target (no power check). Advances to the next map after the HQ. */
export function clearCurrent(state: GameState): ProgressEvent[] {
  const { map, sector } = state;
  const bounty = sectorBounty(map, sector);
  const goldRate = sectorGoldRate(map, sector);
  state.resources.gold = state.resources.gold.add(bounty);
  state.conquestGold = state.conquestGold.add(goldRate);
  const events: ProgressEvent[] = [{ kind: 'sectorCleared', map, index: sector, bounty, goldRate }];
  if (isHQ(sector)) {
    state.map += 1;
    state.sector = 0;
    events.push({ kind: 'mapCleared', map, newCap: levelCap(state.map) });
  } else {
    state.sector += 1;
  }
  return events;
}

/**
 * Idle auto-push: clear targets for as long as army power beats them. Phase 3 replaces the
 * instant resolution with a real battle for active play.
 */
export function autoAdvance(state: GameState, maxTargets = Infinity): ProgressEvent[] {
  const events: ProgressEvent[] = [];
  let n = 0;
  while (n < maxTargets && canClearCurrent(state)) {
    events.push(...clearCurrent(state));
    n++;
  }
  return events;
}
