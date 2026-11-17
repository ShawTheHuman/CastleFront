import { describe, expect, it } from 'vitest';
import { D } from '../src/core/bignum';
import {
  costForLevels,
  levelCap,
  levelOutput,
  maxAffordableLevels,
  milestoneMultiplier,
} from '../src/core/formulas';
import { emptyResources } from '../src/core/state';
import { getAsset } from '../src/data/assets';
import { BALANCE } from '../src/data/balance';

const farm = getAsset('farm');
const foundry = getAsset('foundry');

describe('output curve', () => {
  it('is zero at level 0 and doubles at each milestone', () => {
    expect(levelOutput(2, 0).toNumber()).toBe(0);
    expect(milestoneMultiplier(24).toNumber()).toBe(1);
    expect(milestoneMultiplier(25).toNumber()).toBe(BALANCE.milestoneMult);
    expect(milestoneMultiplier(100).toNumber()).toBe(BALANCE.milestoneMult ** 4);
    expect(levelOutput(2, 25).toNumber()).toBe(2 * 25 * BALANCE.milestoneMult);
  });

  it('level caps rise by 100 per map', () => {
    expect(levelCap(1)).toBe(100);
    expect(levelCap(2)).toBe(200);
    expect(levelCap(7)).toBe(700);
  });
});

describe('costs', () => {
  it('sum of single upgrades equals the bulk price', () => {
    let manual = 0;
    for (let i = 0; i < 10; i++) manual += costForLevels(farm, 30 + i, 1).gold!.toNumber();
    expect(costForLevels(farm, 30, 10).gold!.toNumber()).toBeCloseTo(manual, 6);
  });

  it('grows by costGrowth each level', () => {
    const a = costForLevels(farm, 10, 1).gold!;
    const b = costForLevels(farm, 11, 1).gold!;
    expect(b.div(a).toNumber()).toBeCloseTo(farm.costGrowth, 10);
  });

  it('stays finite at very high levels', () => {
    const c = costForLevels(farm, 50_000, 1).gold!;
    expect(Number.isFinite(c.mantissa)).toBe(true);
    expect(c.exponent).toBeGreaterThan(308);
  });

  it('maxAffordableLevels is exact and limited by the scarcest resource', () => {
    const res = emptyResources();
    res.gold = D(1e9);
    res.food = costForLevels(foundry, 5, 3).food!; // exactly 3 levels of food
    expect(maxAffordableLevels(foundry, 5, res, 1000)).toBe(3);
    res.food = res.food.sub(1);
    expect(maxAffordableLevels(foundry, 5, res, 1000)).toBe(2);
    res.food = D(1e30);
    expect(maxAffordableLevels(foundry, 5, res, 4)).toBe(4);
  });
});
