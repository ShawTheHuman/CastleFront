/**
 * Headless balance simulator.
 *
 * Plays the game with a simple, reasonable strategy and reports pacing per map: when each map is
 * cleared, when assets hit the level cap, and how each map compares with the one before.
 *
 * Strategy ("buy whatever is cheapest in time"): every step, repeatedly buy the single upgrade
 * whose cost is the fewest seconds of current income, until nothing is affordable. This levels
 * assets evenly, the way an attentive player does. The player is assumed always online.
 *
 * Usage: npm run balance -- [--maps 10] [--dt 60] [--days 400]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  armyPower,
  buy,
  formatDuration,
  formatNumber,
  isUnlocked,
  levelCap,
  netRates,
  newGame,
  quote,
  step,
  type Decimal,
  type GameState,
  type ResourceId,
} from '../src/core';
import { ASSETS } from '../src/data/assets';
import { TARGETS_PER_MAP } from '../src/data/balance';

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(v) ? v : fallback;
}

const MAPS = arg('maps', 10);
const DT = arg('dt', 60);
const MAX_DAYS = arg('days', 400);

/** Assets the sim ignores (no effect on pacing while always online). */
const SKIP = new Set(['warehouse']);

function secondsToAfford(state: GameState, cost: Partial<Record<ResourceId, Decimal>>): number {
  const rates = netRates(state);
  let worst = 0;
  for (const [res, amt] of Object.entries(cost) as [ResourceId, Decimal][]) {
    const rate = rates[res];
    const t = rate.lte(0) ? Infinity : amt.div(rate).toNumber();
    worst = Math.max(worst, t);
  }
  return worst;
}

function buyGreedy(state: GameState): void {
  for (let guard = 0; guard < 10_000; guard++) {
    let best: { id: string; t: number } | null = null;
    for (const a of ASSETS) {
      if (SKIP.has(a.id) || !isUnlocked(state, a)) continue;
      const q = quote(state, a.id, 'x1');
      if (!q.affordable) continue;
      const t = secondsToAfford(state, q.cost);
      if (!best || t < best.t) best = { id: a.id, t };
    }
    if (!best) return;
    buy(state, best.id, 'x1');
  }
}

interface MapRow {
  map: number;
  clearedAt: number;
  duration: number;
  firstCapAt: number | null;
  avgArmyLevel: number;
  cappedAssets: number;
  power: string;
}

const state = newGame(0);
const rows: MapRow[] = [];
const targetTimes: string[] = ['map,target,time_s'];
const levelLog: string[] = [];
let mapStart = 0;
let firstCap: number | null = null;
let t = 0;

while (state.map <= MAPS && t < MAX_DAYS * 86400) {
  buyGreedy(state);
  const cap = levelCap(state.map);
  if (
    firstCap === null &&
    ASSETS.some((a) => !SKIP.has(a.id) && (state.levels[a.id] ?? 0) >= cap)
  ) {
    firstCap = t;
  }
  const levelsBefore = { ...state.levels };
  const capBefore = cap;
  const events = step(state, DT);
  t += DT;
  for (const e of events) {
    if (e.kind === 'sectorCleared') targetTimes.push(`${e.map},${e.index},${t}`);
    if (e.kind === 'mapCleared') {
      const army = ASSETS.filter((a) => a.line === 'front' && (levelsBefore[a.id] ?? 0) > 0);
      const avg = army.reduce((s, a) => s + (levelsBefore[a.id] ?? 0), 0) / army.length;
      rows.push({
        map: e.map,
        clearedAt: t,
        duration: t - mapStart,
        firstCapAt: firstCap === null ? null : firstCap - mapStart,
        avgArmyLevel: Math.round(avg),
        cappedAssets: ASSETS.filter((a) => (levelsBefore[a.id] ?? 0) >= capBefore).length,
        power: formatNumber(armyPower({ levels: levelsBefore })),
      });
      levelLog.push(
        `map ${e.map}: ` + ASSETS.map((a) => `${a.id} ${levelsBefore[a.id] ?? 0}`).join(', '),
      );
      mapStart = t;
      firstCap = null;
    }
  }
}

const pad = (s: string | number, n: number) => String(s).padStart(n);
console.log(`Balance sim: dt=${DT}s, always online, ${TARGETS_PER_MAP} targets/map\n`);
console.log(
  [
    pad('map', 3),
    pad('time on map', 12),
    pad('×prev', 6),
    pad('cleared at', 11),
    pad('1st cap', 9),
    pad('avg army L', 10),
    pad('capped', 6),
    pad('power', 9),
  ].join('  '),
);
rows.forEach((r, i) => {
  const prev = rows[i - 1];
  console.log(
    [
      pad(r.map, 3),
      pad(formatDuration(r.duration), 12),
      pad(prev ? (r.duration / prev.duration).toFixed(2) : '-', 6),
      pad(formatDuration(r.clearedAt), 11),
      pad(r.firstCapAt === null ? '-' : formatDuration(r.firstCapAt), 9),
      pad(r.avgArmyLevel, 10),
      pad(r.cappedAssets, 6),
      pad(r.power, 9),
    ].join('  '),
  );
});
if (state.map <= MAPS) {
  console.log(
    `\nStopped at map ${state.map}, target ${state.sector} after ${formatDuration(t)} (limit ${MAX_DAYS}d).`,
  );
}

console.log('\nLevels when each HQ fell:\n' + levelLog.join('\n'));

mkdirSync('tools/out', { recursive: true });
writeFileSync('tools/out/targets.csv', targetTimes.join('\n') + '\n');
writeFileSync(
  'tools/out/maps.csv',
  'map,cleared_at_s,duration_s,first_cap_s,avg_army_level,capped_assets\n' +
    rows
      .map((r) =>
        [r.map, r.clearedAt, r.duration, r.firstCapAt ?? '', r.avgArmyLevel, r.cappedAssets].join(
          ',',
        ),
      )
      .join('\n') +
    '\n',
);
console.log('\nWrote tools/out/maps.csv and tools/out/targets.csv');
