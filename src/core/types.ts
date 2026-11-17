import type { Decimal } from './bignum';

export const RESOURCE_IDS = ['gold', 'food', 'ore', 'steel', 'crude', 'fuel'] as const;
export type ResourceId = (typeof RESOURCE_IDS)[number];
export type Resources = Record<ResourceId, Decimal>;
export type ResourceAmounts = Partial<Record<ResourceId, number>>;

export type Line = 'back' | 'front';

export type AssetEffect =
  /** Produces `base × output(L)` of a resource per second. */
  | { kind: 'produce'; resource: ResourceId; base: number }
  /** Consumes up to `base × output(L)` input/s and yields `ratio` output per input. */
  | { kind: 'convert'; input: ResourceId; output: ResourceId; base: number; ratio: number }
  /** Adds `base × output(L)` to army power. */
  | { kind: 'power'; base: number }
  /** Multiplies total army power by `1 + perLevel × L`. */
  | { kind: 'powerMult'; perLevel: number }
  /** Offline earnings cap: `min(maxHours, baseHours + perLevelHours × L)`. */
  | { kind: 'offlineCap'; baseHours: number; perLevelHours: number; maxHours: number };

export interface AssetDef {
  id: string;
  name: string;
  line: Line;
  description: string;
  /** Cost of the first level (0 -> 1), per resource. Every resource scales by `costGrowth`. */
  cost: ResourceAmounts;
  /** Cost multiplier per level: cost(L -> L+1) = cost × costGrowth^L. */
  costGrowth: number;
  effect: AssetEffect;
  /** Total number of enemy targets (sectors + HQs) that must be cleared before it can be built. */
  unlockProgress: number;
  /** Level in a brand-new game. */
  startLevel: number;
}

export interface GameState {
  resources: Resources;
  levels: Record<string, number>;
  /** 1-based index of the current map. */
  map: number;
  /** Targets cleared on the current map (0..TARGETS_PER_MAP-1). */
  sector: number;
  /** Permanent gold/s earned from conquered sectors. */
  conquestGold: Decimal;
  /** Epoch ms of the last time the state was advanced (used for offline earnings). */
  lastUpdate: number;
  /** Total simulated seconds played (online + offline). */
  playTime: number;
}

export type BuyMode = 'x1' | 'x10' | 'milestone' | 'max';
