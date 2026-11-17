import { D, type Decimal } from './bignum';
import { levelOutput } from './formulas';
import { RESOURCE_IDS, type GameState, type ResourceId } from './types';
import { ASSETS } from '../data/assets';
import { BALANCE } from '../data/balance';

/** Global production multiplier from maps already conquered. */
export function productionMultiplier(map: number): Decimal {
  return D(BALANCE.conquestProductionMult).pow(map - 1);
}

export interface RateReport {
  /** Gross produced per second (including converter output at full demand). */
  produced: Record<ResourceId, Decimal>;
  /** Gross consumed per second by converters at full demand. */
  consumed: Record<ResourceId, Decimal>;
}

function zeroRecord(): Record<ResourceId, Decimal> {
  return Object.fromEntries(RESOURCE_IDS.map((r) => [r, D(0)])) as Record<ResourceId, Decimal>;
}

/**
 * Nominal per-second rates assuming every converter runs at full demand. Converters starved of
 * input run slower in `tick`; use this for UI and planning, not for accounting.
 */
export function nominalRates(state: GameState): RateReport {
  const mult = productionMultiplier(state.map);
  const produced = zeroRecord();
  const consumed = zeroRecord();
  produced.gold = produced.gold.add(state.conquestGold);
  for (const a of ASSETS) {
    const lvl = state.levels[a.id] ?? 0;
    if (lvl <= 0) continue;
    const e = a.effect;
    if (e.kind === 'produce') {
      produced[e.resource] = produced[e.resource].add(levelOutput(e.base, lvl).mul(mult));
    }
  }
  return { produced, consumed };
}

/** Net nominal income per second for each resource. */
export function netRates(state: GameState): Record<ResourceId, Decimal> {
  const { produced, consumed } = nominalRates(state);
  return Object.fromEntries(RESOURCE_IDS.map((r) => [r, produced[r].sub(consumed[r])])) as Record<
    ResourceId,
    Decimal
  >;
}

/**
 * Advance the economy by `dt` seconds. Rates are constant within a tick (levels don't change), so
 * one call with a large dt is exact. That is what offline earnings rely on.
 */
export function tickEconomy(state: GameState, dt: number): void {
  if (dt <= 0) return;
  const mult = productionMultiplier(state.map);
  const res = state.resources;
  res.gold = res.gold.add(state.conquestGold.mul(dt));
  for (const a of ASSETS) {
    const e = a.effect;
    const lvl = state.levels[a.id] ?? 0;
    if (lvl > 0 && e.kind === 'produce') {
      res[e.resource] = res[e.resource].add(levelOutput(e.base, lvl).mul(mult).mul(dt));
    }
  }
  state.playTime += dt;
}

/** Offline earnings cap in hours. */
export function offlineCapHours(_state?: GameState): number {
  return BALANCE.offlineCapHours;
}
