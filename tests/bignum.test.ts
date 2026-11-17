import { describe, expect, it } from 'vitest';
import { D, formatDuration, formatNumber } from '../src/core/bignum';

describe('formatNumber', () => {
  it.each([
    [0, '0'],
    [7, '7'],
    [3.14159, '3.14'],
    [42.75, '42.8'],
    [999, '999'],
    [1000, '1K'],
    [1234, '1.23K'],
    [12_345, '12.3K'],
    [250_000_000, '250M'],
    [999_999, '1M'],
    [1e12, '1T'],
    [1e15, '1aa'],
    [3.5e18, '3.5ab'],
    [-1500, '-1.5K'],
  ])('%s -> %s', (n, s) => {
    expect(formatNumber(n)).toBe(s);
  });

  it('handles numbers past double range', () => {
    expect(formatNumber(D('1e500'))).toMatch(/[a-z]{2}$/);
    expect(formatNumber(D('2.5e5000'))).toBe('2.5e5000');
  });
});

describe('formatDuration', () => {
  it.each([
    [5, '5s'],
    [65, '1m 05s'],
    [3700, '1h 01m'],
    [90_000, '1d 1h'],
  ])('%s -> %s', (n, s) => expect(formatDuration(n)).toBe(s));
});
