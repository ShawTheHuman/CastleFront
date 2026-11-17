import {
  armyPower,
  assaultPreview,
  currentEnemyPower,
  discoveredResources,
  formatDuration,
  formatNumber,
  isHQ,
  netRates,
  OUTPOSTS_PER_MAP,
  RESOURCE_NAMES,
  playerBuildFraction,
  rivalBuildFraction,
  rivalIsFull,
  rivalPower,
  type GameState,
  type ResourceId,
} from '../core';
import { TARGETS_PER_MAP } from '../data/balance';
import type { View } from '../render/world';
import { ICON, el, setText } from './dom';

interface Chip {
  root: HTMLElement;
  amount: HTMLElement;
  rate: HTMLElement;
}

const NEXT_VIEW: Record<View, { to: View; label: string }> = {
  base: { to: 'front', label: 'Front ▲' },
  front: { to: 'rival', label: 'Rival ▲' },
  rival: { to: 'base', label: 'Base ▼' },
};

/**
 * Top of the screen: resources, then one panel with the map's progress and the race against the
 * rival (how much of each base is built, and each army's power). The assault button sits at the
 * bottom of the screen.
 */
export class TopHud {
  readonly root = el('div', 'top-hud');
  private resources = el('div', 'res-bar');
  private chips = new Map<ResourceId, Chip>();
  private mapName = el('div', 'map-name');
  private dots = el('div', 'dots');
  readonly viewButton = el('button', 'view-btn');
  readonly settingsButton = el('button', 'icon-btn', '⚙');
  readonly race = el('div', 'battle-bar');
  private caption = el('div', 'race-caption');
  private youFill = el('div', 'race-fill you');
  private rivalFill = el('div', 'race-fill rival');
  private youPct = el('span', 'race-pct');
  private rivalPct = el('span', 'race-pct');
  private youPower = el('span', 'race-power you');
  private rivalPower = el('span', 'race-power rival');
  private rivalLane: HTMLElement;
  readonly assaultButton = el('button', 'assault-btn');
  private nextView: View = 'front';

  constructor() {
    this.settingsButton.setAttribute('aria-label', 'Settings');
    const head = el('div', 'battle-head');
    const title = el('div', 'battle-title');
    title.append(this.mapName, this.dots);
    head.append(title, this.viewButton);

    const lane = (who: string, fill: HTMLElement, pct: HTMLElement, power: HTMLElement) => {
      const row = el('div', 'race-lane');
      const bar = el('div', 'race-bar');
      bar.append(fill);
      row.append(el('span', 'race-who', who), bar, pct, power);
      return row;
    };
    const youLane = lane('You', this.youFill, this.youPct, this.youPower);
    this.rivalLane = lane('Rival', this.rivalFill, this.rivalPct, this.rivalPower);
    this.race.append(head, youLane, this.rivalLane, this.caption);

    const row = el('div', 'res-row');
    row.append(this.resources, this.settingsButton);
    this.root.append(row, this.race);
  }

  /** Put the assault button in its own place in the HUD. */
  mountAssault(parent: HTMLElement): void {
    parent.append(this.assaultButton);
  }

  /** Where the view button goes next. */
  get viewTarget(): View {
    return this.nextView;
  }

  private chip(r: ResourceId): Chip {
    let c = this.chips.get(r);
    if (!c) {
      const root = el('div', 'res-chip');
      root.title = RESOURCE_NAMES[r];
      const amount = el('span', 'amt');
      const rate = el('span', 'rate');
      root.append(el('span', 'ico', ICON[r]), amount, rate);
      c = { root, amount, rate };
      this.chips.set(r, c);
    }
    return c;
  }

  update(state: GameState, view: View): void {
    const shown = discoveredResources(state);
    const rates = netRates(state);
    const chips = shown.map((r) => {
      const c = this.chip(r);
      setText(c.amount, formatNumber(state.resources[r].floor()));
      const rate = rates[r];
      setText(c.rate, rate.eq(0) ? '' : `${rate.gt(0) ? '+' : ''}${formatNumber(rate)}/s`);
      c.rate.classList.toggle('neg', rate.lt(0));
      return c.root;
    });
    if (
      chips.length !== this.resources.children.length ||
      chips.some((c, i) => this.resources.children[i] !== c)
    ) {
      this.resources.replaceChildren(...chips);
    }

    const atBase = isHQ(state.sector);
    setText(
      this.mapName,
      `Map ${state.map} · ${atBase ? 'Rival base' : `Outpost ${state.sector + 1}/${OUTPOSTS_PER_MAP}`}`,
    );
    if (this.dots.children.length !== TARGETS_PER_MAP) {
      this.dots.replaceChildren(
        ...Array.from({ length: TARGETS_PER_MAP }, (_, i) =>
          el('span', i === TARGETS_PER_MAP - 1 ? 'dot hq' : 'dot'),
        ),
      );
    }
    [...this.dots.children].forEach((d, i) => {
      d.classList.toggle('done', i < state.sector);
      d.classList.toggle('now', i === state.sector);
    });

    // The race: how much of each base is built this map, and each army's power.
    const ours = armyPower(state);
    const rival = rivalPower(state);
    const built = rivalBuildFraction(state);
    const mine = playerBuildFraction(state);
    this.youFill.style.width = `${(mine * 100).toFixed(1)}%`;
    this.rivalFill.style.width = `${(built * 100).toFixed(1)}%`;
    setText(this.youPct, `${Math.floor(mine * 100)}%`);
    setText(this.rivalPct, `${Math.floor(built * 100)}%`);
    setText(this.youPower, `⚔ ${formatNumber(ours)}`);
    setText(this.rivalPower, `⚔ ${formatNumber(rival)}`);
    this.race.classList.toggle('ahead', ours.gte(rival));

    const full = rivalIsFull(state);
    this.rivalLane.classList.toggle('full', full);
    const attackIn = Math.max(0, state.rival.nextAttackAt - state.playTime);
    const next = atBase ? '' : `Next outpost ⚔ ${formatNumber(currentEnemyPower(state))} · `;
    setText(
      this.caption,
      full
        ? attackIn > 0
          ? `Rival at full strength · attacks again in ${formatDuration(attackIn)}`
          : 'Rival at full strength · attacking!'
        : next + (mine >= built ? 'You are building faster' : 'The rival is building faster'),
    );

    const preview = assaultPreview(state);
    this.assaultButton.hidden = !preview.reachable;
    if (preview.reachable) {
      this.assaultButton.disabled = preview.regroupIn > 0;
      setText(
        this.assaultButton,
        preview.regroupIn > 0
          ? `Regrouping · ${formatDuration(preview.regroupIn)}`
          : '⚔ Assault the rival base',
      );
      this.assaultButton.classList.toggle('ready', preview.wins && preview.regroupIn === 0);
    }

    const nv = NEXT_VIEW[view];
    this.nextView = nv.to;
    setText(this.viewButton, nv.label);
  }
}
