import {
  armyPower,
  currentEnemyPower,
  discoveredResources,
  formatNumber,
  isHQ,
  levelCap,
  netRates,
  RESOURCE_NAMES,
  type GameState,
  type ResourceId,
} from '../core';
import { TARGETS_PER_MAP } from '../data/balance';
import { ICON, el, setText } from './dom';

interface Chip {
  root: HTMLElement;
  amount: HTMLElement;
  rate: HTMLElement;
}

/** Resource bar plus the battle status strip at the top of the screen. */
export class TopHud {
  readonly root = el('div', 'top-hud');
  private resources = el('div', 'res-bar');
  private chips = new Map<ResourceId, Chip>();
  private mapName = el('div', 'map-name');
  private dots = el('div', 'dots');
  private power = el('div', 'power');
  private meterFill = el('div', 'meter-fill');
  readonly viewButton = el('button', 'view-btn', 'Battle ▲');
  readonly settingsButton = el('button', 'icon-btn', '⚙');

  constructor() {
    const battle = el('div', 'battle-bar');
    const info = el('div', 'battle-info');
    const meter = el('div', 'meter');
    meter.append(this.meterFill);
    info.append(this.mapName, this.dots, this.power, meter);
    this.settingsButton.setAttribute('aria-label', 'Settings');
    battle.append(info, this.viewButton);
    const row = el('div', 'res-row');
    row.append(this.resources, this.settingsButton);
    this.root.append(row, battle);
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

  update(state: GameState): void {
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

    const target = isHQ(state.sector) ? 'Enemy HQ' : `Sector ${state.sector + 1}`;
    setText(this.mapName, `Map ${state.map} · ${target}`);
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

    const ours = armyPower(state);
    const theirs = currentEnemyPower(state);
    setText(this.power, `⚔ ${formatNumber(ours)} / ${formatNumber(theirs)}`);
    const ratio = Math.min(1, ours.div(theirs).toNumber());
    this.meterFill.style.width = `${(ratio * 100).toFixed(1)}%`;
    this.root.title = `Level cap ${levelCap(state.map)}`;
  }

  setView(battle: boolean): void {
    setText(this.viewButton, battle ? 'Base ▼' : 'Battle ▲');
  }
}
