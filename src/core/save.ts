import { D } from './bignum';
import { newGame } from './state';
import { RESOURCE_IDS, type GameState } from './types';
import { ASSETS } from '../data/assets';

export const SAVE_VERSION = 1;

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

type AnySave = SaveFileV1;

/** Migrations from version N to N+1. Add one entry per SAVE_VERSION bump. */
const MIGRATIONS: Record<number, (save: unknown) => unknown> = {};

export function serialize(state: GameState, now = Date.now()): string {
  const file: SaveFileV1 = {
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
