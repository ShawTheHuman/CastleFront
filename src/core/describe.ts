import { formatNumber } from './bignum';
import { productionMultiplier } from './economy';
import { levelOutput } from './formulas';
import { progressIndex } from './state';
import { RESOURCE_IDS, type AssetDef, type GameState, type ResourceId } from './types';
import { ASSETS, getAsset } from '../data/assets';
import { BALANCE, TARGETS_PER_MAP } from '../data/balance';

/** A stat as it is now and after the pending upgrade. */
export interface StatLine {
  label: string;
  now: string;
  next: string;
}

function hours(h: number): string {
  return `${Number(h.toFixed(2))}h`;
}

/** Human-readable effect of an asset at its current level and at `level + add`. */
export function describeEffect(state: GameState, assetId: string, add: number): StatLine[] {
  const asset = getAsset(assetId);
  const lvl = state.levels[assetId] ?? 0;
  const nextLvl = lvl + Math.max(0, add);
  const mult = productionMultiplier(state.map);
  const e = asset.effect;
  switch (e.kind) {
    case 'produce': {
      const at = (l: number) => `${formatNumber(levelOutput(e.base, l).mul(mult))}/s`;
      return [{ label: `${RESOURCE_NAMES[e.resource]} made`, now: at(lvl), next: at(nextLvl) }];
    }
    case 'convert': {
      const at = (l: number, k: number) =>
        `${formatNumber(levelOutput(e.base, l).mul(mult).mul(k))}/s`;
      return [
        { label: `${RESOURCE_NAMES[e.input]} used`, now: at(lvl, 1), next: at(nextLvl, 1) },
        {
          label: `${RESOURCE_NAMES[e.output]} made`,
          now: at(lvl, e.ratio),
          next: at(nextLvl, e.ratio),
        },
      ];
    }
    case 'power': {
      const at = (l: number) => formatNumber(levelOutput(e.base, l));
      return [{ label: 'Base power', now: at(lvl), next: at(nextLvl) }];
    }
    case 'powerMult': {
      const at = (l: number) => `×${Number((1 + e.perLevel * l).toFixed(2))}`;
      return [{ label: 'Army power', now: at(lvl), next: at(nextLvl) }];
    }
    case 'offlineCap': {
      const at = (l: number) => hours(Math.min(e.maxHours, e.baseHours + e.perLevelHours * l));
      return [{ label: 'Offline limit', now: at(lvl), next: at(nextLvl) }];
    }
  }
}

export const RESOURCE_NAMES: Record<ResourceId, string> = {
  gold: 'Gold',
  food: 'Food',
  ore: 'Ore',
  steel: 'Steel',
  crude: 'Crude oil',
  fuel: 'Fuel',
};

/** Next level that gives a milestone bonus, and the bonus it gives. */
export function nextMilestone(level: number): { level: number; mult: number } {
  const every = BALANCE.milestoneEvery;
  return { level: (Math.floor(level / every) + 1) * every, mult: BALANCE.milestoneMult };
}

/** Milestone tier (number of milestones passed). */
export function milestoneTier(level: number): number {
  return Math.floor(level / BALANCE.milestoneEvery);
}

/** Whether an asset's effect benefits from milestones. */
export function hasMilestones(asset: AssetDef): boolean {
  return (
    asset.effect.kind === 'produce' ||
    asset.effect.kind === 'convert' ||
    asset.effect.kind === 'power'
  );
}

/** "Map 1 · Sector 3" style name for the target at a global progress index. */
export function targetName(progress: number): string {
  const map = Math.floor(progress / TARGETS_PER_MAP) + 1;
  const index = progress % TARGETS_PER_MAP;
  return index === TARGETS_PER_MAP - 1 ? `Map ${map} HQ` : `Map ${map} · Sector ${index + 1}`;
}

/** What the player has to beat to unlock an asset, or null if it is already unlocked. */
export function unlockRequirement(state: GameState, asset: AssetDef): string | null {
  if (progressIndex(state) >= asset.unlockProgress) return null;
  return `Beat ${targetName(asset.unlockProgress - 1)}`;
}

/**
 * Resources worth showing in the HUD: any the player owns, or that an unlocked asset makes,
 * uses or costs.
 */
export function discoveredResources(state: GameState): ResourceId[] {
  const seen = new Set<ResourceId>();
  const progress = progressIndex(state);
  for (const a of ASSETS) {
    if (a.unlockProgress > progress) continue;
    for (const r of Object.keys(a.cost) as ResourceId[]) seen.add(r);
    const e = a.effect;
    if (e.kind === 'produce') seen.add(e.resource);
    if (e.kind === 'convert') {
      seen.add(e.input);
      seen.add(e.output);
    }
  }
  return RESOURCE_IDS.filter((r) => seen.has(r) || state.resources[r].gt(0));
}

/** Assets that unlock when the target at `progress` (0-based) is cleared. */
export function assetsUnlockedBy(progressAfter: number): AssetDef[] {
  return ASSETS.filter((a) => a.unlockProgress === progressAfter);
}
