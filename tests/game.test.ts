import { describe, expect, it } from 'vitest';
import {
  D,
  applyOffline,
  armyPower,
  autoAdvance,
  buy,
  canClearCurrent,
  clearCurrent,
  enemyPower,
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

  it('converters are throttled by their input', () => {
    const s = newGame(0);
    s.levels.mine = 1; // 2 ore/s
    s.levels.foundry = 50; // wants far more than 2 ore/s
    tickEconomy(s, 100);
    expect(s.resources.ore.toNumber()).toBe(0);
    expect(s.resources.steel.toNumber()).toBeCloseTo(200 * 0.5);
  });

  it('one long tick equals many short ones (offline is exact)', () => {
    const a = newGame(0);
    Object.assign(a.levels, {
      market: 30,
      farm: 20,
      mine: 40,
      foundry: 60,
      derrick: 10,
      refinery: 5,
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
  it('enemy power never decreases across ten maps', () => {
    let prev = D(0);
    for (let m = 1; m <= 10; m++) {
      for (let i = 0; i < TARGETS_PER_MAP; i++) {
        const p = enemyPower(m, i);
        expect(p.gte(prev), `map ${m} target ${i}`).toBe(true);
        prev = p;
      }
    }
  });

  it('a starting army beats the first target only after some upgrades', () => {
    const s = newGame(0);
    expect(canClearCurrent(s)).toBe(false);
    s.levels.barracks = 10;
    expect(canClearCurrent(s)).toBe(true);
  });

  it('a reference-level army at the cap can beat each HQ', () => {
    for (let m = 1; m <= 5; m++) {
      const levels = Object.fromEntries(ASSETS.map((a) => [a.id, levelCap(m)]));
      expect(armyPower({ levels }).gte(enemyPower(m, TARGETS_PER_MAP - 1))).toBe(true);
    }
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
  it('applies efficiency and the warehouse cap', () => {
    const s = newGame(0);
    s.levels.farm = 10;
    const hours = offlineCapHours(s);
    expect(hours).toBe(2);
    const r = applyOffline(s, 10 * 3600 * 1000); // 10h away
    expect(r.creditedSeconds).toBe(2 * 3600);
    expect(r.simulatedSeconds).toBe(2 * 3600 * BALANCE.offlineEfficiency);
    expect(r.gains.food.gt(0)).toBe(true);
    expect(s.lastUpdate).toBe(10 * 3600 * 1000);
  });

  it('a better warehouse holds more hours, up to its maximum', () => {
    const s = newGame(0);
    s.levels.warehouse = 8;
    expect(offlineCapHours(s)).toBe(4);
    s.levels.warehouse = 1000;
    expect(offlineCapHours(s)).toBe(12);
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
