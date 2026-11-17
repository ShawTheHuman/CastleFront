import { D, Decimal } from './bignum';
import type { AssetDef, ResourceAmounts, ResourceId, Resources } from './types';
import { BALANCE } from '../data/balance';

/** Output multiplier from milestones: ×milestoneMult every milestoneEvery levels. */
export function milestoneMultiplier(level: number): Decimal {
  return D(BALANCE.milestoneMult).pow(Math.floor(level / BALANCE.milestoneEvery));
}

/** Standard output curve: base × L × milestones (0 at level 0). */
export function levelOutput(base: number, level: number): Decimal {
  if (level <= 0) return D(0);
  return D(base).mul(level).mul(milestoneMultiplier(level));
}

/** Level cap for every asset while on the given map. */
export function levelCap(map: number): number {
  return BALANCE.levelCapPerMap * map;
}

function costEntries(asset: AssetDef): [ResourceId, number][] {
  return (Object.entries(asset.cost) as [ResourceId, number][]).map(([r, v]) => [
    r,
    v * BALANCE.costScale,
  ]);
}

/** Cost of a single upgrade from `level` to `level + 1`. */
export function upgradeCost(asset: AssetDef, level: number): Partial<Record<ResourceId, Decimal>> {
  return costForLevels(asset, level, 1);
}

/** Total cost of buying `n` levels starting at `level`: Σ base × r^(level+i), i < n. */
export function costForLevels(
  asset: AssetDef,
  level: number,
  n: number,
): Partial<Record<ResourceId, Decimal>> {
  const out: Partial<Record<ResourceId, Decimal>> = {};
  for (const [res, base] of costEntries(asset)) {
    out[res] = n <= 0 ? D(0) : Decimal.sumGeometricSeries(n, base, asset.costGrowth, level);
  }
  return out;
}

export function canAfford(
  resources: Resources,
  cost: Partial<Record<ResourceId, Decimal>>,
): boolean {
  return (Object.entries(cost) as [ResourceId, Decimal][]).every(([res, amt]) =>
    resources[res].gte(amt),
  );
}

/** How many levels (≤ maxLevels) can be bought right now. */
export function maxAffordableLevels(
  asset: AssetDef,
  level: number,
  resources: Resources,
  maxLevels: number,
): number {
  if (maxLevels <= 0) return 0;
  let n = maxLevels;
  for (const [res, base] of costEntries(asset)) {
    const k = Decimal.affordGeometricSeries(resources[res], base, asset.costGrowth, level);
    n = Math.min(n, Math.max(0, Math.floor(k.toNumber())));
  }
  // affordGeometricSeries works in floating point; correct any off-by-one.
  while (n > 0 && !canAfford(resources, costForLevels(asset, level, n))) n--;
  while (n < maxLevels && canAfford(resources, costForLevels(asset, level, n + 1))) n++;
  return n;
}

export function scaleAmounts(amounts: ResourceAmounts, k: number): ResourceAmounts {
  const out: ResourceAmounts = {};
  for (const [res, v] of Object.entries(amounts) as [ResourceId, number][]) out[res] = v * k;
  return out;
}
