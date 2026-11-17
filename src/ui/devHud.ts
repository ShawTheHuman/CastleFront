import {
  RESOURCE_IDS,
  armyPower,
  buy,
  currentEnemyPower,
  formatNumber,
  isHQ,
  isUnlocked,
  levelCap,
  netRates,
  quote,
  type BuyMode,
  type GameState,
  type Line,
  type ResourceId,
} from '../core';
import { ASSETS } from '../data/assets';
import { TARGETS_PER_MAP } from '../data/balance';

const ICON: Record<ResourceId, string> = {
  gold: '🪙',
  food: '🌾',
  ore: '🪨',
  steel: '🔩',
  crude: '🛢️',
  fuel: '⛽',
};

const MODES: [BuyMode, string][] = [
  ['x1', '×1'],
  ['x10', '×10'],
  ['milestone', 'Next ★'],
  ['max', 'Max'],
];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function costText(cost: Partial<Record<ResourceId, { toString(): string }>>): string {
  return (Object.entries(cost) as [ResourceId, never][])
    .map(([r, v]) => `${ICON[r]}${formatNumber(v)}`)
    .join(' ');
}

interface Row {
  id: string;
  root: HTMLElement;
  meta: HTMLElement;
  button: HTMLButtonElement;
}

/**
 * Developer HUD for phase 1: resources, power vs. the next target, and upgrade lists. Deliberately
 * plain; phase 2 replaces it with the real base screen.
 */
export class DevHud {
  private top = el('div');
  private resources = el('div', 'bar');
  private battle = el('div', 'bar battle');
  private list = el('div', 'list');
  private rows: Row[] = [];
  private tab: Line = 'back';
  private mode: BuyMode = 'x1';

  constructor(
    root: HTMLElement,
    private state: () => GameState,
  ) {
    this.top.append(this.resources, this.battle);
    const panel = el('div', 'panel');
    const tabs = el('div', 'tabs');
    const modes = el('div', 'modes');
    const tabButtons = (['back', 'front'] as Line[]).map((line) => {
      const b = el('button', '', line === 'back' ? 'Back line' : 'Front line');
      b.onclick = () => {
        this.tab = line;
        tabButtons.forEach((x) => x.classList.toggle('on', x === b));
        this.buildRows();
      };
      return b;
    });
    tabButtons[0]?.classList.add('on');
    tabs.append(...tabButtons);
    const modeButtons = MODES.map(([mode, label]) => {
      const b = el('button', mode === this.mode ? 'on' : '', label);
      b.onclick = () => {
        this.mode = mode;
        modeButtons.forEach((x) => x.classList.toggle('on', x === b));
        this.update();
      };
      return b;
    });
    modes.append(...modeButtons);
    panel.append(tabs, modes, this.list);
    root.append(this.top, panel);
    this.buildRows();
  }

  private buildRows(): void {
    this.list.replaceChildren();
    this.rows = ASSETS.filter((a) => a.line === this.tab).map((a) => {
      const root = el('div', 'asset');
      const name = el('div', 'name', a.name);
      const button = el('button');
      const meta = el('div', 'meta');
      button.onclick = () => {
        buy(this.state(), a.id, this.mode);
        this.update();
      };
      root.append(name, button, meta);
      this.list.append(root);
      return { id: a.id, root, meta, button };
    });
    this.update();
  }

  update(): void {
    const s = this.state();
    const rates = netRates(s);
    this.resources.replaceChildren(
      ...RESOURCE_IDS.filter((r) => s.resources[r].gt(0) || rates[r].gt(0)).map((r) => {
        const c = el('span', 'chip', `${ICON[r]} ${formatNumber(s.resources[r])} `);
        c.append(el('small', '', `${rates[r].gte(0) ? '+' : ''}${formatNumber(rates[r])}/s`));
        return c;
      }),
    );

    const ours = armyPower(s);
    const theirs = currentEnemyPower(s);
    const target = isHQ(s.sector) ? 'HQ' : `Sector ${s.sector + 1}/${TARGETS_PER_MAP - 1}`;
    const vs = el('span', `chip vs ${ours.gte(theirs) ? 'ok' : 'bad'}`);
    vs.textContent = `⚔️ ${formatNumber(ours)} vs ${formatNumber(theirs)}`;
    this.battle.replaceChildren(
      el('span', 'chip', `Map ${s.map} · ${target} · cap ${levelCap(s.map)}`),
      vs,
    );

    for (const row of this.rows) {
      const asset = ASSETS.find((a) => a.id === row.id)!;
      const lvl = s.levels[row.id] ?? 0;
      const q = quote(s, row.id, this.mode);
      row.root.style.opacity = isUnlocked(s, asset) ? '1' : '0.5';
      row.meta.textContent = `Lv ${lvl} · ${asset.description}`;
      row.button.disabled = !q.affordable;
      row.button.textContent =
        q.blocked === 'locked'
          ? '🔒 Locked'
          : q.blocked === 'capped'
            ? 'MAX'
            : `+${q.levels} ${costText(q.cost)}`;
    }
  }

  toast(text: string, ms = 2500): void {
    const t = el('div', 'toast', text);
    document.body.append(t);
    setTimeout(() => (t.style.opacity = '0'), ms);
    setTimeout(() => t.remove(), ms + 500);
  }
}
