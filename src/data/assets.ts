import type { AssetDef } from '../core/types';

/**
 * All upgradeable buildings. Three resources: gold, food and steel, each made by two buildings
 * (a cheap one from the start and a stronger one unlocked later).
 *
 * unlockProgress counts enemy targets taken in total (9 per map: 8 outposts and the rival's
 * base), e.g. 9 = start of map 2.
 */
export const ASSETS: readonly AssetDef[] = [
  // ── Back line: economy ────────────────────────────────────────────────
  {
    id: 'market',
    name: 'Market',
    line: 'back',
    description: 'Trades goods for gold.',
    cost: { gold: 10 },
    costGrowth: 1.075,
    effect: { kind: 'produce', resource: 'gold', base: 1 },
    unlockProgress: 0,
    startLevel: 1,
  },
  {
    id: 'farm',
    name: 'Farm',
    line: 'back',
    description: 'Grows food for your troops.',
    cost: { gold: 15 },
    costGrowth: 1.075,
    effect: { kind: 'produce', resource: 'food', base: 2 },
    unlockProgress: 0,
    startLevel: 0,
  },
  {
    id: 'mine',
    name: 'Iron Mine',
    line: 'back',
    description: 'Digs iron and smelts it into steel.',
    cost: { gold: 120 },
    costGrowth: 1.075,
    effect: { kind: 'produce', resource: 'steel', base: 1 },
    unlockProgress: 1,
    startLevel: 0,
  },
  {
    id: 'foundry',
    name: 'Foundry',
    line: 'back',
    description: 'Heavy industry. Makes steel fast.',
    cost: { gold: 4000 },
    costGrowth: 1.075,
    effect: { kind: 'produce', resource: 'steel', base: 6 },
    unlockProgress: 3,
    startLevel: 0,
  },
  {
    id: 'ranch',
    name: 'Ranch',
    line: 'back',
    description: 'Raises cattle. Makes food fast.',
    cost: { gold: 6000 },
    costGrowth: 1.075,
    effect: { kind: 'produce', resource: 'food', base: 12 },
    unlockProgress: 4,
    startLevel: 0,
  },
  {
    id: 'bank',
    name: 'Bank',
    line: 'back',
    description: 'Invests your war chest. Makes gold fast.',
    cost: { gold: 20000 },
    costGrowth: 1.075,
    effect: { kind: 'produce', resource: 'gold', base: 10 },
    unlockProgress: 6,
    startLevel: 0,
  },

  // ── Front line: army ──────────────────────────────────────────────────
  {
    id: 'commander',
    name: 'Commander',
    line: 'front',
    description: 'Your field commander. Boosts the power of the whole army.',
    cost: { gold: 100 },
    costGrowth: 1.075,
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
    costGrowth: 1.075,
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
    costGrowth: 1.075,
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
    costGrowth: 1.075,
    effect: { kind: 'power', base: 120 },
    unlockProgress: 3,
    startLevel: 0,
  },
  {
    id: 'artillery',
    name: 'Artillery Yard',
    line: 'front',
    description: 'Heavy guns that pound enemy lines.',
    cost: { steel: 1500, food: 3000 },
    costGrowth: 1.075,
    effect: { kind: 'power', base: 400 },
    unlockProgress: 5,
    startLevel: 0,
  },
  {
    id: 'airfield',
    name: 'Airfield',
    line: 'front',
    description: 'Launches air strikes.',
    cost: { steel: 1e6, gold: 2e6 },
    costGrowth: 1.075,
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
