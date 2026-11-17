import { D, type Decimal } from './bignum';
import { offlineCapHours, tickEconomy } from './economy';
import { autoAdvance, type ProgressEvent } from './progression';
import { cloneState } from './state';
import { RESOURCE_IDS, type GameState, type ResourceId } from './types';
import { BALANCE } from '../data/balance';

/** One simulation step: economy, then idle auto-push. Used online, offline and by the balance sim. */
export function step(state: GameState, dt: number): ProgressEvent[] {
  tickEconomy(state, dt);
  return autoAdvance(state);
}

export interface OfflineReport {
  /** Real seconds away. */
  awaySeconds: number;
  /** Seconds that counted after the cap. */
  creditedSeconds: number;
  /** Simulated seconds after efficiency (credited × offlineEfficiency). */
  simulatedSeconds: number;
  gains: Record<ResourceId, Decimal>;
  events: ProgressEvent[];
}

/**
 * Apply offline earnings for the time since `state.lastUpdate`. Runs the normal step at reduced
 * efficiency, capped by the Warehouse. Production is computed in one exact step; targets beaten
 * during the absence are cleared at the end (their gold/s only counts from then on).
 */
export function applyOffline(state: GameState, now = Date.now()): OfflineReport {
  const awaySeconds = Math.max(0, (now - state.lastUpdate) / 1000);
  const creditedSeconds = Math.min(awaySeconds, offlineCapHours(state) * 3600);
  const simulatedSeconds = creditedSeconds * BALANCE.offlineEfficiency;
  const before = cloneState(state);
  const events = step(state, simulatedSeconds);
  state.lastUpdate = now;
  const gains = Object.fromEntries(
    RESOURCE_IDS.map((r) => [r, D(state.resources[r]).sub(before.resources[r])]),
  ) as Record<ResourceId, Decimal>;
  return { awaySeconds, creditedSeconds, simulatedSeconds, gains, events };
}
