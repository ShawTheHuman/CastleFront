import './style.css';
import {
  applyOffline,
  armyPower,
  currentEnemyPower,
  deserialize,
  formatDuration,
  formatNumber,
  newGame,
  serialize,
  step,
  type GameState,
} from './core';
import { localSaveStorage } from './platform/storage';
import { BattlefieldScene } from './render/scene';
import { DevHud } from './ui/devHud';

const SIM_STEP = 0.1; // seconds
const SAVE_EVERY = 5; // seconds

function load(): GameState {
  const raw = localSaveStorage.load();
  if (!raw) return newGame();
  try {
    return deserialize(raw);
  } catch (e) {
    console.warn('Discarding unreadable save', e);
    return newGame();
  }
}

let state = load();
const offline = applyOffline(state);

const scene = new BattlefieldScene(document.getElementById('scene') as HTMLCanvasElement);
const hud = new DevHud(document.getElementById('hud')!, () => state);

if (offline.creditedSeconds > 60) {
  const gold = formatNumber(offline.gains.gold);
  hud.toast(`Welcome back! Away ${formatDuration(offline.awaySeconds)} · +${gold} gold`, 4000);
}

/** A visual stand-in for army size: grows with the log of power. */
const unitsFor = (power: { log10(): number }) =>
  Math.max(1, Math.round(Math.max(0, power.log10()) * 12));

let acc = 0;
let saveAcc = 0;
let hudAcc = 0;
let last = performance.now();

function frame(now: number): void {
  const dt = Math.min(1, (now - last) / 1000);
  last = now;
  acc += dt;
  while (acc >= SIM_STEP) {
    acc -= SIM_STEP;
    for (const e of step(state, SIM_STEP)) {
      if (e.kind === 'mapCleared') hud.toast(`🏰 Map ${e.map} conquered! Level cap → ${e.newCap}`);
      else if (e.kind === 'sectorCleared')
        hud.toast(`Target cleared: +${formatNumber(e.bounty)} gold`, 1200);
    }
  }
  state.lastUpdate = Date.now();

  hudAcc += dt;
  if (hudAcc > 0.25) {
    hudAcc = 0;
    hud.update();
  }
  saveAcc += dt;
  if (saveAcc > SAVE_EVERY) {
    saveAcc = 0;
    localSaveStorage.store(serialize(state));
  }

  scene.update(dt, unitsFor(armyPower(state)), unitsFor(currentEnemyPower(state)));
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

const persist = () => localSaveStorage.store(serialize(state));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) persist();
  else {
    const r = applyOffline(state);
    if (r.creditedSeconds > 60) hud.toast(`Welcome back! +${formatNumber(r.gains.gold)} gold`);
  }
});
window.addEventListener('pagehide', persist);

// Dev helpers in the browser console.
Object.assign(window, {
  cf: {
    get state() {
      return state;
    },
    reset() {
      state = newGame();
      persist();
      location.reload();
    },
  },
});
