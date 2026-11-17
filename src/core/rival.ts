import { D, Decimal } from './bignum';
import { aiBuildsAsset, buyGreedy, cheapestUpgradeSeconds } from './ai';
import { armyPowerFromLevels } from './army';
import { netRates, tickEconomy } from './economy';
import { levelCap } from './formulas';
import { sectorGoldRate } from './progression';
import { emptyResources } from './state';
import { RESOURCE_IDS, type GameState, type ResourceId, type RivalState } from './types';
import { ASSETS } from '../data/assets';
import { BALANCE, TARGETS_PER_MAP } from '../data/balance';

/**
 * The rival commander. On every map it starts with a copy of the player's base and then plays the
 * same economy (same buildings, costs and caps) with the same upgrade strategy as the balance
 * sim, at a handicapped speed: slow on early maps, faster on every map after. It also collects
 * the income of every outpost it still holds. Once it hits the map's wall (its next upgrade would
 * take too long) its base is finished: it stops building and attacks.
 */

export const OUTPOSTS_PER_MAP = TARGETS_PER_MAP - 1;
const RIVAL_STEP = 2; // seconds per rival simulation step
const MAX_STEPS_PER_CALL = 2000; // offline catch-up uses bigger steps beyond this

/** Speed of the rival's economy relative to normal on a map. */
export function rivalPace(map: number): number {
  return BALANCE.rivalPaceMap1 * Math.pow(BALANCE.rivalPaceGrowth, map - 1);
}

/** Build speed multiplier after the player has taken `outposts` outposts. */
export function rivalSpeed(outposts: number): number {
  return Math.max(0, 1 - BALANCE.rivalSlowPerOutpost * Math.min(outposts, OUTPOSTS_PER_MAP));
}

/** Assets the rival can build on this map: everything the player can unlock by its end. */
export function rivalHasAsset(map: number, assetId: string): boolean {
  const a = ASSETS.find((x) => x.id === assetId);
  return !!a && a.unlockProgress < map * TARGETS_PER_MAP;
}

/** A rival that starts from a copy of the given base (levels and territory) with empty stores. */
export function newRival(levels: Record<string, number>, conquestGold: Decimal = D(0)): RivalState {
  return {
    resources: emptyResources(),
    levels: { ...levels },
    startLevels: { ...levels },
    conquestGold: D(conquestGold),
    pending: 0,
    nextAttackAt: 0,
    done: false,
  };
}

/**
 * The rival's territory income: what it held when the map began, plus every outpost on this map
 * the player has not taken yet. Taking an outpost moves its income from the rival to the player.
 */
export function rivalGoldIncome(state: GameState): Decimal {
  let gold = state.rival.conquestGold;
  for (let i = state.sector; i < OUTPOSTS_PER_MAP; i++)
    gold = gold.add(sectorGoldRate(state.map, i));
  return gold;
}

/** The rival's base viewed as a GameState so it can run the normal economy and upgrade code. */
function rivalAsGame(state: GameState): GameState {
  return {
    resources: state.rival.resources,
    levels: state.rival.levels,
    map: state.map,
    // All of this map's unlocks are open to the rival.
    sector: TARGETS_PER_MAP - 1,
    conquestGold: rivalGoldIncome(state),
    lastUpdate: 0,
    playTime: 0,
    rival: state.rival,
    assaultReadyAt: 0,
  };
}

/** Advance the rival by `dt` seconds of play: produce, then spend. */
export function tickRival(state: GameState, dt: number): void {
  const r = state.rival;
  if (r.done) {
    r.pending = 0;
    return;
  }
  r.pending += dt * rivalPace(state.map) * rivalSpeed(state.sector);
  if (r.pending < RIVAL_STEP) return;
  const game = rivalAsGame(state);
  const step = Math.max(RIVAL_STEP, r.pending / MAX_STEPS_PER_CALL);
  while (r.pending >= step) {
    tickEconomy(game, step);
    buyGreedy(game, 200);
    r.pending -= step;
    if (checkRivalDone(state, game)) {
      r.pending = 0;
      break;
    }
  }
}

export function rivalLevels(state: GameState): Record<string, number> {
  return state.rival.levels;
}

export function rivalPower(state: GameState): Decimal {
  return armyPowerFromLevels(state.rival.levels);
}

/** Buildings the rival is working on this map (everything it can build). */
function rivalAssets(map: number) {
  return ASSETS.filter((a) => aiBuildsAsset(a.id) && rivalHasAsset(map, a.id));
}

function buildFraction(
  map: number,
  levels: Record<string, number>,
  start: Record<string, number>,
): number {
  const cap = levelCap(map);
  let done = 0;
  let total = 0;
  for (const a of rivalAssets(map)) {
    const from = Math.min(start[a.id] ?? 0, cap);
    done += Math.max(0, Math.min(levels[a.id] ?? 0, cap) - from);
    total += cap - from;
  }
  return total <= 0 ? 1 : done / total;
}

/** How much of its base the rival has built this map (0..1, by levels toward the cap). */
export function rivalBuildFraction(state: GameState): number {
  return buildFraction(state.map, state.rival.levels, state.rival.startLevels);
}

/**
 * The same measure for the player. Both sides started the map from the same levels (the rival's
 * start is a copy of the player's), so the two fractions are a fair race.
 */
export function playerBuildFraction(state: GameState): number {
  return buildFraction(state.map, state.levels, state.rival.startLevels);
}

/** The rival has finished its base for this map: it stops building and attacks. */
export function rivalIsFull(state: GameState): boolean {
  return state.rival.done;
}

/** Decide whether the rival has hit its limit for this map. */
function checkRivalDone(state: GameState, game: GameState): boolean {
  if (state.rival.done) return true;
  if (
    rivalBuildFraction(state) >= BALANCE.rivalFinishFraction ||
    cheapestUpgradeSeconds(game) > BALANCE.rivalPatienceMinutes * 60
  ) {
    state.rival.done = true;
  }
  return state.rival.done;
}

/** Fresh rival for a new map, starting from a copy of the player's base. */
export function resetRival(state: GameState): void {
  state.rival = newRival(state.levels, state.conquestGold);
  state.assaultReadyAt = 0;
}

/**
 * Resources the rival takes when its attack breaks through: a share of each store, but never more
 * than `rivalRaidMaxMinutes` of that resource's income, so a raid stings without wiping out
 * savings for a big upgrade.
 */
export function raidLoss(state: GameState): Partial<Record<ResourceId, Decimal>> {
  const rates = netRates(state);
  const out: Partial<Record<ResourceId, Decimal>> = {};
  for (const r of RESOURCE_IDS) {
    const share = state.resources[r].mul(BALANCE.rivalRaidLoss);
    const cap = Decimal.max(rates[r], 0).mul(BALANCE.rivalRaidMaxMinutes * 60);
    out[r] = Decimal.min(share, cap).floor();
  }
  return out;
}
