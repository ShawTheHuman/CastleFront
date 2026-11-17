import { canAfford, costForLevels, levelCap, maxAffordableLevels } from './formulas';
import { progressIndex } from './state';
import type { AssetDef, BuyMode, GameState, ResourceId } from './types';
import type { Decimal } from './bignum';
import { BALANCE } from '../data/balance';
import { getAsset } from '../data/assets';

export function isUnlocked(state: GameState, asset: AssetDef): boolean {
  return progressIndex(state) >= asset.unlockProgress;
}

export interface BuyQuote {
  assetId: string;
  /** Levels this purchase would add (0 = nothing to buy). */
  levels: number;
  cost: Partial<Record<ResourceId, Decimal>>;
  affordable: boolean;
  /** Why nothing can be bought, if so. */
  blocked?: 'locked' | 'capped' | 'unaffordable';
}

/** Levels a mode asks for, ignoring affordability (but respecting the cap). */
function requestedLevels(mode: BuyMode, level: number, cap: number): number {
  const room = cap - level;
  switch (mode) {
    case 'x1':
      return Math.min(1, room);
    case 'x10':
      return Math.min(10, room);
    case 'milestone': {
      const next = (Math.floor(level / BALANCE.milestoneEvery) + 1) * BALANCE.milestoneEvery;
      return Math.min(next - level, room);
    }
    case 'max':
      return room;
  }
}

/**
 * Price a purchase. x1/x10/milestone are all-or-nothing (the quote shows the full price even when
 * unaffordable); max buys as many as currently affordable.
 */
export function quote(state: GameState, assetId: string, mode: BuyMode): BuyQuote {
  const asset = getAsset(assetId);
  const level = state.levels[assetId] ?? 0;
  const cap = levelCap(state.map);
  if (!isUnlocked(state, asset)) {
    return {
      assetId,
      levels: 0,
      cost: costForLevels(asset, level, 1),
      affordable: false,
      blocked: 'locked',
    };
  }
  if (level >= cap) return { assetId, levels: 0, cost: {}, affordable: false, blocked: 'capped' };

  if (mode === 'max') {
    const n = maxAffordableLevels(asset, level, state.resources, cap - level);
    if (n === 0) {
      return {
        assetId,
        levels: 1,
        cost: costForLevels(asset, level, 1),
        affordable: false,
        blocked: 'unaffordable',
      };
    }
    return { assetId, levels: n, cost: costForLevels(asset, level, n), affordable: true };
  }
  const n = requestedLevels(mode, level, cap);
  const cost = costForLevels(asset, level, n);
  const affordable = canAfford(state.resources, cost);
  return affordable
    ? { assetId, levels: n, cost, affordable }
    : { assetId, levels: n, cost, affordable, blocked: 'unaffordable' };
}

/** Buy upgrades. Returns the number of levels gained (0 if the purchase was not possible). */
export function buy(state: GameState, assetId: string, mode: BuyMode = 'x1'): number {
  const q = quote(state, assetId, mode);
  if (!q.affordable || q.levels <= 0) return 0;
  for (const [res, amt] of Object.entries(q.cost) as [ResourceId, Decimal][]) {
    state.resources[res] = state.resources[res].sub(amt);
  }
  state.levels[assetId] = (state.levels[assetId] ?? 0) + q.levels;
  return q.levels;
}
