import { describe, expect, it } from 'vitest';
import {
  D,
  assaultOdds,
  compositionOf,
  createBattle,
  runBattle,
  stepBattle,
  strengthLeft,
  type Battle,
  type BattleConfig,
} from '../src/core';

const MIX = { infantry: 0.5, tank: 0.3, artillery: 0.2 };
const cfg = (
  ours: number,
  theirs: number,
  seed = 1,
  extra: Partial<BattleConfig> = {},
): BattleConfig => ({
  ours: D(ours),
  theirs: D(theirs),
  ourMix: MIX,
  theirMix: MIX,
  seed,
  mode: 'assault',
  ...extra,
});

function winRate(
  ours: number,
  theirs: number,
  policy?: (b: Battle) => Parameters<typeof stepBattle>[2],
): number {
  let wins = 0;
  const n = 30;
  for (let seed = 1; seed <= n; seed++) {
    const b = createBattle(cfg(ours, theirs, seed));
    while (!b.result) stepBattle(b, 1 / 20, policy?.(b));
    if (b.result === 'win') wins++;
  }
  return wins / n;
}

/** Charge when the armies are about to meet; keep the commander with the front line. */
function goodCommander(b: Battle) {
  const ours = b.units.filter((u) => u.team === 'ours' && u.deadFor < 0);
  const foes = b.units.filter((u) => u.team === 'theirs' && u.deadFor < 0);
  const front = Math.max(...ours.map((u) => u.z)) - 1.5;
  const cx = ours.reduce((s, u) => s + u.x, 0) / Math.max(1, ours.length);
  const dx = cx - b.commander.x;
  const dz = front - b.commander.z;
  const d = Math.hypot(dx, dz);
  const move = !b.attacking ? { x: 0, z: 1 } : d > 0.3 ? { x: dx / d, z: dz / d } : null;
  return { move, charge: Math.min(...foes.map((f) => f.z)) - front < 6 };
}

describe('battle', () => {
  it('is deterministic for a seed', () => {
    const a = runBattle(cfg(1, 1, 7));
    const b = runBattle(cfg(1, 1, 7));
    expect(a.result).toBe(b.result);
    expect(a.time).toBe(b.time);
  });

  it('a much stronger army wins, a much weaker one loses', () => {
    expect(winRate(2, 1)).toBe(1);
    expect(winRate(1, 2)).toBe(0);
  });

  it('an even fight can go either way', () => {
    const r = winRate(1, 1);
    expect(r).toBeGreaterThan(0.2);
    expect(r).toBeLessThan(0.9);
  });

  it('commanding well wins fights that idling loses', () => {
    expect(winRate(0.9, 1)).toBeLessThan(0.3);
    expect(winRate(0.9, 1, goodCommander)).toBeGreaterThan(0.5);
  });

  it('skirmishes always end with the winner decided by power', () => {
    for (let seed = 1; seed <= 10; seed++) {
      expect(runBattle(cfg(1, 1.05, seed, { mode: 'skirmish', forcedWinner: 'ours' })).result).toBe(
        'win',
      );
      expect(
        runBattle(cfg(1.05, 1, seed, { mode: 'skirmish', forcedWinner: 'theirs' })).result,
      ).toBe('lose');
    }
  });

  it('copes with astronomically large and lopsided armies', () => {
    const b = runBattle({ ...cfg(1, 1), ours: D('1e5000'), theirs: D('3e4999') });
    expect(b.result).toBe('win');
    expect(strengthLeft(b, 'ours')).toBeGreaterThan(0);
    const c = runBattle({ ...cfg(1, 1), ours: D('1e10'), theirs: D('1e300') });
    expect(c.result).toBe('lose');
  });

  it('ends within the time limit', () => {
    expect(runBattle(cfg(1, 1, 3)).time).toBeLessThanOrEqual(90 + 0.1);
  });

  it('builds the army mix from building levels', () => {
    const mix = compositionOf({ barracks: 10, tankFactory: 10, artillery: 0, commander: 50 });
    expect(mix.artillery).toBe(0);
    expect(mix.tank).toBeGreaterThan(mix.infantry); // a tank level is worth more than a rifleman
    expect(mix.infantry + mix.tank + mix.artillery).toBeCloseTo(1);
  });

  it('gives sensible odds', () => {
    expect(assaultOdds(D(2), D(1))).toBe('likely');
    expect(assaultOdds(D(0.95), D(1))).toBe('close');
    expect(assaultOdds(D(1), D(2))).toBe('unlikely');
  });
});
