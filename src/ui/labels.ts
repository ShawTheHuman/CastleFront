import type * as THREE from 'three';
import {
  formatNumber,
  milestoneTier,
  quote,
  unlockRequirement,
  type Decimal,
  type GameState,
} from '../core';
import { ASSETS } from '../data/assets';
import type { World } from '../render/world';
import { el, setText } from './dom';

interface Label {
  root: HTMLElement;
  name: HTMLElement;
  level: HTMLElement;
  badge: HTMLElement;
}

/** HTML labels pinned above buildings, the enemy power badge, and floating "+N" numbers. */
export class Labels {
  readonly root = el('div', 'labels');
  private labels = new Map<string, Label>();
  private enemy = el('div', 'enemy-badge');

  constructor(private world: World) {
    for (const a of ASSETS) {
      const root = el('div', 'tag');
      const name = el('span', 'tag-name', a.name);
      const level = el('span', 'tag-level');
      const badge = el('span', 'tag-up', '▲');
      const row = el('span', 'tag-row');
      row.append(level, badge);
      root.append(name, row);
      this.root.append(root);
      this.labels.set(a.id, { root, name, level, badge });
    }
    this.root.append(this.enemy);
  }

  /** Refresh label text and state (4 Hz). */
  refresh(state: GameState, enemyPower: Decimal): void {
    for (const a of ASSETS) {
      const l = this.labels.get(a.id)!;
      const lvl = state.levels[a.id] ?? 0;
      const req = unlockRequirement(state, a);
      const q = quote(state, a.id, 'x1');
      l.root.classList.toggle('locked', req !== null);
      l.root.classList.toggle('unbuilt', req === null && lvl === 0);
      l.root.classList.toggle('ready', q.affordable);
      const stars = '★'.repeat(Math.min(milestoneTier(lvl), 5));
      setText(l.level, req ? '🔒' : lvl === 0 ? 'Build' : `${stars}${stars ? ' ' : ''}Lv ${lvl}`);
    }
    setText(this.enemy, formatNumber(enemyPower));
  }

  /** Reposition labels (every frame, after the camera moves). */
  place(): void {
    for (const [id, l] of this.labels) this.position(l.root, this.world.anchor(id));
    this.position(this.enemy, this.world.enemyAnchor());
  }

  private position(node: HTMLElement, at: THREE.Vector3): void {
    const p = this.world.project(at);
    node.style.visibility = p.visible ? 'visible' : 'hidden';
    node.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`;
  }

  /** A number that floats up from a building. */
  float(assetId: string, text: string, cls = ''): void {
    const p = this.world.project(this.world.anchor(assetId, 2.4));
    if (!p.visible) return;
    const f = el('div', `float ${cls}`, text);
    f.style.left = `${p.x}px`;
    f.style.top = `${p.y}px`;
    this.root.append(f);
    setTimeout(() => f.remove(), 1400);
  }

  floatAmount(assetId: string, amount: Decimal, icon: string): void {
    if (amount.lte(0)) return;
    this.float(assetId, `+${formatNumber(amount)} ${icon}`);
  }
}
