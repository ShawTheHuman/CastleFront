import { describe, expect, it } from 'vitest';
import {
  D,
  armyPower,
  assault,
  assaultPreview,
  autoAdvance,
  checkRivalAttack,
  deserialize,
  levelCap,
  netRates,
  newGame,
  rivalBuildFraction,
  rivalGoldIncome,
  rivalIsFull,
  rivalPace,
  rivalPower,
  serialize,
  tickRival,
  type GameState,
} from '../src/core';
import { ASSETS } from '../src/data/assets';
import { BALANCE, TARGETS_PER_MAP } from '../src/data/balance';

const HQ = TARGETS_PER_MAP - 1;

function atBase(): GameState {
  const s = newGame(0);
  s.sector = HQ;
  return s;
}

function capAll(levels: Record<string, number>, cap: number): void {
  for (const a of ASSETS) if (a.unlockProgress < TARGETS_PER_MAP) levels[a.id] = cap;
}

describe('rival', () => {
  it('starts as a mirror of the player with empty stores', () => {
    const s = newGame(0);
    expect(s.rival.levels).toEqual(s.levels);
    expect(s.rival.resources.gold.toNumber()).toBe(0);
    expect(rivalBuildFraction(s)).toBe(0);
  });

  it('builds up over time', () => {
    const s = newGame(0);
    const before = rivalPower(s);
    tickRival(s, 2 * 3600);
    expect(rivalPower(s).gt(before)).toBe(true);
    expect(rivalBuildFraction(s)).toBeGreaterThan(0);
  });

  it('gets faster on later maps', () => {
    expect(rivalPace(1)).toBe(BALANCE.rivalPaceMap1);
    expect(rivalPace(5)).toBeGreaterThan(rivalPace(2));
  });

  it('loses outpost income as the player takes outposts', () => {
    const s = newGame(0);
    const full = rivalGoldIncome(s);
    s.sector = 4;
    const some = rivalGoldIncome(s);
    s.sector = HQ;
    expect(full.gt(some)).toBe(true);
    expect(some.gt(rivalGoldIncome(s))).toBe(true);
    expect(rivalGoldIncome(s).toNumber()).toBe(0);
  });

  it('catches up on a long absence quickly', () => {
    const s = newGame(0);
    const t0 = performance.now();
    tickRival(s, 12 * 3600);
    expect(performance.now() - t0).toBeLessThan(3000);
    expect(s.rival.pending).toBeLessThan(60);
  });
});

describe('outposts and the final battle', () => {
  it('auto-advance takes outposts but never the base', () => {
    const s = newGame(0);
    capAll(s.levels, 100);
    autoAdvance(s);
    expect(s.sector).toBe(HQ);
    expect(s.map).toBe(1);
  });

  it('a failed assault makes the army regroup', () => {
    const s = atBase();
    capAll(s.rival.levels, 50);
    expect(assaultPreview(s).wins).toBe(false);
    expect(assault(s)[0]?.kind).toBe('assaultFailed');
    expect(assaultPreview(s).regroupIn).toBe(BALANCE.assaultCooldownMinutes * 60);
    expect(assault(s)).toEqual([]);
    s.playTime += BALANCE.assaultCooldownMinutes * 60;
    expect(assaultPreview(s).regroupIn).toBe(0);
  });

  it('a won assault conquers the map and brings a new rival that mirrors the player', () => {
    const s = atBase();
    capAll(s.levels, 60);
    const events = assault(s);
    expect(events.map((e) => e.kind)).toEqual(['sectorCleared', 'mapCleared']);
    expect(s.map).toBe(2);
    expect(s.rival.levels).toEqual(s.levels);
    expect(s.rival.conquestGold.toString()).toBe(s.conquestGold.toString());
  });

  it('the base cannot be assaulted before the outposts fall', () => {
    const s = newGame(0);
    capAll(s.levels, 100);
    s.levels.barracks = 1; // too weak for the outposts, but stronger than the fresh rival
    expect(assaultPreview(s).reachable).toBe(false);
    expect(assault(s)).toEqual([]);
  });
});

describe('rival attacks', () => {
  it('attacks only once its base is finished', () => {
    const s = atBase();
    expect(rivalIsFull(s)).toBe(false);
    expect(checkRivalAttack(s)).toEqual([]);
  });

  it('finishes its base when it has built most of the map', () => {
    const s = atBase();
    capAll(s.rival.levels, levelCap(1));
    tickRival(s, 10);
    expect(rivalIsFull(s)).toBe(true);
  });

  it('finishes its base when its next upgrade would take too long', () => {
    const s = atBase();
    // Big buildings but no income: every upgrade takes forever.
    for (const k of Object.keys(s.rival.levels)) s.rival.levels[k] = 0;
    s.rival.levels.barracks = 60;
    tickRival(s, 10);
    expect(rivalIsFull(s)).toBe(true);
    const power = rivalPower(s);
    tickRival(s, 3600);
    expect(rivalPower(s).eq(power)).toBe(true); // stopped building
  });

  it('a raid takes a share of the stores, capped by income, and comes back later', () => {
    const s = newGame(0);
    capAll(s.rival.levels, 100);
    s.rival.done = true;
    s.levels.farm = 10;
    s.resources.food = D(1e9);
    s.resources.gold = D(100);
    const foodRate = netRates(s).food;
    const events = checkRivalAttack(s);
    expect(events[0]?.kind).toBe('rivalRaid');
    // 10% of 100 gold, but only 30 minutes of food income.
    expect(s.resources.gold.toNumber()).toBe(90);
    expect(D(1e9).sub(s.resources.food).toNumber()).toBeCloseTo(
      foodRate.mul(BALANCE.rivalRaidMaxMinutes * 60).toNumber(),
    );
    expect(checkRivalAttack(s)).toEqual([]);
    s.playTime += BALANCE.rivalAttackCooldownHours * 3600;
    expect(checkRivalAttack(s)[0]?.kind).toBe('rivalRaid');
  });

  it('holding the line wins the whole map', () => {
    const s = newGame(0);
    capAll(s.rival.levels, 100);
    s.rival.done = true;
    capAll(s.levels, 100);
    expect(armyPower(s).gte(rivalPower(s))).toBe(true);
    const events = checkRivalAttack(s);
    expect(events[0]?.kind).toBe('rivalRepelled');
    expect(events.filter((e) => e.kind === 'sectorCleared')).toHaveLength(TARGETS_PER_MAP);
    expect(s.map).toBe(2);
  });
});

describe('rival saves', () => {
  it('round-trips the rival', () => {
    const s = newGame(0);
    tickRival(s, 3600);
    s.rival.nextAttackAt = 1234;
    s.rival.done = true;
    const back = deserialize(serialize(s));
    expect(back.rival.done).toBe(true);
    expect(back.rival.levels).toEqual(s.rival.levels);
    expect(back.rival.startLevels).toEqual(s.rival.startLevels);
    expect(back.rival.resources.gold.toString()).toBe(s.rival.resources.gold.toString());
    expect(back.rival.nextAttackAt).toBe(1234);
  });

  it('migrates a v1 save with a rival mirroring the player', () => {
    const v2 = JSON.parse(serialize(newGame(0)));
    const v1 = { version: 1, savedAt: 0, state: { ...v2.state } };
    delete v1.state.rival;
    delete v1.state.assaultReadyAt;
    v1.state.levels.barracks = 42;
    const back = deserialize(JSON.stringify(v1));
    expect(back.rival.levels.barracks).toBe(42);
    expect(back.assaultReadyAt).toBe(0);
  });
});
