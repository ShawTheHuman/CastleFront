import type { Decimal } from './bignum';
import { levelOutput } from './formulas';
import { ASSETS } from '../data/assets';
import { BALANCE } from '../data/balance';

/**
 * Real-time battle simulation (pure, deterministic for a given seed).
 *
 * Battle space: x across the road (−HALF_WIDTH..HALF_WIDTH), z from our wall (0) toward the
 * enemy (positive). Each side's army power P becomes a set of units whose total hit points and
 * total damage per second are both proportional to √P. In a Lanchester-style fight a side's
 * fighting strength is roughly HP × DPS, i.e. ∝ P, so the stronger army usually wins, while
 * positioning, the commander's aura and well-timed charges can swing a close fight.
 */

export const HALF_WIDTH = 6;
export const FIELD_LENGTH = 24;

export type UnitKind = 'infantry' | 'tank' | 'artillery';
export type Team = 'ours' | 'theirs';

interface KindStats {
  /** Relative number of units per unit of power share. */
  count: number;
  range: number;
  speed: number;
  /** Seconds between shots. */
  reload: number;
  /** Radius of splash damage (0 = none). Splash hits others for half damage. */
  splash: number;
}

export const KINDS: Record<UnitKind, KindStats> = {
  infantry: { count: 1, range: 4.5, speed: 2.2, reload: 0.9, splash: 0 },
  tank: { count: 0.22, range: 6, speed: 1.6, reload: 1.6, splash: 0 },
  artillery: { count: 0.3, range: 7.5, speed: 1.1, reload: 2.6, splash: 1.6 },
};

/** Which unit kind each army building fields. The commander multiplies everything. */
const KIND_OF: Record<string, UnitKind> = {
  barracks: 'infantry',
  range: 'infantry',
  tankFactory: 'tank',
  artillery: 'artillery',
  airfield: 'artillery',
};

export interface Unit {
  id: number;
  team: Team;
  kind: UnitKind;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  dps: number;
  cooldown: number;
  /** Seconds since death (−1 while alive). Used by the renderer to animate falls. */
  deadFor: number;
  /** Slot in the formation around the commander. */
  fx: number;
  fz: number;
}

export interface Shot {
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  team: Team;
  kind: UnitKind;
  age: number;
}

export type BattleMode = 'assault' | 'skirmish';

export interface BattleConfig {
  ours: Decimal;
  theirs: Decimal;
  /** Share of power per unit kind, from building levels (see compositionOf). */
  ourMix: Record<UnitKind, number>;
  theirMix: Record<UnitKind, number>;
  seed: number;
  mode: BattleMode;
  /** Length of the field (default FIELD_LENGTH); skirmishes use a shorter one. */
  field?: number;
  /**
   * Skirmishes are replays of a result already decided by power: the loser's damage is scaled
   * down so the decided winner wins on screen.
   */
  forcedWinner?: Team;
}

export interface BattleInput {
  /** Desired commander velocity direction (unit length or less), or null to stand still. */
  move: { x: number; z: number } | null;
  /** Charge was pressed this frame. */
  charge: boolean;
}

export const COMMANDER = {
  speed: 4,
  auraRadius: 6,
  auraBonus: 0.1,
  chargeBonus: 0.25,
  chargeSpeed: 1.5,
  chargeSeconds: 5,
  chargeCooldown: 15,
  /** With no input for this long, the army advances by itself (without the charge boost). */
  autoChargeAfter: 4,
};

/** Distance at which the base's defenders leave their positions to meet the attack. */
const ENGAGE_DISTANCE = 9;

/** Seconds a battle may last; then the side with more fighting strength left wins. */
export const TIME_LIMIT = 90;
/** Target length of an even fight, in seconds. */
const EVEN_FIGHT_SECONDS = 22;
const MAX_UNITS_PER_SIDE = 70;
const MIN_UNITS_PER_SIDE = 6;

export interface Battle {
  config: BattleConfig;
  units: Unit[];
  shots: Shot[];
  time: number;
  commander: { x: number; z: number };
  /** Our troops attack (true) or follow the commander (false). */
  attacking: boolean;
  chargeLeft: number;
  chargeCooldown: number;
  idleFor: number;
  /** The armies have met: defenders leave their positions. */
  engaged: boolean;
  result: 'win' | 'lose' | null;
  /** Fighting strength at the start, per team, to report what is left. */
  startStrength: Record<Team, number>;
  rand: () => number;
}

/** Share of army power per unit kind, from building levels. */
export function compositionOf(levels: Readonly<Record<string, number>>): Record<UnitKind, number> {
  const mix: Record<UnitKind, number> = { infantry: 0, tank: 0, artillery: 0 };
  for (const a of ASSETS) {
    const kind = KIND_OF[a.id];
    const lvl = levels[a.id] ?? 0;
    if (!kind || lvl <= 0 || a.effect.kind !== 'power') continue;
    mix[kind] += levelOutput(a.effect.base, lvl).toNumber() || Number.MAX_VALUE;
  }
  // Very large numbers: compare relative to the biggest share.
  const total = mix.infantry + mix.tank + mix.artillery;
  if (!Number.isFinite(total) || total <= 0) return { infantry: 1, tank: 0, artillery: 0 };
  return {
    infantry: mix.infantry / total,
    tank: mix.tank / total,
    artillery: mix.artillery / total,
  };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Power of `a` relative to `b`, safe for huge numbers. */
function ratio(a: Decimal, b: Decimal): number {
  if (b.lte(0)) return Infinity;
  const r = a.div(b).toNumber();
  return Number.isFinite(r) ? r : Infinity;
}

function spawn(
  b: Battle,
  team: Team,
  relPower: number,
  relCount: number,
  mix: Record<UnitKind, number>,
  damageScale: number,
): void {
  const total = Math.round(
    Math.min(
      MAX_UNITS_PER_SIDE,
      Math.max(MIN_UNITS_PER_SIDE, MAX_UNITS_PER_SIDE * Math.sqrt(relCount)),
    ),
  );
  // Units per kind, by power share and how many bodies a kind fields per share.
  const weights = (Object.keys(KINDS) as UnitKind[]).map((k) => mix[k] * KINDS[k].count);
  const wsum = weights.reduce((s, w) => s + w, 0) || 1;
  const counts = weights.map((w) => (w > 0 ? Math.max(1, Math.round((total * w) / wsum)) : 0));
  const hpTotal = Math.sqrt(relPower) * EVEN_FIGHT_SECONDS;
  const dpsTotal = Math.sqrt(relPower) * damageScale;
  const dir = team === 'ours' ? 1 : -1;
  const field = b.config.field ?? FIELD_LENGTH;
  const ourStart = b.config.mode === 'skirmish' ? 2 : 5;
  const baseZ = team === 'ours' ? ourStart : field - 4;
  (Object.keys(KINDS) as UnitKind[]).forEach((kind, ki) => {
    const n = counts[ki] ?? 0;
    if (n === 0) return;
    const share = mix[kind];
    // Rows: artillery at the back, tanks in front of it, infantry at the front.
    const rowOffset = kind === 'infantry' ? 2 : kind === 'tank' ? 0 : -2.5;
    const cols = Math.min(12, Math.ceil(Math.sqrt(n * 3)));
    for (let i = 0; i < n; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const fx = (col - (cols - 1) / 2) * (kind === 'tank' ? 1.5 : 0.9);
      const fz = dir * (rowOffset - row * (kind === 'tank' ? 1.4 : 0.9));
      const hp = (hpTotal * share) / n;
      b.units.push({
        id: b.units.length,
        team,
        kind,
        x: fx + (b.rand() - 0.5) * 0.3,
        z: baseZ + fz + (b.rand() - 0.5) * 0.3,
        hp,
        maxHp: hp,
        dps: (dpsTotal * share) / n,
        cooldown: b.rand() * KINDS[kind].reload,
        deadFor: -1,
        fx,
        fz: fz - dir * 3,
      });
    }
  });
}

export function createBattle(config: BattleConfig): Battle {
  const b: Battle = {
    config,
    units: [],
    shots: [],
    time: 0,
    commander: { x: 0, z: 2 },
    attacking: config.mode === 'skirmish',
    chargeLeft: 0,
    chargeCooldown: 0,
    idleFor: 0,
    engaged: config.mode === 'skirmish',
    result: null,
    startStrength: { ours: 0, theirs: 0 },
    rand: mulberry32(config.seed),
  };
  // Normalise to the stronger side so huge numbers stay in float range.
  const r = ratio(config.ours, config.theirs);
  const ourRel = r >= 1 ? 1 : r;
  const theirRel = r >= 1 ? (Number.isFinite(r) ? 1 / r : 0) : 1;
  const loserScale = 0.45;
  spawn(
    b,
    'ours',
    ourRel,
    ourRel,
    config.ourMix,
    config.forcedWinner === 'theirs' ? loserScale : 1,
  );
  const fort = config.mode === 'assault' ? BALANCE.assaultFortification : 1;
  spawn(
    b,
    'theirs',
    theirRel,
    theirRel,
    config.theirMix,
    (config.forcedWinner === 'ours' ? loserScale : 1) * fort,
  );
  b.startStrength = { ours: strength(b, 'ours'), theirs: strength(b, 'theirs') };
  return b;
}

/** Remaining fighting strength: total HP × total DPS of the living units. */
export function strength(b: Battle, team: Team): number {
  let hp = 0;
  let dps = 0;
  for (const u of b.units) {
    if (u.team !== team || u.deadFor >= 0) continue;
    hp += u.hp;
    dps += u.dps;
  }
  return hp * dps;
}

/** Fraction (0..1) of a team's starting strength still standing. */
export function strengthLeft(b: Battle, team: Team): number {
  return b.startStrength[team] > 0 ? strength(b, team) / b.startStrength[team] : 0;
}

export function alive(b: Battle, team: Team): number {
  let n = 0;
  for (const u of b.units) if (u.team === team && u.deadFor < 0) n++;
  return n;
}

function nearestEnemy(b: Battle, u: Unit): Unit | null {
  let best: Unit | null = null;
  let bestD = Infinity;
  for (const o of b.units) {
    if (o.team === u.team || o.deadFor >= 0) continue;
    const d = (o.x - u.x) ** 2 + (o.z - u.z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

function damage(target: Unit, amount: number): void {
  target.hp -= amount;
  if (target.hp <= 0 && target.deadFor < 0) {
    target.hp = 0;
    target.deadFor = 0;
  }
}

/** Advance the battle by `dt` seconds (call with small steps, e.g. 1/30 s). */
export function stepBattle(
  b: Battle,
  dt: number,
  input: BattleInput = { move: null, charge: false },
): void {
  if (b.result) {
    for (const u of b.units) if (u.deadFor >= 0) u.deadFor += dt;
    ageShots(b, dt);
    return;
  }
  b.time += dt;

  // Commander and charge.
  const c = b.commander;
  if (b.config.mode === 'assault') {
    if (input.move && (input.move.x !== 0 || input.move.z !== 0)) {
      c.x = clamp(c.x + input.move.x * COMMANDER.speed * dt, -HALF_WIDTH, HALF_WIDTH);
      c.z = clamp(c.z + input.move.z * COMMANDER.speed * dt, 0, FIELD_LENGTH);
      b.idleFor = 0;
    } else {
      b.idleFor += dt;
    }
    if (input.charge) b.idleFor = 0;
    // Left alone, the army advances by itself, but only a commanded charge gives the boost.
    if (!b.attacking && b.idleFor >= COMMANDER.autoChargeAfter) b.attacking = true;
    if (input.charge && b.chargeCooldown <= 0) {
      b.attacking = true;
      b.chargeLeft = COMMANDER.chargeSeconds;
      b.chargeCooldown = COMMANDER.chargeCooldown;
    }
  }
  b.chargeLeft = Math.max(0, b.chargeLeft - dt);
  b.chargeCooldown = Math.max(0, b.chargeCooldown - dt);
  const charging = b.chargeLeft > 0;

  // Movement.
  const living = b.units.filter((u) => u.deadFor < 0);
  if (!b.engaged) {
    let gap = Infinity;
    for (const u of living) {
      if (u.team !== 'ours') continue;
      for (const o of living)
        if (o.team === 'theirs') gap = Math.min(gap, Math.hypot(o.x - u.x, o.z - u.z));
    }
    if (gap < ENGAGE_DISTANCE) b.engaged = true;
  }
  for (const u of living) {
    const k = KINDS[u.kind];
    const enemy = nearestEnemy(b, u);
    let tx = u.x;
    let tz = u.z;
    let speed = k.speed;
    if (u.team === 'ours' && !b.attacking) {
      // Follow the commander in formation.
      tx = c.x + u.fx * 0.8;
      tz = c.z + u.fz * 0.8;
      speed *= 1.3;
    } else if (enemy) {
      const d = Math.hypot(enemy.x - u.x, enemy.z - u.z);
      // The base's defenders are dug in: they hold position until the attack reaches them,
      // then the whole garrison engages at once.
      const holds = u.team === 'theirs' && b.config.mode === 'assault' && !b.engaged;
      if (d > k.range * 0.9 && !holds) {
        tx = enemy.x;
        tz = enemy.z;
      }
    }
    if (u.team === 'ours' && charging) speed *= COMMANDER.chargeSpeed;
    const dx = tx - u.x;
    const dz = tz - u.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.05) {
      const step = Math.min(dist, speed * dt);
      u.x += (dx / dist) * step;
      u.z += (dz / dist) * step;
    }
  }
  // Keep units apart (cheap pairwise push; at most ~140 units).
  for (let i = 0; i < living.length; i++) {
    const a = living[i]!;
    for (let j = i + 1; j < living.length; j++) {
      const o = living[j]!;
      const dx = o.x - a.x;
      const dz = o.z - a.z;
      const min = a.kind === 'tank' || o.kind === 'tank' ? 1.2 : 0.7;
      const d2 = dx * dx + dz * dz;
      if (d2 > 0 && d2 < min * min) {
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        a.x -= (dx / d) * push;
        a.z -= (dz / d) * push;
        o.x += (dx / d) * push;
        o.z += (dz / d) * push;
      }
    }
    a.x = clamp(a.x, -HALF_WIDTH, HALF_WIDTH);
    a.z = clamp(a.z, -2, (b.config.field ?? FIELD_LENGTH) + 2);
  }

  // Shooting.
  for (const u of living) {
    if (u.deadFor >= 0) continue;
    u.cooldown -= dt;
    if (u.cooldown > 0) continue;
    const k = KINDS[u.kind];
    const enemy = nearestEnemy(b, u);
    if (!enemy) continue;
    const d = Math.hypot(enemy.x - u.x, enemy.z - u.z);
    if (d > k.range) continue;
    u.cooldown = k.reload * (0.9 + b.rand() * 0.2);
    let mult = 1;
    if (u.team === 'ours') {
      if (charging) mult += COMMANDER.chargeBonus;
      if (b.config.mode === 'assault' && Math.hypot(u.x - c.x, u.z - c.z) <= COMMANDER.auraRadius) {
        mult += COMMANDER.auraBonus;
      }
    }
    const hit = u.dps * k.reload * mult;
    // Being shot at brings the defenders out too.
    if (u.team === 'ours') b.engaged = true;
    damage(enemy, hit);
    if (k.splash > 0) {
      for (const o of living) {
        if (o.team === u.team || o === enemy || o.deadFor >= 0) continue;
        if (Math.hypot(o.x - enemy.x, o.z - enemy.z) <= k.splash) damage(o, hit * 0.5);
      }
    }
    b.shots.push({
      fromX: u.x,
      fromZ: u.z,
      toX: enemy.x,
      toZ: enemy.z,
      team: u.team,
      kind: u.kind,
      age: 0,
    });
  }

  for (const u of b.units) if (u.deadFor >= 0) u.deadFor += dt;
  ageShots(b, dt);

  // Result.
  const ours = alive(b, 'ours');
  const theirs = alive(b, 'theirs');
  if (theirs === 0) b.result = 'win';
  else if (ours === 0) b.result = 'lose';
  else if (b.time >= TIME_LIMIT) {
    b.result = strengthLeft(b, 'ours') >= strengthLeft(b, 'theirs') ? 'win' : 'lose';
  }
}

function ageShots(b: Battle, dt: number): void {
  for (const s of b.shots) s.age += dt;
  if (b.shots.length) b.shots = b.shots.filter((s) => s.age < 0.15);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export type Odds = 'likely' | 'close' | 'unlikely';

/**
 * Rough odds of winning an assault, from the power ratio. Measured with the battle sim: with no
 * input the attacker needs about even strength; commanding well (charging at contact, keeping the
 * commander at the front) is worth roughly 15% power.
 */
export function assaultOdds(ours: Decimal, theirs: Decimal): Odds {
  const r = ratio(ours, theirs);
  return r >= 1.05 ? 'likely' : r >= 0.85 ? 'close' : 'unlikely';
}

/** Run a battle to the end with no player input (used by tests and for quick resolution). */
export function runBattle(config: BattleConfig, dt = 1 / 20): Battle {
  const b = createBattle(config);
  while (!b.result) stepBattle(b, dt);
  return b;
}
