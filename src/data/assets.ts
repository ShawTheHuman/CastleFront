import type { AssetDef } from '../core/types';

/**
 * All upgradeable assets. Order matters: converters run in this order each tick, so a converter
 * must come after the producers of its input.
 *
 * unlockProgress counts enemy targets cleared in total (9 per map), e.g. 9 = start of map 2.
 */
export const ASSETS: readonly AssetDef[] = [
  // ── Back line: economy ────────────────────────────────────────────────
  {
    id: 'market',
    name: 'Market',
    line: 'back',
    description: 'Trades surplus goods for gold.',
    cost: { gold: 10 },
    costGrowth: 1.12,
    effect: { kind: 'produce', resource: 'gold', base: 1 },
    unlockProgress: 0,
    startLevel: 1,
  },
  {
    id: 'farm',
    name: 'Farm',
    line: 'back',
    description: 'Grows food to feed your troops.',
    cost: { gold: 15 },
    costGrowth: 1.09,
    effect: { kind: 'produce', resource: 'food', base: 2 },
    unlockProgress: 0,
    startLevel: 0,
  },
  {
    id: 'mine',
    name: 'Iron Mine',
    line: 'back',
    description: 'Digs up iron ore.',
    cost: { gold: 120 },
    costGrowth: 1.09,
    effect: { kind: 'produce', resource: 'ore', base: 2 },
    unlockProgress: 1,
    startLevel: 0,
  },
  {
    id: 'foundry',
    name: 'Foundry',
    line: 'back',
    description: 'Smelts ore into steel.',
    cost: { gold: 250, food: 100 },
    costGrowth: 1.09,
    effect: { kind: 'convert', input: 'ore', output: 'steel', base: 2, ratio: 0.5 },
    unlockProgress: 1,
    startLevel: 0,
  },
  {
    id: 'derrick',
    name: 'Oil Derrick',
    line: 'back',
    description: 'Pumps crude oil.',
    cost: { gold: 4000, steel: 300 },
    costGrowth: 1.09,
    effect: { kind: 'produce', resource: 'crude', base: 2 },
    unlockProgress: 4,
    startLevel: 0,
  },
  {
    id: 'refinery',
    name: 'Refinery',
    line: 'back',
    description: 'Refines crude oil into fuel.',
    cost: { gold: 8000, steel: 600 },
    costGrowth: 1.09,
    effect: { kind: 'convert', input: 'crude', output: 'fuel', base: 2, ratio: 0.5 },
    unlockProgress: 4,
    startLevel: 0,
  },
  {
    id: 'warehouse',
    name: 'Warehouse',
    line: 'back',
    description: 'Stores more goods while you are away (raises the offline earnings cap).',
    cost: { gold: 500 },
    costGrowth: 1.12,
    effect: { kind: 'offlineCap', baseHours: 2, perLevelHours: 0.25, maxHours: 12 },
    unlockProgress: 2,
    startLevel: 0,
  },

  // ── Front line: army ──────────────────────────────────────────────────
  {
    id: 'commander',
    name: 'Commander',
    line: 'front',
    description: 'Your field commander. Boosts the power of the whole army.',
    cost: { gold: 100 },
    costGrowth: 1.09,
    effect: { kind: 'powerMult', perLevel: 0.05 },
    unlockProgress: 0,
    startLevel: 1,
  },
  {
    id: 'barracks',
    name: 'Barracks',
    line: 'front',
    description: 'Trains riflemen.',
    cost: { food: 20 },
    costGrowth: 1.08,
    effect: { kind: 'power', base: 10 },
    unlockProgress: 0,
    startLevel: 1,
  },
  {
    id: 'range',
    name: 'Rifle Range',
    line: 'front',
    description: 'Drills elite marksmen.',
    cost: { food: 150, steel: 20 },
    costGrowth: 1.08,
    effect: { kind: 'power', base: 30 },
    unlockProgress: 2,
    startLevel: 0,
  },
  {
    id: 'tankFactory',
    name: 'Tank Factory',
    line: 'front',
    description: 'Builds battle tanks.',
    cost: { steel: 200, gold: 1000 },
    costGrowth: 1.08,
    effect: { kind: 'power', base: 120 },
    unlockProgress: 3,
    startLevel: 0,
  },
  {
    id: 'artillery',
    name: 'Artillery Yard',
    line: 'front',
    description: 'Heavy guns that pound enemy lines.',
    cost: { steel: 1500, fuel: 200 },
    costGrowth: 1.08,
    effect: { kind: 'power', base: 400 },
    unlockProgress: 5,
    startLevel: 0,
  },
  {
    id: 'airfield',
    name: 'Airfield',
    line: 'front',
    description: 'Launches air strikes.',
    cost: { steel: 1e6, fuel: 2e5 },
    costGrowth: 1.08,
    effect: { kind: 'power', base: 2000 },
    unlockProgress: 9,
    startLevel: 0,
  },
];

export const ASSET_BY_ID: ReadonlyMap<string, AssetDef> = new Map(ASSETS.map((a) => [a.id, a]));

export function getAsset(id: string): AssetDef {
  const a = ASSET_BY_ID.get(id);
  if (!a) throw new Error(`Unknown asset: ${id}`);
  return a;
}
