import type { Decimal } from './bignum';

export const RESOURCE_IDS = ['gold', 'food', 'steel'] as const;
export type ResourceId = (typeof RESOURCE_IDS)[number];
export type Resources = Record<ResourceId, Decimal>;
export type ResourceAmounts = Partial<Record<ResourceId, number>>;

export type Line = 'back' | 'front';

export type AssetEffect =
  /** Produces `base × output(L)` of a resource per second. */
  | { kind: 'produce'; resource: ResourceId; base: number }
  /** Adds `base × output(L)` to army power. */
  | { kind: 'power'; base: number }
  /** Multiplies total army power by `1 + perLevel × L`. */
  | { kind: 'powerMult'; perLevel: number };

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
  /** The rival commander building the mirrored base on the current map. */
  rival: RivalState;
  /** playTime (s) before which the player's army is regrouping after a failed assault. */
  assaultReadyAt: number;
}

/** The rival's own base: it plays the same economy as the player. */
export interface RivalState {
  resources: Resources;
  levels: Record<string, number>;
  /** Levels the rival started this map with (for "% built"). */
  startLevels: Record<string, number>;
  /** Gold/s from territory: a copy of the player's when the map began. */
  conquestGold: Decimal;
  /** Seconds of play not yet simulated for the rival (it updates in small steps). */
  pending: number;
  /** playTime (s) of the rival's next attack once it is at full strength. */
  nextAttackAt: number;
  /** The rival has finished its base for this map and stopped building. */
  done: boolean;
}

export type BuyMode = 'x1' | 'x10' | 'milestone' | 'max';
