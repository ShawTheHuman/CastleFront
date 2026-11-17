import * as THREE from 'three';
import { COLORS, buildingModel, lockedPlot, mat, sandbagWall, tree, type Side } from './models';

/**
 * The whole map in one scene, looking toward -z:
 *   our base (bottom) · our wall · the road with the rival's outposts · the rival's wall ·
 *   the rival's base (top), a mirror image of ours.
 */

/** Where each of our buildings sits (world x/z). The rival's base mirrors this across MIRROR_Z. */
export const LAYOUT: Record<string, { x: number; z: number }> = {
  // Front line, nearest the battlefield.
  barracks: { x: -5, z: -7 },
  commander: { x: 0, z: -7 },
  range: { x: 5, z: -7 },
  tankFactory: { x: -5, z: -1 },
  artillery: { x: 0, z: -1 },
  airfield: { x: 5, z: -1 },
  // Back line.
  farm: { x: -5, z: 6 },
  market: { x: 0, z: 6 },
  warehouse: { x: 5, z: 6 },
  mine: { x: -5, z: 12 },
  foundry: { x: 0, z: 12 },
  derrick: { x: -5, z: 18 },
  refinery: { x: 0, z: 18 },
};

const WALL_Z = -12;
const MIRROR_Z = -24;
const RIVAL_WALL_Z = 2 * MIRROR_Z - WALL_Z; // -36
const OUTPOST_FIRST_Z = -15.5;
const OUTPOST_STEP = 2.2;
const RIVAL_ARMY_Z = RIVAL_WALL_Z + 3;
const PAN_MIN = 2 * MIRROR_Z - 4; // looking at the rival's base
const PAN_MAX = 14;
const VISIBLE_WIDTH = 17;
const CAM_OFFSET = new THREE.Vector3(0, 26, 15);
const MAX_UNITS = 300;

export type View = 'base' | 'front' | 'rival';
const VIEW_Z: Record<View, number> = { base: 1, front: -20, rival: 2 * MIRROR_Z - 1 };

function mirrorZ(z: number): number {
  return 2 * MIRROR_Z - z;
}

interface Slot {
  side: Side;
  assetId: string;
  root: THREE.Group;
  model: THREE.Group | null;
  built: boolean;
  level: number;
  pop: number;
  smoke: THREE.Mesh[];
}

export interface SlotView {
  level: number;
  /** Shown as a building (false = construction plot). */
  built: boolean;
  tier: number;
}

export interface Pick {
  side: Side;
  assetId: string;
}

const key = (side: Side, assetId: string) => `${side}:${assetId}`;

export class World {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 1, 0.5, 300);
  private sun = new THREE.DirectionalLight(0xffffff, 1.5);
  private slots = new Map<string, Slot>();
  private raycaster = new THREE.Raycaster();
  private targetZ = VIEW_Z.base;
  private focusZ = VIEW_Z.base;
  private ours: THREE.InstancedMesh;
  private theirs: THREE.InstancedMesh;
  private ourHeads: THREE.InstancedMesh;
  private theirHeads: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private time = 0;
  private enemyZ = OUTPOST_FIRST_Z;
  private reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.background = new THREE.Color(0xdfe7ee);
    this.scene.fog = new THREE.Fog(0xdfe7ee, 45, 90);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xa7b9cc, 1.5));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -22;
    sc.right = 22;
    sc.top = 24;
    sc.bottom = -24;
    sc.far = 90;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun, this.sun.target);

    this.buildGround();
    this.buildScenery();

    for (const side of ['ours', 'rival'] as const) {
      for (const [assetId, pos] of Object.entries(LAYOUT)) {
        const root = new THREE.Group();
        root.position.set(pos.x, 0, side === 'ours' ? pos.z : mirrorZ(pos.z));
        root.userData.slotKey = key(side, assetId);
        this.scene.add(root);
        this.slots.set(key(side, assetId), {
          side,
          assetId,
          root,
          model: null,
          built: false,
          level: -1,
          pop: 0,
          smoke: [],
        });
      }
    }

    const body = new THREE.CapsuleGeometry(0.24, 0.42, 3, 6);
    body.translate(0, 0.5, 0);
    const head = new THREE.SphereGeometry(0.2, 8, 6);
    head.translate(0, 1.08, 0);
    this.ours = this.units(body, COLORS.army);
    this.ourHeads = this.units(head, COLORS.armyDark);
    this.theirs = this.units(body, COLORS.enemy);
    this.theirHeads = this.units(head, COLORS.enemyDark);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private units(geo: THREE.BufferGeometry, color: number): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(geo, mat(color), MAX_UNITS);
    m.castShadow = true;
    m.count = 0;
    m.frustumCulled = false;
    this.scene.add(m);
    return m;
  }

  private buildGround(): void {
    const snow = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), mat(COLORS.snow));
    snow.rotation.x = -Math.PI / 2;
    snow.position.z = MIRROR_Z;
    snow.receiveShadow = true;
    this.scene.add(snow);

    for (const side of ['ours', 'rival'] as const) {
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(17, 0.1, 32),
        mat(side === 'ours' ? 0xd9dee3 : 0xe3d6d3),
      );
      slab.position.set(0, 0.05, side === 'ours' ? 6.5 : mirrorZ(6.5));
      slab.receiveShadow = true;
      this.scene.add(slab);
    }

    const road = new THREE.Mesh(
      new THREE.BoxGeometry(13, 0.06, RIVAL_WALL_Z - WALL_Z),
      mat(COLORS.sand),
    );
    road.position.set(0, 0.03, MIRROR_Z);
    road.receiveShadow = true;
    this.scene.add(road);

    const wall = sandbagWall(16);
    wall.position.set(0, 0, WALL_Z);
    this.scene.add(wall);
    const rivalWall = sandbagWall(16, COLORS.rivalSandbag);
    rivalWall.position.set(0, 0, RIVAL_WALL_Z);
    this.scene.add(rivalWall);
  }

  private buildScenery(): void {
    let seed = 11;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 90; i++) {
      const side = i % 2 ? 1 : -1;
      const t = tree();
      t.position.set(side * (10 + rand() * 14), 0, -80 + rand() * 110);
      t.scale.setScalar(0.8 + rand() * 0.7);
      this.scene.add(t);
    }
    // Fill the empty corner of each back line.
    for (const [x, z] of [
      [4, 11.5],
      [6, 13],
      [4.5, 18],
      [6.2, 19.5],
    ] as const) {
      for (const zz of [z, mirrorZ(z)]) {
        const t = tree();
        t.position.set(x, 0, zz);
        this.scene.add(t);
      }
    }
  }

  /** Sync a building model with the game state (cheap when nothing changed). */
  syncSlot(side: Side, assetId: string, view: SlotView): void {
    const slot = this.slots.get(key(side, assetId));
    if (!slot) return;
    if (slot.model === null || slot.built !== view.built) {
      if (slot.model) slot.root.remove(slot.model);
      slot.model = view.built ? buildingModel(assetId, side) : lockedPlot();
      slot.built = view.built;
      slot.root.add(slot.model);
      slot.smoke = view.built ? this.makeSmoke(slot) : [];
    }
    if (slot.level >= 0 && view.level > slot.level) slot.pop = 1;
    slot.level = view.level;
    const s =
      (view.built ? 0.82 + Math.min(view.tier, 8) * 0.04 : 1) *
      (1 + Math.sin(slot.pop * Math.PI) * 0.12);
    slot.model.scale.setScalar(s);
  }

  private makeSmoke(slot: Slot): THREE.Mesh[] {
    const source = slot.model?.getObjectByName('smoke-source');
    if (!source) return [];
    const puffs: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 5), mat(0xeceff1));
      p.userData.phase = i / 4;
      p.userData.base = source.position.clone().add(new THREE.Vector3(0, 1.2, 0));
      slot.model!.add(p);
      puffs.push(p);
    }
    return puffs;
  }

  /** Anchor above a building, for its label. */
  anchor(side: Side, assetId: string, height = 3.6): THREE.Vector3 {
    const p = LAYOUT[assetId] ?? { x: 0, z: 0 };
    return new THREE.Vector3(p.x, height, side === 'ours' ? p.z : mirrorZ(p.z));
  }

  /** Anchor above the enemy formation the army faces next. */
  enemyAnchor(): THREE.Vector3 {
    return new THREE.Vector3(0, 3, this.enemyZ - 1);
  }

  /** Project a world point to CSS pixels; `visible` is false when off-screen or behind. */
  project(v: THREE.Vector3): { x: number; y: number; visible: boolean } {
    const p = v.clone().project(this.camera);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    return {
      x: ((p.x + 1) / 2) * w,
      y: ((1 - p.y) / 2) * h,
      visible: p.z < 1 && p.x > -1.2 && p.x < 1.2 && p.y > -1.2 && p.y < 1.2,
    };
  }

  /** The building under a screen point, if any. */
  pick(clientX: number, clientY: number): Pick | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const roots = [...this.slots.values()].map((s) => s.root);
    const hit = this.raycaster.intersectObjects(roots, true)[0];
    let o: THREE.Object3D | null = hit?.object ?? null;
    while (o && !this.slots.has(o.userData.slotKey as string)) o = o.parent;
    const slot = o ? this.slots.get(o.userData.slotKey as string) : undefined;
    return slot ? { side: slot.side, assetId: slot.assetId } : null;
  }

  /** Pan by a drag of `dy` CSS pixels. */
  panBy(dy: number): void {
    const unitsPerPx = this.visibleHeight() / this.canvas.clientHeight;
    this.targetZ = THREE.MathUtils.clamp(this.targetZ - dy * unitsPerPx * 1.3, PAN_MIN, PAN_MAX);
  }

  panTo(view: View): void {
    this.targetZ = VIEW_Z[view];
  }

  /** The view the camera is closest to. */
  get view(): View {
    let best: View = 'base';
    for (const v of Object.keys(VIEW_Z) as View[]) {
      if (Math.abs(VIEW_Z[v] - this.focusZ) < Math.abs(VIEW_Z[best] - this.focusZ)) best = v;
    }
    return best;
  }

  private visibleHeight(): number {
    const d = CAM_OFFSET.length();
    return 2 * d * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
  }

  private layoutUnits(
    body: THREE.InstancedMesh,
    head: THREE.InstancedMesh,
    count: number,
    z: number,
    dir: number,
    march: number,
  ): void {
    const n = Math.min(count, MAX_UNITS);
    const cols = Math.min(14, Math.max(5, Math.ceil(Math.sqrt(n * 2.5))));
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const bob = this.reducedMotion
        ? 0
        : Math.abs(Math.sin(this.time * 5 * march + i * 0.7)) * 0.08 * march;
      this.dummy.position.set((col - (cols - 1) / 2) * 0.9, bob, z + dir * row * 1);
      this.dummy.rotation.y = dir > 0 ? Math.PI : 0;
      this.dummy.updateMatrix();
      body.setMatrixAt(i, this.dummy.matrix);
      head.setMatrixAt(i, this.dummy.matrix);
    }
    body.count = n;
    head.count = n;
    body.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;
  }

  /**
   * @param outpost index of the target the army faces (outposts first, then the rival's base)
   * @param atBase the army faces the rival's base
   */
  update(dt: number, ourUnits: number, enemyUnits: number, outpost: number, atBase: boolean): void {
    this.time += dt;
    const k = 1 - Math.exp(-dt * 10);
    this.focusZ += (this.targetZ - this.focusZ) * k;
    const focus = new THREE.Vector3(0, 0, this.focusZ);
    this.camera.position.copy(focus).add(CAM_OFFSET);
    this.camera.lookAt(focus);
    this.sun.position.set(-12, 30, this.focusZ + 14);
    this.sun.target.position.copy(focus);

    // The front line advances up the road as outposts fall.
    const targetEnemyZ = atBase ? RIVAL_ARMY_Z : OUTPOST_FIRST_Z - outpost * OUTPOST_STEP;
    this.enemyZ += (targetEnemyZ - this.enemyZ) * (1 - Math.exp(-dt * 2));
    const oursZ = Math.min(WALL_Z - 2.5, this.enemyZ + 6);
    this.layoutUnits(this.ours, this.ourHeads, ourUnits, oursZ, 1, 0.5);
    this.layoutUnits(this.theirs, this.theirHeads, enemyUnits, this.enemyZ, -1, 0.3);

    const motion = this.reducedMotion ? 0 : 1;
    for (const slot of this.slots.values()) {
      if (slot.pop > 0) slot.pop = Math.max(0, slot.pop - dt * 3);
      const m = slot.model;
      if (!m) continue;
      const jack = m.getObjectByName('pumpjack');
      if (jack) jack.rotation.x = Math.sin(this.time * 2) * 0.35 * motion;
      const flag = m.getObjectByName('flag');
      if (flag) flag.rotation.y = Math.sin(this.time * 3) * 0.25 * motion;
      const plane = m.getObjectByName('plane');
      if (plane) plane.position.y = 0.6 + Math.sin(this.time * 1.5) * 0.08 * motion;
      const gun = m.getObjectByName('gun');
      if (gun) gun.rotation.y = Math.sin(this.time * 0.6) * 0.3 * motion;
      for (const p of slot.smoke) {
        const t = (this.time * 0.4 + (p.userData.phase as number)) % 1;
        const base = p.userData.base as THREE.Vector3;
        p.position.set(base.x + t * 0.6, base.y + t * 2.2, base.z);
        p.scale.setScalar(0.5 + t * 1.2);
        p.visible = motion > 0 && t < 0.95;
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const d = CAM_OFFSET.length();
    const neededHeight = VISIBLE_WIDTH / this.camera.aspect;
    const fov = THREE.MathUtils.radToDeg(2 * Math.atan(neededHeight / (2 * d)));
    this.camera.fov = THREE.MathUtils.clamp(fov, 38, 75);
    this.camera.updateProjectionMatrix();
  }
}
