import type * as THREE from 'three';
import {
  formatNumber,
  milestoneTier,
  quote,
  rivalHasAsset,
  unlockRequirement,
  type Decimal,
  type GameState,
} from '../core';
import { ASSETS } from '../data/assets';
import type { Side } from '../render/models';
import type { World } from '../render/world';
import { el, setText } from './dom';

/** Approximate height of a building label (name + level), for hiding labels under the HUD. */
const LABEL_HEIGHT = 44;

interface Label {
  root: HTMLElement;
  level: HTMLElement;
}

/**
 * HTML labels pinned above both bases' buildings, the badge over the enemy formation, and
 * floating "+N" numbers.
 */
export class Labels {
  readonly root = el('div', 'labels');
  private ours = new Map<string, Label>();
  private rival = new Map<string, Label>();
  private rivalSeen = new Map<string, number>();
  private enemy = el('div', 'enemy-badge');

  constructor(private world: World) {
    for (const a of ASSETS) {
      this.ours.set(a.id, this.make(a.name, 'tag'));
      this.rival.set(a.id, this.make(a.name, 'tag rival'));
    }
    this.root.append(this.enemy);
  }

  private make(name: string, cls: string): Label {
    const root = el('div', cls);
    const level = el('span', 'tag-level');
    const row = el('span', 'tag-row');
    row.append(level, el('span', 'tag-up', '▲'));
    root.append(el('span', 'tag-name', name), row);
    this.root.append(root);
    return { root, level };
  }

  /** Refresh label text and state (4 Hz). */
  refresh(state: GameState, enemyPower: Decimal, atBase: boolean): void {
    for (const a of ASSETS) {
      const l = this.ours.get(a.id)!;
      const lvl = state.levels[a.id] ?? 0;
      const req = unlockRequirement(state, a);
      l.root.classList.toggle('locked', req !== null);
      l.root.classList.toggle('unbuilt', req === null && lvl === 0);
      l.root.classList.toggle('ready', quote(state, a.id, 'x1').affordable);
      setText(l.level, req ? '🔒' : lvl === 0 ? 'Build' : levelText(lvl));

      const r = this.rival.get(a.id)!;
      const rl = state.rival.levels[a.id] ?? 0;
      const has = rivalHasAsset(state.map, a.id);
      r.root.hidden = !has;
      r.root.classList.toggle('unbuilt', rl === 0);
      setText(r.level, rl === 0 ? '—' : levelText(rl));
      const seen = this.rivalSeen.get(a.id);
      if (seen !== undefined && rl > seen) this.float('rival', a.id, `Lv +${rl - seen}`, 'rival');
      this.rivalSeen.set(a.id, rl);
    }
    this.enemy.classList.toggle('base', atBase);
    setText(this.enemy, formatNumber(enemyPower));
  }

  /** Forget the rival's last-seen levels (new map), so its new base doesn't spray "+N". */
  resetRival(): void {
    this.rivalSeen.clear();
  }

  /**
   * Reposition labels (every frame, after the camera moves). Labels that would sit under the top
   * HUD (above `hudBottom` px) are hidden rather than showing through it.
   */
  place(hudBottom = 0): void {
    this.hudBottom = hudBottom;
    for (const [id, l] of this.ours) this.position(l.root, this.world.anchor('ours', id));
    for (const [id, l] of this.rival) this.position(l.root, this.world.anchor('rival', id));
    this.position(this.enemy, this.world.enemyAnchor());
  }

  private hudBottom = 0;

  private position(node: HTMLElement, at: THREE.Vector3): void {
    const p = this.world.project(at);
    node.style.visibility = p.visible && p.y - LABEL_HEIGHT > this.hudBottom ? 'visible' : 'hidden';
    node.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`;
  }

  /** A number that floats up from a building. */
  float(side: Side, assetId: string, text: string, cls = ''): void {
    const p = this.world.project(this.world.anchor(side, assetId, 2.4));
    if (!p.visible) return;
    const f = el('div', `float ${cls}`, text);
    f.style.left = `${p.x}px`;
    f.style.top = `${p.y}px`;
    this.root.append(f);
    setTimeout(() => f.remove(), 1400);
  }

  floatAmount(assetId: string, amount: Decimal, icon: string): void {
    if (amount.lte(0)) return;
    this.float('ours', assetId, `+${formatNumber(amount)} ${icon}`);
  }
}

function levelText(lvl: number): string {
  const stars = '★'.repeat(Math.min(milestoneTier(lvl), 5));
  return `${stars}${stars ? ' ' : ''}Lv ${lvl}`;
}
