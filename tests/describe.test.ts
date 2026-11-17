import { describe, expect, it } from 'vitest';
import {
  assetsUnlockedBy,
  describeEffect,
  discoveredResources,
  newGame,
  nextMilestone,
  targetName,
  unlockRequirement,
} from '../src/core';
import { getAsset } from '../src/data/assets';

describe('describe helpers', () => {
  it('shows a producer now and after the upgrade', () => {
    const s = newGame(0);
    s.levels.farm = 1;
    expect(describeEffect(s, 'farm', 1)).toEqual([{ label: 'Food made', now: '2/s', next: '4/s' }]);
  });

  it('shows both sides of a converter', () => {
    const s = newGame(0);
    s.levels.foundry = 2;
    const lines = describeEffect(s, 'foundry', 1);
    expect(lines.map((l) => l.label)).toEqual(['Ore used', 'Steel made']);
    expect(lines[1]).toMatchObject({ now: '2/s', next: '3/s' });
  });

  it('shows the commander multiplier and warehouse hours', () => {
    const s = newGame(0);
    expect(describeEffect(s, 'commander', 1)[0]).toMatchObject({ now: '×1.05', next: '×1.1' });
    expect(describeEffect(s, 'warehouse', 2)[0]).toMatchObject({ now: '2h', next: '2.5h' });
  });

  it('finds the next milestone', () => {
    expect(nextMilestone(0).level).toBe(25);
    expect(nextMilestone(25).level).toBe(50);
    expect(nextMilestone(49).level).toBe(50);
  });

  it('names targets and unlock requirements', () => {
    expect(targetName(0)).toBe('Map 1 · Sector 1');
    expect(targetName(8)).toBe('Map 1 HQ');
    expect(targetName(9)).toBe('Map 2 · Sector 1');
    const s = newGame(0);
    expect(unlockRequirement(s, getAsset('farm'))).toBeNull();
    expect(unlockRequirement(s, getAsset('mine'))).toBe('Beat Map 1 · Sector 1');
    expect(unlockRequirement(s, getAsset('airfield'))).toBe('Beat Map 1 HQ');
  });

  it('only shows resources the player can know about', () => {
    const s = newGame(0);
    expect(discoveredResources(s)).toEqual(['gold', 'food']);
    s.sector = 1;
    expect(discoveredResources(s)).toEqual(['gold', 'food', 'ore', 'steel']);
  });

  it('lists unlocks by progress', () => {
    expect(assetsUnlockedBy(1).map((a) => a.id)).toEqual(['mine', 'foundry']);
  });
});
