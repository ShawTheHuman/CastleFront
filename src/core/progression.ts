import { D, type Decimal } from './bignum';
import { armyPower, armyPowerFromLevels } from './army';
import { productionMultiplier } from './economy';
import { levelCap, levelOutput } from './formulas';
import { targetLevel, targetLevelAtProgress } from './ladder';
import { raidLoss, resetRival, rivalIsFull, rivalPower } from './rival';
import type { GameState, ResourceId } from './types';
import { ASSETS } from '../data/assets';
import { BALANCE, TARGETS_PER_MAP } from '../data/balance';

/**
 * Each map has `sectorsPerMap` enemy outposts on the road between the bases, then the rival's
 * base. Outposts have fixed strength, sized against a "reference army" (every unlocked army
 * building at the same level), and fall automatically once the army is strong enough. The base
 * is defended by the rival's live army, and the player decides when to assault it.
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

/** True for the last target on a map: the rival's base. */
export function isHQ(index: number): boolean {
  return index === TARGETS_PER_MAP - 1;
}

/** Fixed strength of an outpost (for the base, the reference strength it was tuned against). */
export function enemyPower(map: number, index: number): Decimal {
  return armyPowerFromLevels(referenceLevels(map, index)).mul(BALANCE.enemyPowerFactor);
}

/** Permanent gold/s added when this target is taken. */
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

/** Strength of whatever the army faces next: an outpost, or the rival's live army. */
export function currentEnemyPower(state: GameState): Decimal {
  return isHQ(state.sector) ? rivalPower(state) : enemyPower(state.map, state.sector);
}

/** Whether the army would take the next outpost on its own (never true for the base). */
export function canClearCurrent(state: GameState): boolean {
  return !isHQ(state.sector) && armyPower(state).gte(currentEnemyPower(state));
}

export type ProgressEvent =
  | { kind: 'sectorCleared'; map: number; index: number; bounty: Decimal; goldRate: Decimal }
  | { kind: 'mapCleared'; map: number; newCap: number }
  | { kind: 'assaultFailed'; ours: Decimal; theirs: Decimal; readyIn: number }
  | { kind: 'rivalRepelled'; ours: Decimal; theirs: Decimal }
  | {
      kind: 'rivalRaid';
      ours: Decimal;
      theirs: Decimal;
      losses: Partial<Record<ResourceId, Decimal>>;
      nextIn: number;
    };

/** Take the current target (no power check). Taking the base conquers the map. */
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
    resetRival(state);
    events.push({ kind: 'mapCleared', map, newCap: levelCap(state.map) });
  } else {
    state.sector += 1;
  }
  return events;
}

/** Idle auto-push: take outposts for as long as the army beats them. Stops at the rival's base. */
export function autoAdvance(state: GameState, maxTargets = Infinity): ProgressEvent[] {
  const events: ProgressEvent[] = [];
  let n = 0;
  while (n < maxTargets && canClearCurrent(state)) {
    events.push(...clearCurrent(state));
    n++;
  }
  return events;
}

export interface AssaultPreview {
  /** All outposts are taken, so the base can be attacked. */
  reachable: boolean;
  /** Seconds until the army has regrouped after a failed assault (0 = ready). */
  regroupIn: number;
  ours: Decimal;
  theirs: Decimal;
  /** The assault would succeed right now. */
  wins: boolean;
}

export function assaultPreview(state: GameState): AssaultPreview {
  const ours = armyPower(state);
  const theirs = rivalPower(state);
  return {
    reachable: isHQ(state.sector),
    regroupIn: Math.max(0, state.assaultReadyAt - state.playTime),
    ours,
    theirs,
    wins: ours.gte(theirs),
  };
}

/** The player attacks the rival's base. Win: the map is conquered. Lose: the army regroups. */
export function assault(state: GameState): ProgressEvent[] {
  const p = assaultPreview(state);
  if (!p.reachable || p.regroupIn > 0) return [];
  if (p.wins) return clearCurrent(state);
  const readyIn = BALANCE.assaultCooldownMinutes * 60;
  state.assaultReadyAt = state.playTime + readyIn;
  return [{ kind: 'assaultFailed', ours: p.ours, theirs: p.theirs, readyIn }];
}

/**
 * At full strength the rival attacks. If the army holds, it counter-attacks and takes every
 * remaining outpost and the base. If not, the rival raids the stores and attacks again later.
 */
export function checkRivalAttack(state: GameState): ProgressEvent[] {
  if (!rivalIsFull(state) || state.playTime < state.rival.nextAttackAt) return [];
  const ours = armyPower(state);
  const theirs = rivalPower(state);
  if (ours.gte(theirs)) {
    const events: ProgressEvent[] = [{ kind: 'rivalRepelled', ours, theirs }];
    const map = state.map;
    while (state.map === map) events.push(...clearCurrent(state));
    return events;
  }
  const losses = raidLoss(state);
  for (const [r, v] of Object.entries(losses) as [ResourceId, Decimal][]) {
    state.resources[r] = state.resources[r].sub(v);
  }
  const nextIn = BALANCE.rivalAttackCooldownHours * 3600;
  state.rival.nextAttackAt = state.playTime + nextIn;
  return [{ kind: 'rivalRaid', ours, theirs, losses, nextIn }];
}
