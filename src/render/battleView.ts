import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Battle, Team, UnitKind } from '../core';
import { COLORS, mat } from './models';

/**
 * Draws a battle from the core simulation: instanced units per team and kind, falling
 * casualties, tracers, shell bursts, and the commander with the aura ring.
 *
 * Battle space (x across, z forward from our side) maps to world space through `toWorld`, which
 * each battle sets for where it is fought.
 */

const MAX_PER_KIND = 80;
const MAX_SHOTS = 256;
const MAX_BURSTS = 24;

type Part = { geo: THREE.BufferGeometry; color: number; team: boolean };

function box(w: number, h: number, d: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
}

function merged(...geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeometries(
    geos
      .map((g) => (g.index ? g.toNonIndexed() : g))
      .map((g) => {
        for (const k of Object.keys(g.attributes))
          if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
        return g;
      }),
  )!;
}

/** Parts of each unit kind; `team: true` parts take the team colour. Units face +z. */
function partsOf(kind: UnitKind): Part[] {
  switch (kind) {
    case 'infantry':
      return [
        {
          geo: new THREE.CapsuleGeometry(0.22, 0.4, 3, 6).translate(0, 0.45, 0),
          color: 0,
          team: true,
        },
        {
          geo: merged(
            new THREE.SphereGeometry(0.19, 8, 6).translate(0, 1, 0),
            box(0.08, 0.08, 0.6, 0.18, 0.55, 0.2), // rifle
          ),
          color: COLORS.dark,
          team: false,
        },
      ];
    case 'tank':
      return [
        {
          geo: merged(
            box(1.3, 0.4, 1.8, 0, 0.35),
            new THREE.CylinderGeometry(0.42, 0.42, 0.32, 10).translate(0, 0.91, -0.1),
          ),
          color: 0,
          team: true,
        },
        {
          geo: merged(
            box(1.4, 0.38, 2, 0, 0),
            new THREE.CylinderGeometry(0.07, 0.07, 1.1, 6)
              .rotateX(Math.PI / 2)
              .translate(0, 0.95, 0.6),
          ),
          color: COLORS.black,
          team: false,
        },
      ];
    case 'artillery':
      return [
        {
          geo: merged(box(1, 0.45, 1, 0, 0), box(0.7, 0.35, 0.6, 0, 0.45, -0.1)),
          color: 0,
          team: true,
        },
        {
          geo: merged(
            new THREE.CylinderGeometry(0.1, 0.13, 1.6, 8)
              .rotateX(Math.PI / 2 - 0.45)
              .translate(0, 1.05, 0.55),
          ),
          color: COLORS.dark,
          team: false,
        },
      ];
  }
}

const TEAM_COLOR: Record<Team, number> = { ours: COLORS.army, theirs: COLORS.enemy };
const KINDS: UnitKind[] = ['infantry', 'tank', 'artillery'];

export class BattleView {
  private root = new THREE.Group();
  private meshes = new Map<string, THREE.InstancedMesh[]>();
  private commander = new THREE.Group();
  private aura: THREE.Mesh;
  private tracers: THREE.LineSegments;
  private tracerPos = new Float32Array(MAX_SHOTS * 6);
  private tracerCol = new Float32Array(MAX_SHOTS * 6);
  private bursts: THREE.Mesh[] = [];
  private burstAge: number[] = [];
  private seenShots = new WeakSet<object>();
  private dummy = new THREE.Object3D();

  /** Maps battle space to world space; set per battle. */
  toWorld: (x: number, z: number) => THREE.Vector3 = (x, z) => new THREE.Vector3(x, 0, z);

  constructor(scene: THREE.Scene) {
    for (const team of ['ours', 'theirs'] as Team[]) {
      for (const kind of KINDS) {
        const list = partsOf(kind).map((p) => {
          const m = new THREE.InstancedMesh(
            p.geo,
            mat(p.team ? TEAM_COLOR[team] : p.color),
            MAX_PER_KIND,
          );
          m.castShadow = true;
          m.count = 0;
          m.frustumCulled = false;
          this.root.add(m);
          return m;
        });
        this.meshes.set(`${team}:${kind}`, list);
      }
    }

    // The commander: a gold soldier with a flag, and a ring showing the aura.
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.3, 0.55, 3, 8).translate(0, 0.6, 0),
      mat(COLORS.gold),
    );
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 10, 8).translate(0, 1.3, 0),
      mat(COLORS.gold),
    );
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.32, 0.14, 10).translate(0, 1.5, 0),
      mat(COLORS.armyDark),
    );
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6).translate(-0.45, 1.1, 0),
      mat(COLORS.dark),
    );
    const flag = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.42, 0.04).translate(-0.1, 2.0, 0),
      mat(COLORS.army),
    );
    for (const m of [body, head, cap, pole, flag]) m.castShadow = true;
    this.commander.add(body, head, cap, pole, flag);
    this.aura = new THREE.Mesh(
      new THREE.RingGeometry(0.92, 1, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0xffd54f,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
    this.aura.position.y = 0.12;
    this.root.add(this.commander, this.aura);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.tracerCol, 3));
    this.tracers = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }),
    );
    this.tracers.frustumCulled = false;
    this.root.add(this.tracers);

    for (let i = 0; i < MAX_BURSTS; i++) {
      const b = new THREE.Mesh(
        new THREE.SphereGeometry(0.6, 10, 8),
        new THREE.MeshBasicMaterial({
          color: 0xffb74d,
          transparent: true,
          opacity: 0.8,
          depthWrite: false,
        }),
      );
      b.visible = false;
      this.bursts.push(b);
      this.burstAge.push(Infinity);
      this.root.add(b);
    }
    this.root.visible = false;
    scene.add(this.root);
  }

  set visible(v: boolean) {
    this.root.visible = v;
  }

  /** Draw the battle as it stands. */
  draw(b: Battle, dt: number, auraRadius: number, showCommander: boolean): void {
    const counts = new Map<string, number>();
    for (const u of b.units) {
      // Fallen units topple over, then sink into the snow and disappear.
      if (u.deadFor > 2.2) continue;
      const k = `${u.team}:${u.kind}`;
      const meshes = this.meshes.get(k)!;
      const i = counts.get(k) ?? 0;
      if (i >= MAX_PER_KIND) continue;
      counts.set(k, i + 1);
      const p = this.toWorld(u.x, u.z);
      const fall = u.deadFor < 0 ? 0 : Math.min(1, u.deadFor / 0.4);
      const sink = u.deadFor > 1.2 ? (u.deadFor - 1.2) * 0.6 : 0;
      this.dummy.position.set(p.x, -sink, p.z);
      // Face the enemy: ours look up the field (-z in world), theirs look down it.
      this.dummy.rotation.set(
        fall * (Math.PI / 2) * (u.kind === 'infantry' ? 1 : 0.15),
        u.team === 'ours' ? Math.PI : 0,
        0,
        'YXZ',
      );
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      for (const m of meshes) m.setMatrixAt(i, this.dummy.matrix);
    }
    for (const [k, meshes] of this.meshes) {
      const n = counts.get(k) ?? 0;
      for (const m of meshes) {
        m.count = n;
        m.instanceMatrix.needsUpdate = true;
      }
    }

    const c = this.toWorld(b.commander.x, b.commander.z);
    this.commander.visible = showCommander;
    this.aura.visible = showCommander;
    this.commander.position.copy(c);
    this.commander.rotation.y = Math.PI;
    this.aura.position.set(c.x, 0.12, c.z);
    this.aura.scale.setScalar(auraRadius);
    (this.aura.material as THREE.MeshBasicMaterial).opacity = b.chargeLeft > 0 ? 0.8 : 0.35;

    // Tracers for this frame's shots; bursts where artillery lands.
    let n = 0;
    for (const s of b.shots) {
      if (n >= MAX_SHOTS) break;
      const from = this.toWorld(s.fromX, s.fromZ);
      const to = this.toWorld(s.toX, s.toZ);
      const y = s.kind === 'infantry' ? 0.6 : 0.95;
      this.tracerPos.set([from.x, y, from.z, to.x, 0.5, to.z], n * 6);
      const col = s.team === 'ours' ? [1, 0.93, 0.5] : [1, 0.55, 0.35];
      this.tracerCol.set([...col, ...col], n * 6);
      n++;
      if (s.kind !== 'infantry' && !this.seenShots.has(s)) {
        this.seenShots.add(s);
        this.burst(to, s.kind === 'artillery' ? 1.5 : 0.8);
      }
    }
    this.tracers.geometry.setDrawRange(0, n * 2);
    this.tracers.geometry.attributes.position!.needsUpdate = true;
    this.tracers.geometry.attributes.color!.needsUpdate = true;

    for (let i = 0; i < this.bursts.length; i++) {
      const age = (this.burstAge[i] = this.burstAge[i]! + dt);
      const m = this.bursts[i]!;
      m.visible = age < 0.45;
      if (!m.visible) continue;
      const t = age / 0.45;
      m.scale.setScalar((m.userData.size as number) * (0.4 + t));
      (m.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - t);
    }
  }

  private burst(at: THREE.Vector3, size: number): void {
    let oldest = 0;
    for (let i = 1; i < this.burstAge.length; i++)
      if (this.burstAge[i]! > this.burstAge[oldest]!) oldest = i;
    const m = this.bursts[oldest]!;
    m.position.set(at.x, 0.4, at.z);
    m.userData.size = size;
    this.burstAge[oldest] = 0;
  }
}
