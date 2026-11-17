import { COMMANDER, TIME_LIMIT, alive, strengthLeft, type Battle, type BattleInput } from '../core';
import { el, setText } from './dom';

const STICK_RADIUS = 56; // px of drag for full speed

/**
 * Battle overlay: strength bars and timer at the top, a drag-anywhere joystick for the commander,
 * the Charge button and Retreat.
 */
export class BattleHud {
  readonly root = el('div', 'battle-hud');
  private oursFill = el('div', 'bh-fill ours');
  private theirsFill = el('div', 'bh-fill theirs');
  private oursCount = el('span', 'bh-count');
  private theirsCount = el('span', 'bh-count');
  private timer = el('div', 'bh-timer');
  private hint = el('div', 'bh-hint', 'Drag anywhere to move your commander');
  private chargeBtn = el('button', 'bh-charge');
  private chargeLabel = el('span', 'bh-charge-label', 'Charge!');
  private retreatBtn = el('button', 'bh-retreat', 'Retreat');
  private stick = el('div', 'bh-stick');
  private knob = el('div', 'bh-knob');
  private origin: { x: number; y: number; id: number } | null = null;
  private vector = { x: 0, z: 0 };
  private chargeQueued = false;
  onRetreat: () => void = () => {};

  constructor(private canvas: HTMLCanvasElement) {
    const top = el('div', 'bh-top');
    const lane = (who: string, fill: HTMLElement, count: HTMLElement) => {
      const row = el('div', 'bh-lane');
      const bar = el('div', 'bh-bar');
      bar.append(fill);
      row.append(el('span', 'bh-who', who), bar, count);
      return row;
    };
    const head = el('div', 'bh-head');
    head.append(el('div', 'bh-title', 'Assault on the rival base'), this.timer, this.retreatBtn);
    top.append(
      head,
      lane('You', this.oursFill, this.oursCount),
      lane('Rival', this.theirsFill, this.theirsCount),
    );
    this.chargeBtn.append(this.chargeLabel);
    this.chargeBtn.setAttribute('aria-label', 'Charge');
    this.stick.append(this.knob);
    this.root.append(top, this.hint, this.stick, this.chargeBtn);
    this.root.hidden = true;

    this.chargeBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.chargeQueued = true;
    });
    this.retreatBtn.addEventListener('click', () => this.onRetreat());

    // Joystick: press anywhere on the battlefield and drag.
    canvas.addEventListener('pointerdown', (e) => {
      if (this.root.hidden) return;
      this.origin = { x: e.clientX, y: e.clientY, id: e.pointerId };
      this.stick.style.left = `${e.clientX}px`;
      this.stick.style.top = `${e.clientY}px`;
      this.stick.classList.add('on');
      this.knob.style.transform = 'translate(-50%, -50%)';
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.origin || e.pointerId !== this.origin.id) return;
      let dx = e.clientX - this.origin.x;
      let dy = e.clientY - this.origin.y;
      const d = Math.hypot(dx, dy);
      if (d > STICK_RADIUS) {
        dx = (dx / d) * STICK_RADIUS;
        dy = (dy / d) * STICK_RADIUS;
      }
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      // Screen up = forward (toward the rival).
      this.vector = { x: dx / STICK_RADIUS, z: -dy / STICK_RADIUS };
      if (d > 8) this.hint.classList.add('done');
    });
    const end = () => {
      this.origin = null;
      this.vector = { x: 0, z: 0 };
      this.stick.classList.remove('on');
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  show(): void {
    this.root.hidden = false;
    this.hint.classList.remove('done');
    this.chargeQueued = false;
  }

  hide(): void {
    this.root.hidden = true;
    this.origin = null;
    this.vector = { x: 0, z: 0 };
    this.stick.classList.remove('on');
  }

  /** Input for the next simulation step (a queued charge is consumed). */
  input(): BattleInput {
    const charge = this.chargeQueued;
    this.chargeQueued = false;
    const moving = this.vector.x !== 0 || this.vector.z !== 0;
    return { move: moving ? { ...this.vector } : null, charge };
  }

  update(b: Battle): void {
    const ours = strengthLeft(b, 'ours');
    const theirs = strengthLeft(b, 'theirs');
    this.oursFill.style.width = `${(Math.sqrt(ours) * 100).toFixed(1)}%`;
    this.theirsFill.style.width = `${(Math.sqrt(theirs) * 100).toFixed(1)}%`;
    setText(this.oursCount, String(alive(b, 'ours')));
    setText(this.theirsCount, String(alive(b, 'theirs')));
    const left = Math.max(0, Math.ceil(TIME_LIMIT - b.time));
    setText(this.timer, `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);

    const ready = b.chargeCooldown <= 0;
    this.chargeBtn.classList.toggle('ready', ready && !b.result);
    this.chargeBtn.classList.toggle('active', b.chargeLeft > 0);
    const cd = ready ? 0 : b.chargeCooldown / COMMANDER.chargeCooldown;
    this.chargeBtn.style.setProperty('--cd', `${(cd * 360).toFixed(0)}deg`);
    setText(
      this.chargeLabel,
      b.chargeLeft > 0 ? 'Charging!' : ready ? 'Charge!' : `${Math.ceil(b.chargeCooldown)}s`,
    );
    if (b.attacking && !b.result) this.hint.classList.add('done');
  }

  /** The canvas, so main can avoid treating joystick drags as taps. */
  get surface(): HTMLCanvasElement {
    return this.canvas;
  }
}
