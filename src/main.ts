import './style.css';
import {
  applyOffline,
  armyPower,
  assetsUnlockedBy,
  currentEnemyPower,
  deserialize,
  formatDuration,
  formatNumber,
  assault,
  assaultPreview,
  isHQ,
  levelOutput,
  rivalBuildFraction,
  rivalHasAsset,
  rivalIsFull,
  milestoneTier,
  newGame,
  productionMultiplier,
  progressIndex,
  RESOURCE_NAMES,
  serialize,
  step,
  unlockRequirement,
  type Decimal,
  type GameState,
  type OfflineReport,
  type ProgressEvent,
  type ResourceId,
} from './core';
import { ASSETS, getAsset } from './data/assets';
import { BALANCE } from './data/balance';
import { localSaveStorage } from './platform/storage';
import { World } from './render/world';
import { ICON, el } from './ui/dom';
import { TopHud } from './ui/hud';
import { Labels } from './ui/labels';
import { showModal, toast } from './ui/modal';
import { BuildingSheet } from './ui/sheet';

const SIM_STEP = 0.1; // seconds per simulation step
const SAVE_EVERY = 5; // seconds
const FLOAT_EVERY = 5; // seconds between "+N" popups

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
const persist = () => localSaveStorage.store(serialize(state));

// ── Scene and UI ────────────────────────────────────────────────────────
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const ui = document.getElementById('hud')!;
const world = createWorld();

/** The 3D view, or a plain explanation if this device can't run it. */
function createWorld(): World {
  try {
    return new World(canvas);
  } catch (e) {
    const splash = document.getElementById('splash');
    if (splash) {
      splash.classList.add('error');
      splash.querySelector('.splash-note')!.textContent =
        'This device could not start 3D graphics (WebGL). Try another browser, or turn on hardware acceleration.';
    }
    throw e;
  }
}
const labels = new Labels(world);
const top = new TopHud();
const sheet = new BuildingSheet(
  () => state,
  (assetId, levels) => {
    labels.float('ours', assetId, `Lv +${levels}`, 'lvl');
    syncWorld();
  },
);
ui.append(labels.root, top.root);
top.mountAssault(ui);
sheet.mount(ui);

function syncWorld(): void {
  for (const a of ASSETS) {
    const lvl = state.levels[a.id] ?? 0;
    world.syncSlot('ours', a.id, {
      level: lvl,
      built: lvl > 0 && unlockRequirement(state, a) === null,
      tier: milestoneTier(lvl),
    });
    const rl = state.rival.levels[a.id] ?? 0;
    world.syncSlot('rival', a.id, {
      level: rl,
      built: rl > 0 && rivalHasAsset(state.map, a.id),
      tier: milestoneTier(rl),
    });
  }
}

/** Army size on screen: grows with the log of power, so it keeps growing for a long time. */
const unitsFor = (power: { log10(): number }) =>
  Math.max(3, Math.round(Math.max(0, power.log10()) * 14));

// ── Input: drag to pan, tap a building to open it ──────────────────────
let down: { x: number; y: number; lastY: number; dragging: boolean } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, lastY: e.clientY, dragging: false };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!down) return;
  if (!down.dragging && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8)
    down.dragging = true;
  if (down.dragging) {
    world.panBy(e.clientY - down.lastY);
    down.lastY = e.clientY;
  }
});
canvas.addEventListener('pointerup', (e) => {
  if (down && !down.dragging) {
    const hit = world.pick(e.clientX, e.clientY);
    if (hit?.side === 'ours') sheet.open(hit.assetId);
    else if (hit) showRivalBuilding(hit.assetId);
  }
  down = null;
});
canvas.addEventListener('pointercancel', () => (down = null));
canvas.addEventListener('wheel', (e) => world.panBy(-e.deltaY * 0.5), { passive: true });
top.viewButton.onclick = () => world.panTo(top.viewTarget);
top.assaultButton.onclick = () => showAssault();

/** Read-only card for one of the rival's buildings, compared with ours. */
function showRivalBuilding(assetId: string): void {
  const asset = getAsset(assetId);
  const theirs = state.rival.levels[assetId] ?? 0;
  const ours = state.levels[assetId] ?? 0;
  const diff = ours - theirs;
  showModal(
    `Rival ${asset.name}`,
    [
      list([compareRow('Rival', theirs), compareRow('You', ours)]),
      para(
        diff > 0
          ? `You are ${diff} level${diff === 1 ? '' : 's'} ahead.`
          : diff < 0
            ? `The rival is ${-diff} level${diff === -1 ? '' : 's'} ahead.`
            : 'Dead even.',
      ),
    ],
    [{ label: 'Close' }],
  );
}

function compareRow(who: string, level: number): HTMLElement {
  const row = el('span', 'gain');
  row.append(el('span', '', who), el('b', '', level > 0 ? `Lv ${level}` : 'Not built'));
  return row;
}

/** Preview, then launch, the assault on the rival's base. */
function showAssault(): void {
  const p = assaultPreview(state);
  if (!p.reachable || p.regroupIn > 0) return;
  const verdict = p.wins
    ? 'Your army is stronger. Victory is in reach.'
    : `Their army is stronger. You need ${formatNumber(p.theirs.sub(p.ours))} more power, or the attack will fail and your army must regroup.`;
  showModal(
    'Assault the rival base?',
    [
      list([powerRow('Your army', p.ours, true), powerRow('Rival army', p.theirs, false)]),
      para(verdict),
    ],
    [
      {
        label: p.wins ? 'Attack!' : 'Attack anyway',
        kind: p.wins ? 'primary' : 'danger',
        onClick: () => handleEvents(assault(state)),
      },
      { label: 'Not yet', kind: 'plain' },
    ],
  );
}

function powerRow(who: string, power: Decimal, ours: boolean): HTMLElement {
  const row = el('span', `gain ${ours ? '' : 'foe'}`);
  row.append(el('span', '', who), el('b', '', `⚔ ${formatNumber(power)}`));
  return row;
}

let warnedRival = 0;

// ── Events ──────────────────────────────────────────────────────────────
function handleEvents(events: ProgressEvent[], quiet = false): void {
  for (const e of events) {
    if (e.kind === 'sectorCleared') {
      const progressAfter = (e.map - 1) * (BALANCE.sectorsPerMap + 1) + e.index + 1;
      if (!quiet && !isHQ(e.index)) {
        toast(
          `Outpost taken! +${formatNumber(e.bounty)} ${ICON.gold} · its income is yours now`,
          'win',
        );
      }
      for (const a of assetsUnlockedBy(progressAfter))
        toast(`New building: ${a.name}`, 'unlock', 3200);
    } else if (e.kind === 'mapCleared') {
      labels.resetRival();
      warnedRival = 0;
      showModal(
        `Map ${e.map} conquered!`,
        [
          para(
            `The rival's base has fallen. On to Map ${e.map + 1}, where a new rival starts from a copy of your base.`,
          ),
          list([
            `Level cap raised to ${e.newCap}`,
            `All production ×${BALANCE.conquestProductionMult}`,
          ]),
        ],
        [{ label: 'Advance' }],
      );
    } else if (e.kind === 'assaultFailed') {
      showModal(
        'The assault failed',
        [
          list([powerRow('Your army', e.ours, true), powerRow('Rival army', e.theirs, false)]),
          para(
            `Your army falls back to regroup for ${formatDuration(e.readyIn)}. Keep upgrading and try again.`,
          ),
        ],
        [{ label: 'Back to work' }],
      );
    } else if (e.kind === 'rivalRepelled') {
      toast('You held the line! Counter-attacking…', 'win', 3000);
    } else if (e.kind === 'rivalRaid') {
      const lost = (Object.entries(e.losses) as [ResourceId, Decimal][])
        .filter(([, v]) => v.gt(0))
        .map(([r, v]) => {
          const row = el('span', 'gain foe');
          row.append(
            el('span', 'ico', ICON[r]),
            el('span', '', RESOURCE_NAMES[r]),
            el('b', '', `−${formatNumber(v)}`),
          );
          return row;
        });
      showModal(
        'The rival attacked!',
        [
          para('Their army reached full strength and broke through your lines.'),
          list([powerRow('Your army', e.ours, true), powerRow('Rival army', e.theirs, false)]),
          ...(lost.length ? [para('They carried off:'), list(lost)] : []),
          para(
            `They will attack again in ${formatDuration(e.nextIn)}. Grow your army to hold the line, or strike first.`,
          ),
        ],
        [{ label: 'Rebuild' }],
      );
    }
  }
  if (events.length) syncWorld();
}

function para(text: string): HTMLElement {
  return el('p', '', text);
}

function list(items: (string | HTMLElement)[]): HTMLElement {
  const ul = el('ul', 'gains');
  for (const i of items) {
    const li = el('li');
    li.append(i);
    ul.append(li);
  }
  return ul;
}

function showOffline(r: OfflineReport): void {
  if (r.awaySeconds < 60) return handleEvents(r.events, true);
  if (r.awaySeconds < 5 * 60) {
    // A quick app switch: no card, just a note.
    toast(`Welcome back! +${formatNumber(r.gains.gold)} ${ICON.gold}`, 'info');
    return handleEvents(r.events, true);
  }
  const gains = (Object.entries(r.gains) as [ResourceId, Decimal][])
    .filter(([, v]) => v.gt(0))
    .map(([res, v]) => {
      const row = el('span', 'gain');
      row.append(
        el('span', 'ico', ICON[res]),
        el('span', '', RESOURCE_NAMES[res]),
        el('b', '', `+${formatNumber(v)}`),
      );
      return row;
    });
  const capped = r.awaySeconds > r.creditedSeconds + 1;
  const sectors = r.events.filter((e) => e.kind === 'sectorCleared').length;
  showModal(
    'Welcome back, Commander',
    [
      para(
        `You were away ${formatDuration(r.awaySeconds)}. Your base kept working at ${Math.round(BALANCE.offlineEfficiency * 100)}% speed` +
          (capped ? ` for ${formatDuration(r.creditedSeconds)}, the most it can store.` : '.'),
      ),
      list(gains),
      ...(sectors
        ? [para(`Your army took ${sectors} outpost${sectors > 1 ? 's' : ''} while you were gone.`)]
        : []),
    ],
    [{ label: 'Collect' }],
    'offline',
  );
  handleEvents(r.events, true);
}

top.settingsButton.onclick = () => {
  const confirmRow = el('div', 'confirm-row');
  confirmRow.hidden = true;
  const yes = el('button', 'btn danger', 'Yes, erase everything');
  yes.onclick = () => {
    state = newGame();
    persist();
    location.reload();
  };
  confirmRow.append(para('This erases your base and progress. It cannot be undone.'), yes);
  showModal(
    'Settings',
    [para(`Map ${state.map} · played ${formatDuration(state.playTime)}`), confirmRow],
    [
      {
        label: 'Skip 1 hour (testing)',
        kind: 'plain',
        onClick: () => {
          const events: ProgressEvent[] = [];
          for (let i = 0; i < 60; i++) events.push(...step(state, 60));
          handleEvents(events, true);
          toast('Skipped 1 hour', 'info');
        },
      },
      {
        label: 'Reset progress',
        kind: 'danger',
        keepOpen: true,
        onClick: () => (confirmRow.hidden = false),
      },
      { label: 'Close' },
    ],
    'settings',
  );
};

// ── Start ───────────────────────────────────────────────────────────────
syncWorld();
showOffline(applyOffline(state));

let acc = 0;
let saveAcc = 0;
let uiAcc = 1;
let floatAcc = 0;
let hudBottom = 0;
let last = performance.now();

function floatProduction(): void {
  const mult = productionMultiplier(state.map);
  for (const a of ASSETS) {
    const lvl = state.levels[a.id] ?? 0;
    const e = a.effect;
    if (lvl <= 0) continue;
    if (e.kind === 'produce') {
      labels.floatAmount(
        a.id,
        levelOutput(e.base, lvl).mul(mult).mul(FLOAT_EVERY),
        ICON[e.resource],
      );
    }
  }
}

function frame(now: number): void {
  const dt = Math.min(0.5, (now - last) / 1000);
  last = now;
  acc += dt;
  const before = progressIndex(state);
  while (acc >= SIM_STEP) {
    acc -= SIM_STEP;
    handleEvents(step(state, SIM_STEP));
  }
  state.lastUpdate = Date.now();
  if (progressIndex(state) !== before) syncWorld();

  uiAcc += dt;
  if (uiAcc >= 0.25) {
    uiAcc = 0;
    top.update(state, world.view);
    hudBottom = top.root.getBoundingClientRect().bottom;
    labels.refresh(state, currentEnemyPower(state), isHQ(state.sector));
    const built = rivalBuildFraction(state);
    if (warnedRival < 0.9 && built >= 0.9 && !rivalIsFull(state)) {
      toast('The rival base is 90% built. When it is done, they attack!', 'info', 4000);
    }
    warnedRival = built;
    sheet.update();
    syncWorld();
  }
  floatAcc += dt;
  if (floatAcc >= FLOAT_EVERY) {
    floatAcc = 0;
    if (!document.hidden) floatProduction();
  }
  saveAcc += dt;
  if (saveAcc >= SAVE_EVERY) {
    saveAcc = 0;
    persist();
  }

  world.update(
    dt,
    unitsFor(armyPower(state)),
    unitsFor(currentEnemyPower(state)),
    state.sector,
    isHQ(state.sector),
  );
  labels.place(hudBottom);
  requestAnimationFrame(frame);

  // Hide the splash once the first frames have drawn and the fonts are in (or after 3 s at most).
  Promise.race([
    Promise.all([
      document.fonts?.ready ?? Promise.resolve(),
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    ]),
    new Promise((r) => setTimeout(r, 3000)),
  ]).then(() => document.getElementById('splash')?.classList.add('done'));
}
requestAnimationFrame(frame);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) persist();
  else showOffline(applyOffline(state));
});
window.addEventListener('pagehide', persist);

// Dev helpers in the browser console.
Object.assign(window, {
  cf: {
    get state() {
      return state;
    },
    /** Draw calls and triangles of the last frame. */
    get render() {
      return { ...world.renderer.info.render };
    },
    reset() {
      state = newGame();
      persist();
      location.reload();
    },
  },
});
