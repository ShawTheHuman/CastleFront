import {
  buy,
  describeEffect,
  formatDuration,
  formatNumber,
  hasMilestones,
  levelCap,
  milestoneTier,
  netRates,
  nextMilestone,
  quote,
  unlockRequirement,
  type BuyMode,
  type Decimal,
  type GameState,
  type ResourceId,
} from '../core';
import { getAsset } from '../data/assets';
import { BALANCE } from '../data/balance';
import { ICON, el, setText, storageGet, storageSet } from './dom';

const MODES: [BuyMode, string][] = [
  ['x1', '×1'],
  ['x10', '×10'],
  ['milestone', 'Next ★'],
  ['max', 'Max'],
];
const MODE_KEY = 'castlefront.buyMode';

/** Seconds until `cost` is affordable at current net income, or Infinity. */
function timeToAfford(state: GameState, cost: Partial<Record<ResourceId, Decimal>>): number {
  const rates = netRates(state);
  let worst = 0;
  for (const [r, amt] of Object.entries(cost) as [ResourceId, Decimal][]) {
    const missing = amt.sub(state.resources[r]);
    if (missing.lte(0)) continue;
    if (rates[r].lte(0)) return Infinity;
    worst = Math.max(worst, missing.div(rates[r]).toNumber());
  }
  return worst;
}

/** Bottom sheet for one building: stats now → next, milestone progress and the buy button. */
export class BuildingSheet {
  readonly root = el('div', 'sheet');
  private backdrop = el('div', 'sheet-backdrop');
  private title = el('h2', 'sheet-title');
  private level = el('div', 'sheet-level');
  private desc = el('p', 'sheet-desc');
  private milestone = el('div', 'milestone');
  private milestoneText = el('div', 'milestone-text');
  private milestoneFill = el('div', 'milestone-fill');
  private stats = el('div', 'stats');
  private note = el('div', 'sheet-note');
  private modes = el('div', 'modes');
  private buyBtn = el('button', 'buy-btn');
  private buyLabel = el('span', 'buy-label');
  private buyCost = el('span', 'buy-cost');
  private eta = el('div', 'eta');
  private assetId: string | null = null;
  private mode: BuyMode = (storageGet(MODE_KEY) as BuyMode | null) ?? 'x1';
  private holdTimer = 0;
  private repeatTimer = 0;

  constructor(
    private state: () => GameState,
    private onBuy: (assetId: string, levels: number) => void,
  ) {
    if (!MODES.some(([m]) => m === this.mode)) this.mode = 'x1';
    const head = el('div', 'sheet-head');
    const close = el('button', 'icon-btn close', '✕');
    close.setAttribute('aria-label', 'Close');
    close.onclick = () => this.close();
    head.append(this.title, this.level, close);

    const bar = el('div', 'milestone-bar');
    bar.append(this.milestoneFill);
    this.milestone.append(this.milestoneText, bar);

    for (const [mode, label] of MODES) {
      const b = el('button', 'mode', label);
      b.dataset.mode = mode;
      b.onclick = () => {
        this.mode = mode;
        storageSet(MODE_KEY, mode);
        this.update();
      };
      this.modes.append(b);
    }

    this.buyBtn.append(this.buyLabel, this.buyCost);
    this.buyBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.purchase();
      // Hold to keep buying.
      this.holdTimer = window.setTimeout(() => {
        this.repeatTimer = window.setInterval(() => this.purchase(), 90);
      }, 400);
    });
    const stop = () => {
      clearTimeout(this.holdTimer);
      clearInterval(this.repeatTimer);
    };
    this.buyBtn.addEventListener('pointerup', stop);
    this.buyBtn.addEventListener('pointerleave', stop);
    this.buyBtn.addEventListener('pointercancel', stop);
    this.buyBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.purchase();
      }
    });

    this.root.append(
      head,
      this.desc,
      this.milestone,
      this.stats,
      this.note,
      this.modes,
      this.buyBtn,
      this.eta,
    );
    this.backdrop.onclick = () => this.close();
    this.root.setAttribute('role', 'dialog');
  }

  mount(parent: HTMLElement): void {
    parent.append(this.backdrop, this.root);
  }

  get openId(): string | null {
    return this.assetId;
  }

  open(assetId: string): void {
    this.assetId = assetId;
    this.root.classList.add('open');
    this.backdrop.classList.add('open');
    this.update();
  }

  close(): void {
    this.assetId = null;
    this.root.classList.remove('open');
    this.backdrop.classList.remove('open');
    clearTimeout(this.holdTimer);
    clearInterval(this.repeatTimer);
  }

  private purchase(): void {
    if (!this.assetId) return;
    const gained = buy(this.state(), this.assetId, this.mode);
    if (gained > 0) this.onBuy(this.assetId, gained);
    else {
      clearInterval(this.repeatTimer);
      this.buyBtn.classList.remove('shake');
      void this.buyBtn.offsetWidth;
      this.buyBtn.classList.add('shake');
    }
    this.update();
  }

  update(): void {
    if (!this.assetId) return;
    const s = this.state();
    const asset = getAsset(this.assetId);
    const lvl = s.levels[asset.id] ?? 0;
    const cap = levelCap(s.map);
    const req = unlockRequirement(s, asset);
    const q = quote(s, asset.id, this.mode);

    setText(this.title, asset.name);
    setText(this.level, req ? 'Locked' : lvl === 0 ? 'Not built' : `Lv ${lvl} / ${cap}`);
    setText(this.desc, asset.description);

    const showMilestone = hasMilestones(asset) && !req;
    this.milestone.hidden = !showMilestone;
    if (showMilestone) {
      const next = nextMilestone(lvl);
      const into = lvl - (next.level - BALANCE.milestoneEvery);
      setText(
        this.milestoneText,
        `${'★'.repeat(Math.min(milestoneTier(lvl), 8)) || '☆'}  Next ★ at Lv ${next.level}: output ×${next.mult}`,
      );
      this.milestoneFill.style.width = `${(into / BALANCE.milestoneEvery) * 100}%`;
    }

    const add = q.levels > 0 ? q.levels : 1;
    const lines = describeEffect(s, asset.id, add);
    this.stats.replaceChildren(
      ...lines.map((l) => {
        const row = el('div', 'stat');
        const next = el('span', 'next', l.next);
        row.append(
          el('span', 'label', l.label),
          el('span', 'now', l.now),
          el('span', 'arrow', '→'),
          next,
        );
        if (q.blocked === 'capped') {
          next.hidden = true;
          row.querySelector('.arrow')!.remove();
        }
        return row;
      }),
    );

    this.modes.hidden = !!req || q.blocked === 'capped';
    for (const b of this.modes.children as HTMLCollectionOf<HTMLElement>) {
      b.classList.toggle('on', b.dataset.mode === this.mode);
    }

    let note = '';
    if (req) note = `🔒 ${req} to unlock.`;
    else if (q.blocked === 'capped')
      note = `Level cap ${cap} reached. Conquer Map ${s.map} to raise it to ${levelCap(s.map + 1)}.`;
    setText(this.note, note);
    this.note.hidden = !note;

    this.buyBtn.hidden = !!req || q.blocked === 'capped';
    this.buyBtn.disabled = !q.affordable;
    setText(this.buyLabel, lvl === 0 ? 'Build' : `Upgrade +${q.levels}`);
    this.buyCost.replaceChildren(
      ...(Object.entries(q.cost) as [ResourceId, Decimal][]).map(([r, amt]) => {
        const c = el('span', 'cost', `${ICON[r]} ${formatNumber(amt)}`);
        c.classList.toggle('short', s.resources[r].lt(amt));
        return c;
      }),
    );

    const wait = q.affordable || req || q.blocked === 'capped' ? 0 : timeToAfford(s, q.cost);
    setText(
      this.eta,
      wait > 0
        ? Number.isFinite(wait)
          ? `Ready in ${formatDuration(wait)}`
          : 'Build up income to afford this'
        : '',
    );
  }
}
