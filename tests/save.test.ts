import { describe, expect, it } from 'vitest';
import { D, SaveError, deserialize, newGame, serialize } from '../src/core';

describe('save/load', () => {
  it('round-trips the full state, including huge numbers', () => {
    const s = newGame(1234);
    s.resources.gold = D('4.2e1234');
    s.levels.farm = 321;
    s.map = 4;
    s.sector = 7;
    s.conquestGold = D('1e50');
    s.playTime = 99;
    const back = deserialize(serialize(s));
    expect(back.resources.gold.toString()).toBe(s.resources.gold.toString());
    expect(back.levels.farm).toBe(321);
    expect(back.map).toBe(4);
    expect(back.sector).toBe(7);
    expect(back.conquestGold.toString()).toBe('1e+50');
    expect(back.lastUpdate).toBe(1234);
    expect(back.playTime).toBe(99);
  });

  it('fills in defaults for assets missing from an old save and drops unknown ones', () => {
    const file = JSON.parse(serialize(newGame(0)));
    delete file.state.levels.market;
    file.state.levels.retiredBuilding = 5;
    const back = deserialize(JSON.stringify(file));
    expect(back.levels.market).toBe(1);
    expect(back.levels.retiredBuilding).toBeUndefined();
  });

  it('rejects garbage and saves from the future', () => {
    expect(() => deserialize('not json')).toThrow(SaveError);
    expect(() => deserialize('{}')).toThrow(SaveError);
    expect(() => deserialize(JSON.stringify({ version: 999, state: {} }))).toThrow(SaveError);
    expect(() => deserialize(JSON.stringify({ version: 1, state: { map: 0, sector: 0 } }))).toThrow(
      SaveError,
    );
  });
});
