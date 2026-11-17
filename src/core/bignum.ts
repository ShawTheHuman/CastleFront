import Decimal from 'break_infinity.js';

export { Decimal };
export type Num = Decimal;
export type NumLike = Decimal | number | string;

export const D = (v: NumLike): Decimal => new Decimal(v);
export const ZERO = (): Decimal => new Decimal(0);

const SMALL_SUFFIXES = ['', 'K', 'M', 'B', 'T'];
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
/** Highest group index the two-letter suffixes (aa..zz) can name. */
const MAX_GROUP = SMALL_SUFFIXES.length - 1 + LETTERS.length * LETTERS.length;

function suffixFor(group: number): string {
  if (group < SMALL_SUFFIXES.length) return SMALL_SUFFIXES[group] ?? '';
  const i = group - SMALL_SUFFIXES.length;
  return (LETTERS[Math.floor(i / LETTERS.length)] ?? '') + (LETTERS[i % LETTERS.length] ?? '');
}

function trim(n: number, digits: number): string {
  const s = n.toFixed(digits);
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/**
 * Idle-game number formatting: 999, 1.23K, 45.6M, 7.89T, 1.2aa ... 9.9zz, then 1.23e2034.
 * Shows three significant digits above 1000.
 */
export function formatNumber(value: NumLike): string {
  const d = D(value);
  if (d.lt(0)) return '-' + formatNumber(d.neg());
  if (d.lt(1000)) {
    const n = d.toNumber();
    return Number.isInteger(n) ? String(n) : trim(n, n < 10 ? 2 : 1);
  }
  const exp = d.exponent;
  const group = Math.floor(exp / 3);
  if (group > MAX_GROUP) return `${trim(d.mantissa, 2)}e${exp}`;
  const scaled = d.mantissa * Math.pow(10, exp - group * 3);
  // Rounding (e.g. 999.96K) can spill into the next group.
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  if (Number(scaled.toFixed(digits)) >= 1000) {
    return group + 1 > MAX_GROUP ? `1e${(group + 1) * 3}` : '1' + suffixFor(group + 1);
  }
  return trim(scaled, digits) + suffixFor(group);
}

/** Seconds -> "3d 4h", "2h 05m", "4m 09s", "12s". */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '∞';
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${pad(m)}m`;
  if (m > 0) return `${m}m ${pad(sec)}s`;
  return `${sec}s`;
}
