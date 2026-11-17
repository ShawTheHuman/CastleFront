import { describe, expect, it } from 'vitest';
import {
  D,
  applyOffline,
  autoAdvance,
  buy,
  canClearCurrent,
  clearCurrent,
  outpostPower,
  levelCap,
  netRates,
  newGame,
  offlineCapHours,
  quote,
  step,
  tickEconomy,
  type GameState,
} from '../src/core';
import { ASSETS } from '../src/data/assets';
import { BALANCE, TARGETS_PER_MAP } from '../src/data/balance';

function richGame(): GameState {
  const s = newGame(0);
  for (const r of Object.keys(s.resources) as (keyof typeof s.resources)[])
    s.resources[r] = D(1e300);
  return s;
}

describe('upgrades', () => {
  it('buying deducts the cost and adds a level', () => {
    const s = newGame(0);
    const q = quote(s, 'market', 'x1');
    expect(q.affordable).toBe(true);
    const goldBefore = s.resources.gold;
    expect(buy(s, 'market')).toBe(1);
    expect(s.levels.market).toBe(2);
    expect(s.resources.gold.toNumber()).toBeCloseTo(goldBefore.sub(q.cost.gold!).toNumber());
  });

  it('x10 is all-or-nothing', () => {
    const s = newGame(0);
    expect(quote(s, 'market', 'x10').affordable).toBe(false);
    expect(buy(s, 'market', 'x10')).toBe(0);
    expect(s.levels.market).toBe(1);
  });

  it('milestone mode buys up to the next multiple of 25', () => {
    const s = richGame();
    s.levels.farm = 7;
    expect(buy(s, 'farm', 'milestone')).toBe(18);
    expect(s.levels.farm).toBe(25);
    expect(buy(s, 'farm', 'milestone')).toBe(25);
  });

  it('respects the level cap of the current map', () => {
    const s = richGame();
    expect(buy(s, 'farm', 'max')).toBe(levelCap(1));
    expect(quote(s, 'farm', 'x1').blocked).toBe('capped');
    s.map = 2;
    expect(buy(s, 'farm', 'max')).toBe(100);
    expect(s.levels.farm).toBe(200);
  });

  it('locked assets cannot be bought', () => {
    const s = richGame();
    expect(quote(s, 'airfield', 'x1').blocked).toBe('locked');
    expect(buy(s, 'airfield')).toBe(0);
  });
});

describe('economy', () => {
  it('produces resources over time', () => {
    const s = newGame(0);
    s.levels.farm = 10;
    const food = netRates(s).food;
    tickEconomy(s, 10);
    expect(s.resources.food.toNumber()).toBeCloseTo(food.mul(10).toNumber());
  });

  it('one long tick equals many short ones (offline is exact)', () => {
    const a = newGame(0);
    Object.assign(a.levels, {
      market: 30,
      farm: 20,
      mine: 40,
      foundry: 60,
      ranch: 10,
      bank: 5,
    });
    const b = { ...a, resources: { ...a.resources }, levels: { ...a.levels } };
    tickEconomy(a, 3600);
    for (let i = 0; i < 3600; i++) tickEconomy(b, 1);
    for (const r of Object.keys(a.resources) as (keyof typeof a.resources)[]) {
      const x = a.resources[r].toNumber();
      expect(b.resources[r].toNumber()).toBeCloseTo(
        x,
        Math.max(0, 6 - Math.ceil(Math.log10(x + 1))),
      );
    }
  });
});

describe('progression', () => {
  it('outposts get stronger along the road, on every map', () => {
    for (const map of [1, 3, 7]) {
      const s = newGame(0);
      s.map = map;
      for (const a of ASSETS) s.rival.startLevels[a.id] = a.line === 'front' ? (map - 1) * 90 : 0;
      let prev = D(0);
      for (let i = 0; i < TARGETS_PER_MAP - 1; i++) {
        const p = outpostPower(s, i);
        expect(p.gt(prev), `map ${map} outpost ${i}`).toBe(true);
        prev = p;
      }
    }
  });

  it('gaining the map step on every army building beats the last outpost', () => {
    const s = newGame(0);
    s.map = 3;
    for (const a of ASSETS) s.rival.startLevels[a.id] = a.line === 'front' ? 190 : 0;
    for (const a of ASSETS) {
      s.levels[a.id] = a.line === 'front' ? 190 + BALANCE.outpostLevelsPerMap : 0;
    }
    s.sector = TARGETS_PER_MAP - 2;
    expect(canClearCurrent(s)).toBe(true);
    s.levels.barracks = 1;
    s.levels.tankFactory = 1;
    expect(canClearCurrent(s)).toBe(false);
  });

  it('a starting army beats the first target only after some upgrades', () => {
    const s = newGame(0);
    expect(canClearCurrent(s)).toBe(false);
    s.levels.barracks = 10;
    expect(canClearCurrent(s)).toBe(true);
  });

  it('clearing the HQ moves to the next map and raises the cap', () => {
    const s = newGame(0);
    s.sector = TARGETS_PER_MAP - 1;
    const events = clearCurrent(s);
    expect(s.map).toBe(2);
    expect(s.sector).toBe(0);
    expect(events.at(-1)).toEqual({ kind: 'mapCleared', map: 1, newCap: 200 });
    expect(s.conquestGold.gt(0)).toBe(true);
  });

  it('auto-advance stops at the first target it cannot beat', () => {
    const s = newGame(0);
    s.levels.barracks = 30;
    const events = autoAdvance(s);
    expect(events.length).toBeGreaterThan(0);
    expect(canClearCurrent(s)).toBe(false);
  });
});

describe('offline earnings', () => {
  it('applies efficiency and the offline cap', () => {
    const s = newGame(0);
    s.levels.farm = 10;
    const hours = offlineCapHours(s);
    expect(hours).toBe(BALANCE.offlineCapHours);
    const r = applyOffline(s, (hours + 10) * 3600 * 1000);
    expect(r.creditedSeconds).toBe(hours * 3600);
    expect(r.simulatedSeconds).toBe(hours * 3600 * BALANCE.offlineEfficiency);
    expect(r.gains.food.gt(0)).toBe(true);
    expect(s.lastUpdate).toBe((hours + 10) * 3600 * 1000);
  });
});

describe('step', () => {
  it('a fresh game can make progress by itself after buying a few things', () => {
    const s = newGame(0);
    for (let t = 0; t < 3600; t += 10) {
      buy(s, 'farm', 'max');
      buy(s, 'barracks', 'max');
      buy(s, 'market', 'max');
      step(s, 10);
    }
    expect(s.sector).toBeGreaterThan(0);
  });
});
