import type { Decimal } from './bignum';
import { netRates } from './economy';
import { buy, isUnlocked, quote } from './upgrades';
import type { GameState, ResourceId } from './types';
import { ASSETS } from '../data/assets';

/**
 * The upgrade strategy used by the rival and by the balance simulator: repeatedly buy the single
 * upgrade whose price is the fewest seconds of current income, until nothing is affordable. This
 * levels buildings evenly, the way an attentive player does.
 */

/** Assets the AI never buys. */
const AI_SKIP = new Set<string>();

function secondsOfIncome(state: GameState, cost: Partial<Record<ResourceId, Decimal>>): number {
  const rates = netRates(state);
  let worst = 0;
  for (const [res, amt] of Object.entries(cost) as [ResourceId, Decimal][]) {
    const rate = rates[res];
    worst = Math.max(worst, rate.lte(0) ? Infinity : amt.div(rate).toNumber());
  }
  return worst;
}

/** Spend resources greedily. Returns the number of levels bought. */
export function buyGreedy(state: GameState, maxBuys = 10_000): number {
  let bought = 0;
  for (; bought < maxBuys; bought++) {
    let best: { id: string; t: number } | null = null;
    for (const a of ASSETS) {
      if (AI_SKIP.has(a.id) || !isUnlocked(state, a)) continue;
      const q = quote(state, a.id, 'x1');
      if (!q.affordable) continue;
      const t = secondsOfIncome(state, q.cost);
      if (!best || t < best.t) best = { id: a.id, t };
    }
    if (!best) break;
    buy(state, best.id, 'x1');
  }
  return bought;
}

/** Seconds of current income the cheapest next upgrade costs (Infinity if none is possible). */
export function cheapestUpgradeSeconds(state: GameState): number {
  let best = Infinity;
  for (const a of ASSETS) {
    if (AI_SKIP.has(a.id) || !isUnlocked(state, a)) continue;
    const q = quote(state, a.id, 'x1');
    if (q.blocked === 'capped' || q.blocked === 'locked') continue;
    best = Math.min(best, secondsOfIncome(state, q.cost));
  }
  return best;
}

export function aiBuildsAsset(assetId: string): boolean {
  return !AI_SKIP.has(assetId);
}
