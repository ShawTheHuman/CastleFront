import { D } from './bignum';
import { newRival } from './rival';
import { newGame } from './state';
import { RESOURCE_IDS, type GameState } from './types';
import { ASSETS } from '../data/assets';

export const SAVE_VERSION = 2;

interface SaveFileV1 {
  version: 1;
  savedAt: number;
  state: {
    resources: Record<string, string>;
    levels: Record<string, number>;
    map: number;
    sector: number;
    conquestGold: string;
    lastUpdate: number;
    playTime: number;
  };
}

interface SaveFileV2 extends Omit<SaveFileV1, 'version' | 'state'> {
  version: 2;
  state: SaveFileV1['state'] & {
    /** Missing in saves migrated from v1: the rival then starts from a copy of the player. */
    rival: {
      resources: Record<string, string>;
      levels: Record<string, number>;
      startLevels: Record<string, number>;
      conquestGold: string;
      pending: number;
      nextAttackAt: number;
    } | null;
    assaultReadyAt: number;
  };
}

type AnySave = SaveFileV2;

/** Migrations from version N to N+1. Add one entry per SAVE_VERSION bump. */
const MIGRATIONS: Record<number, (save: unknown) => unknown> = {
  // v2 adds the rival. Old saves get a rival that starts building now.
  1: (save) => {
    const s = save as SaveFileV1;
    return {
      ...s,
      version: 2,
      state: { ...s.state, rival: null, assaultReadyAt: 0 },
    } satisfies SaveFileV2;
  },
};

export function serialize(state: GameState, now = Date.now()): string {
  const file: SaveFileV2 = {
    version: SAVE_VERSION,
    savedAt: now,
    state: {
      resources: Object.fromEntries(RESOURCE_IDS.map((r) => [r, state.resources[r].toString()])),
      levels: { ...state.levels },
      map: state.map,
      sector: state.sector,
      conquestGold: state.conquestGold.toString(),
      lastUpdate: state.lastUpdate,
      playTime: state.playTime,
      rival: {
        resources: Object.fromEntries(
          RESOURCE_IDS.map((r) => [r, state.rival.resources[r].toString()]),
        ),
        levels: { ...state.rival.levels },
        startLevels: { ...state.rival.startLevels },
        conquestGold: state.rival.conquestGold.toString(),
        pending: state.rival.pending,
        nextAttackAt: state.rival.nextAttackAt,
      },
      assaultReadyAt: state.assaultReadyAt,
    },
  };
  return JSON.stringify(file);
}

export class SaveError extends Error {}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/**
 * Parse a save, migrating old versions. Unknown assets/resources are dropped; new ones get their
 * defaults, so adding content never breaks old saves.
 */
export function deserialize(json: string): GameState {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new SaveError('Save is not valid JSON');
  }
  if (!raw || typeof raw !== 'object' || !isInt((raw as { version?: unknown }).version)) {
    throw new SaveError('Save has no version');
  }
  let version = (raw as { version: number }).version;
  if (version > SAVE_VERSION) throw new SaveError(`Save version ${version} is newer than the game`);
  while (version < SAVE_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) throw new SaveError(`No migration from save version ${version}`);
    raw = migrate(raw);
    version++;
  }
  const file = raw as AnySave;
  const s = file.state;
  if (!s || !isInt(s.map) || s.map < 1 || !isInt(s.sector) || s.sector < 0) {
    throw new SaveError('Save state is malformed');
  }

  const state = newGame(s.lastUpdate);
  for (const r of RESOURCE_IDS) {
    const v = s.resources?.[r];
    if (typeof v === 'string') state.resources[r] = D(v);
  }
  for (const a of ASSETS) {
    const v = s.levels?.[a.id];
    if (isInt(v) && v >= 0) state.levels[a.id] = v;
  }
  state.map = s.map;
  state.sector = s.sector;
  if (typeof s.conquestGold === 'string') state.conquestGold = D(s.conquestGold);
  if (typeof s.playTime === 'number') state.playTime = s.playTime;
  const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  if (isNum(s.assaultReadyAt)) state.assaultReadyAt = s.assaultReadyAt;
  state.rival = newRival(state.levels, state.conquestGold);
  const r = s.rival;
  if (r && typeof r === 'object') {
    for (const res of RESOURCE_IDS) {
      const v = r.resources?.[res];
      if (typeof v === 'string') state.rival.resources[res] = D(v);
    }
    for (const a of ASSETS) {
      const lv = r.levels?.[a.id];
      if (isInt(lv) && lv >= 0) state.rival.levels[a.id] = lv;
      const st = r.startLevels?.[a.id];
      if (isInt(st) && st >= 0) state.rival.startLevels[a.id] = st;
    }
    if (typeof r.conquestGold === 'string') state.rival.conquestGold = D(r.conquestGold);
    if (isNum(r.pending) && r.pending >= 0) state.rival.pending = r.pending;
    if (isNum(r.nextAttackAt)) state.rival.nextAttackAt = r.nextAttackAt;
  }
  for (const r of RESOURCE_IDS) {
    if (!Number.isFinite(state.resources[r].mantissa)) throw new SaveError(`Bad resource ${r}`);
  }
  return state;
}

/** Storage backend; the browser uses localStorage, native builds will use Capacitor Preferences. */
export interface SaveStorage {
  load(): string | null;
  store(data: string): void;
}
