/**
 * Headless balance simulator.
 *
 * Plays the game with a simple, reasonable strategy and reports pacing per map: how long each map
 * took, how that compares with the rival's schedule, and whether the rival attacked first.
 *
 * Strategy: the same greedy AI the rival uses (src/core/ai.ts). Assault the rival's base as soon
 * as the army is strong enough.
 *
 * `--pace` models a less efficient player: their economy runs at that fraction of speed while the
 * rival builds at full speed. 1 = an attentive player who buys the moment they can afford it.
 *
 * Usage: npm run balance -- [--maps 10] [--dt 60] [--days 400] [--pace 1]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  armyPower,
  assault,
  assaultPreview,
  autoAdvance,
  buyGreedy,
  checkRivalAttack,
  formatDuration,
  formatNumber,
  newGame,
  rivalBuildFraction,
  rivalPace,
  rivalPower,
  tickEconomy,
  tickRival,
  type ProgressEvent,
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
const PACE = arg('pace', 1);

interface MapRow {
  map: number;
  duration: number;
  outpostsDone: number;
  rivalBuilt: number;
  rivalPace: number;
  rivalPower: string;
  raids: number;
  how: string;
  avgArmyLevel: number;
  power: string;
}

const state = newGame(0);
const rows: MapRow[] = [];
const levelLog: string[] = [];
const targetTimes: string[] = ['map,target,time_s'];
let mapStart = 0;
let outpostsDone = 0;
let raids = 0;
let repelled = false;
let t = 0;

while (state.map <= MAPS && t < MAX_DAYS * 86400) {
  buyGreedy(state);
  const levelsBefore = { ...state.levels };
  const rivalBuiltBefore = rivalBuildFraction(state);
  const rivalPowerBefore = rivalPower(state);
  const mapBefore = state.map;
  tickEconomy(state, DT * PACE);
  state.playTime += DT * (1 - PACE); // keep playTime as wall-clock play for the rival
  tickRival(state, DT);
  t += DT;
  const events: ProgressEvent[] = autoAdvance(state);
  events.push(...checkRivalAttack(state));
  const p = assaultPreview(state);
  if (state.map === mapBefore && p.reachable && p.wins && p.regroupIn === 0)
    events.push(...assault(state));

  for (const e of events) {
    if (e.kind === 'sectorCleared') {
      targetTimes.push(`${e.map},${e.index},${t}`);
      if (e.index === TARGETS_PER_MAP - 2) outpostsDone = t - mapStart;
    }
    if (e.kind === 'rivalRaid') raids++;
    if (e.kind === 'rivalRepelled') repelled = true;
    if (e.kind === 'mapCleared') {
      const army = ASSETS.filter((a) => a.line === 'front' && (levelsBefore[a.id] ?? 0) > 0);
      const avg = army.reduce((s, a) => s + (levelsBefore[a.id] ?? 0), 0) / army.length;
      rows.push({
        map: e.map,
        duration: t - mapStart,
        outpostsDone,
        rivalBuilt: rivalBuiltBefore,
        rivalPace: rivalPace(e.map),
        rivalPower: formatNumber(rivalPowerBefore),
        raids,
        how: repelled ? 'held, countered' : raids ? 'won after raids' : 'assault',
        avgArmyLevel: Math.round(avg),
        power: formatNumber(armyPower({ levels: levelsBefore })),
      });
      levelLog.push(
        `map ${e.map}: ` + ASSETS.map((a) => `${a.id} ${levelsBefore[a.id] ?? 0}`).join(', '),
      );
      mapStart = t;
      raids = 0;
      repelled = false;
    }
  }
}

const pad = (s: string | number, n: number) => String(s).padStart(n);
console.log(
  `Balance sim: dt=${DT}s, pace=${PACE}, ${TARGETS_PER_MAP - 1} outposts + rival base per map\n`,
);
console.log(
  [
    pad('map', 3),
    pad('time on map', 12),
    pad('×prev', 6),
    pad('outposts', 9),
    pad('rival pace', 10),
    pad('rival built', 11),
    pad('rival power', 11),
    pad('raids', 5),
    pad('won by', 16),
    pad('army L', 7),
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
      pad(formatDuration(r.outpostsDone), 9),
      pad(r.rivalPace.toFixed(2), 10),
      pad(`${Math.round(r.rivalBuilt * 100)}%`, 11),
      pad(r.rivalPower, 11),
      pad(r.raids, 5),
      pad(r.how, 16),
      pad(r.avgArmyLevel, 7),
      pad(r.power, 9),
    ].join('  '),
  );
});
console.log('\nrival built = how much of its base the rival had finished when the map fell.');
if (state.map <= MAPS) {
  console.log(
    `\nStopped at map ${state.map}, target ${state.sector} after ${formatDuration(t)} (limit ${MAX_DAYS}d).`,
  );
}
console.log('\nLevels when each base fell:\n' + levelLog.join('\n'));

mkdirSync('tools/out', { recursive: true });
writeFileSync('tools/out/targets.csv', targetTimes.join('\n') + '\n');
writeFileSync(
  'tools/out/maps.csv',
  'map,duration_s,outposts_done_s,rival_pace,rival_built,raids,won_by,avg_army_level\n' +
    rows
      .map((r) =>
        [
          r.map,
          r.duration,
          r.outpostsDone,
          r.rivalPace,
          r.rivalBuilt.toFixed(3),
          r.raids,
          r.how,
          r.avgArmyLevel,
        ].join(','),
      )
      .join('\n') +
    '\n',
);
