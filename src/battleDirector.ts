import * as THREE from 'three';
import {
  COMMANDER,
  armyPower,
  compositionOf,
  createBattle,
  outpostPower,
  rivalPower,
  stepBattle,
  type Battle,
  type GameState,
} from './core';
import { BattleView } from './render/battleView';
import type { World } from './render/world';
import type { BattleHud } from './ui/battleHud';

const STEP = 1 / 30;
/** Seconds the result stays on screen before the battle is closed. */
const LINGER = { assault: 1.8, skirmish: 2.5 };
const SKIRMISH_FIELD = 12;

interface Running {
  battle: Battle;
  kind: 'assault' | 'skirmish';
  acc: number;
  doneFor: number;
  toWorld: (x: number, z: number) => THREE.Vector3;
  /** Map/target the battle belongs to: if the game moves on (e.g. the rival's attack is
   * repelled mid-fight), the battle is dropped. */
  map: number;
  sector: number;
}

/**
 * Runs battles on the battlefield: the assault on the rival base (played by the player) and short
 * skirmishes that show outposts falling (their outcome was already decided by army power).
 */
export class BattleDirector {
  private view: BattleView;
  private running: Running | null = null;
  /** Called when an assault ends: true = victory. */
  onAssaultEnd: (won: boolean) => void = () => {};

  constructor(
    private world: World,
    private hud: BattleHud,
  ) {
    this.view = new BattleView(world.scene);
  }

  get assaultActive(): boolean {
    return this.running?.kind === 'assault';
  }

  get active(): boolean {
    return this.running !== null;
  }

  startAssault(state: GameState): void {
    const wallZ = this.world.ourWallZ - 0.5;
    this.begin(state, 'assault', (x, z) => new THREE.Vector3(x, 0, wallZ - z), {
      ours: armyPower(state),
      theirs: rivalPower(state),
      theirMix: compositionOf(state.rival.levels),
    });
    this.hud.show();
  }

  /** Replay the fall of outpost `index` (already taken) where it stood on the road. */
  startSkirmish(state: GameState, map: number, index: number): void {
    if (this.running) return;
    const enemyZ = this.world.outpostZ(index);
    // Their line (field − 4 in battle space) stands where the outpost stood.
    const anchor = enemyZ + (SKIRMISH_FIELD - 4);
    this.begin(state, 'skirmish', (x, z) => new THREE.Vector3(x * 0.8, 0, anchor - z), {
      ours: armyPower(state),
      theirs: outpostPower(state, index),
      theirMix: compositionOf(state.rival.startLevels),
      field: SKIRMISH_FIELD,
      forcedWinner: 'ours',
      map,
    });
  }

  private begin(
    state: GameState,
    kind: 'assault' | 'skirmish',
    toWorld: Running['toWorld'],
    o: {
      ours: Battle['config']['ours'];
      theirs: Battle['config']['theirs'];
      theirMix: Battle['config']['theirMix'];
      field?: number;
      forcedWinner?: 'ours';
      map?: number;
    },
  ): void {
    const battle = createBattle({
      ours: o.ours,
      theirs: o.theirs,
      ourMix: compositionOf(state.levels),
      theirMix: o.theirMix,
      seed: (Math.random() * 2 ** 31) | 0,
      mode: kind,
      field: o.field,
      forcedWinner: o.forcedWinner,
    });
    this.running = {
      battle,
      kind,
      acc: 0,
      doneFor: 0,
      toWorld,
      map: o.map ?? state.map,
      sector: state.sector,
    };
    this.view.toWorld = toWorld;
    this.view.visible = true;
    this.world.setBattle({ followZ: kind === 'assault' ? toWorld(0, 4).z : null });
  }

  /** Give up the assault (counts as a defeat). */
  retreat(): void {
    if (this.running?.kind !== 'assault') return;
    this.finish(false);
  }

  /** Stop without a result (the game moved on underneath the battle). */
  abort(): void {
    this.close();
  }

  update(state: GameState, dt: number): void {
    const r = this.running;
    if (!r) return;
    if (r.kind === 'assault' && (state.map !== r.map || state.sector !== r.sector)) {
      this.abort();
      return;
    }
    const b = r.battle;
    r.acc += Math.min(dt, 0.25);
    while (r.acc >= STEP) {
      r.acc -= STEP;
      stepBattle(b, STEP, r.kind === 'assault' && !b.result ? this.hud.input() : undefined);
    }
    this.view.draw(b, dt, COMMANDER.auraRadius, r.kind === 'assault');
    if (r.kind === 'assault') {
      this.hud.update(b);
      // Follow the fight: a little ahead of the commander and the front line.
      let front = b.commander.z;
      for (const u of b.units) if (u.team === 'ours' && u.deadFor < 0) front = Math.max(front, u.z);
      this.world.setBattle({ followZ: r.toWorld(0, (b.commander.z + front) / 2 + 5).z });
    }
    if (b.result) {
      r.doneFor += dt;
      if (r.doneFor >= LINGER[r.kind]) {
        if (r.kind === 'assault') this.finish(b.result === 'win');
        else this.close();
      }
    }
  }

  private finish(won: boolean): void {
    this.close();
    this.onAssaultEnd(won);
  }

  private close(): void {
    if (this.running?.kind === 'assault') this.hud.hide();
    this.running = null;
    this.view.visible = false;
    this.world.setBattle(null);
  }
}
