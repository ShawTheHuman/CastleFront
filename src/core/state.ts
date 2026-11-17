import { D } from './bignum';
import { RESOURCE_IDS, type GameState, type Resources } from './types';
import { ASSETS } from '../data/assets';
import { TARGETS_PER_MAP } from '../data/balance';

export const STARTING_RESOURCES: Partial<Record<keyof Resources, number>> = { gold: 80 };

export function emptyResources(): Resources {
  return Object.fromEntries(RESOURCE_IDS.map((r) => [r, D(0)])) as Resources;
}

export function newGame(now = Date.now()): GameState {
  const resources = emptyResources();
  for (const [res, v] of Object.entries(STARTING_RESOURCES))
    resources[res as keyof Resources] = D(v);
  return {
    resources,
    levels: Object.fromEntries(ASSETS.map((a) => [a.id, a.startLevel])),
    map: 1,
    sector: 0,
    conquestGold: D(0),
    lastUpdate: now,
    playTime: 0,
  };
}

export function cloneState(s: GameState): GameState {
  return {
    ...s,
    resources: Object.fromEntries(RESOURCE_IDS.map((r) => [r, D(s.resources[r])])) as Resources,
    levels: { ...s.levels },
    conquestGold: D(s.conquestGold),
  };
}

/** Total enemy targets cleared since the start of the game. */
export function progressIndex(s: Pick<GameState, 'map' | 'sector'>): number {
  return (s.map - 1) * TARGETS_PER_MAP + s.sector;
}

export function level(s: GameState, assetId: string): number {
  return s.levels[assetId] ?? 0;
}
