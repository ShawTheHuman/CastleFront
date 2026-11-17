import * as THREE from 'three';

/**
 * Procedural low-poly "toy" models built from primitives. Placeholder art: every model is a
 * THREE.Group about 4×4 units on the ground, origin at its base centre, facing +z (the camera).
 */

export const COLORS = {
  army: 0x4caf50,
  armyDark: 0x2e7d32,
  enemy: 0xe53935,
  enemyDark: 0xb71c1c,
  gold: 0xffc107,
  wood: 0x8d6e63,
  roofRed: 0xc62828,
  white: 0xf5f5f5,
  concrete: 0xb0bec5,
  concreteDark: 0x78909c,
  steel: 0x90a4ae,
  dark: 0x37474f,
  black: 0x263238,
  field: 0x9ccc65,
  crop: 0xdce775,
  rock: 0x8d8d8d,
  oil: 0x212121,
  sand: 0xd7c39b,
  brick: 0xa1665e,
  canvas: 0xc5b58a,
  snow: 0xf3f6f9,
  rivalSandbag: 0xb5574b,
} as const;

const materials = new Map<number, THREE.MeshLambertMaterial>();
export function mat(color: number): THREE.MeshLambertMaterial {
  let m = materials.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    materials.set(color, m);
  }
  return m;
}

function mesh(geo: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Box resting on y = `y` (bottom face), centred on x/z. */
function box(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
  return mesh(new THREE.BoxGeometry(w, h, d), color, x, y + h / 2, z);
}

function cyl(r: number, h: number, color: number, x = 0, y = 0, z = 0, seg = 10): THREE.Mesh {
  return mesh(new THREE.CylinderGeometry(r, r, h, seg), color, x, y + h / 2, z);
}

/** Triangular prism roof along x. */
function roof(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2, 0);
  shape.lineTo(d / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
  geo.translate(0, 0, -w / 2);
  geo.rotateY(Math.PI / 2);
  return mesh(geo, color, x, y, z);
}

function pad(w = 4.2, d = 4.2, color: number = COLORS.concrete): THREE.Mesh {
  return box(w, 0.2, d, color);
}

/** A tiny soldier figure (used for decoration on buildings). */
export function soldier(color: number = COLORS.army, hat: number = COLORS.armyDark): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CapsuleGeometry(0.22, 0.4, 3, 6), color, 0, 0.5, 0));
  g.add(mesh(new THREE.SphereGeometry(0.2, 8, 6), color, 0, 1.05, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.1, 8), hat, 0, 1.2, 0));
  return g;
}

function tank(color: number = COLORS.army): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.5, 0.45, 2.1, COLORS.black, 0, 0.05, 0));
  g.add(box(1.4, 0.4, 1.9, color, 0, 0.45, 0));
  g.add(cyl(0.45, 0.35, color, 0, 0.85, -0.1));
  const barrel = mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 6), COLORS.dark, 0, 1.03, 0.6);
  barrel.rotation.x = Math.PI / 2;
  g.add(barrel);
  return g;
}

function crate(x: number, z: number, s = 0.6): THREE.Mesh {
  return box(s, s, s, COLORS.wood, x, 0.2, z);
}

type Builder = () => THREE.Group;

const BUILDERS: Record<string, Builder> = {
  market() {
    const g = new THREE.Group();
    g.add(pad());
    g.add(box(3, 1.6, 2.2, COLORS.white, 0, 0.2, -0.4));
    // Striped awning.
    for (let i = 0; i < 5; i++) {
      const stripe = box(
        0.6,
        0.12,
        1.2,
        i % 2 ? COLORS.white : COLORS.roofRed,
        -1.2 + i * 0.6,
        1.7,
        1.1,
      );
      stripe.rotation.x = 0.35;
      g.add(stripe);
    }
    g.add(box(3.1, 0.3, 2.3, COLORS.roofRed, 0, 1.8, -0.4));
    // Coin stacks.
    g.add(cyl(0.3, 0.5, COLORS.gold, -1.3, 0.2, 1.4));
    g.add(cyl(0.3, 0.8, COLORS.gold, -0.6, 0.2, 1.5));
    g.add(cyl(0.3, 0.35, COLORS.gold, 1.2, 0.2, 1.5));
    return g;
  },
  farm() {
    const g = new THREE.Group();
    g.add(box(4.2, 0.2, 4.2, COLORS.field));
    for (let i = 0; i < 4; i++) g.add(box(0.35, 0.35, 2.2, COLORS.crop, -1.6 + i * 0.6, 0.2, 0.7));
    g.add(box(1.6, 1.2, 1.4, COLORS.roofRed, 1.1, 0.2, -1.1));
    g.add(roof(1.7, 0.8, 1.6, COLORS.white, 1.1, 1.4, -1.1));
    return g;
  },
  mine() {
    const g = new THREE.Group();
    g.add(pad(4.2, 4.2, COLORS.concreteDark));
    g.add(mesh(new THREE.ConeGeometry(1.9, 2.4, 6), COLORS.rock, 0, 1.4, -0.6));
    g.add(box(1, 1, 0.3, COLORS.black, 0, 0.2, 0.9));
    g.add(box(1.3, 0.25, 0.35, COLORS.wood, 0, 1.2, 0.95));
    // Ore cart on rails.
    g.add(box(0.2, 0.06, 2, COLORS.dark, -0.3, 0.2, 1.4));
    g.add(box(0.2, 0.06, 2, COLORS.dark, 0.3, 0.2, 1.4));
    g.add(box(0.9, 0.5, 0.7, COLORS.steel, 0, 0.3, 1.6));
    g.add(box(0.7, 0.2, 0.5, COLORS.rock, 0, 0.8, 1.6));
    return g;
  },
  foundry() {
    const g = new THREE.Group();
    g.add(pad());
    g.add(box(3, 1.8, 2.4, COLORS.brick, -0.3, 0.2, 0));
    g.add(box(3.1, 0.2, 2.5, COLORS.dark, -0.3, 2, 0));
    const chimney = cyl(0.35, 2.4, COLORS.brick, 1.4, 0.2, -0.8, 8);
    chimney.name = 'smoke-source';
    g.add(chimney);
    g.add(box(0.9, 0.6, 0.1, COLORS.gold, -0.3, 0.6, 1.25)); // glowing furnace door
    g.add(box(0.8, 0.3, 0.5, COLORS.steel, 1.3, 0.2, 1.4));
    return g;
  },
  derrick() {
    const g = new THREE.Group();
    g.add(pad(4.2, 4.2, COLORS.sand));
    // Lattice tower.
    for (const [x, z] of [
      [-0.6, -0.6],
      [0.6, -0.6],
      [-0.6, 0.6],
      [0.6, 0.6],
    ] as const) {
      const leg = box(0.15, 3.4, 0.15, COLORS.dark, x * 0.7, 0.2, z * 0.7 - 0.6);
      g.add(leg);
    }
    g.add(box(1.1, 0.15, 1.1, COLORS.dark, 0, 1.5, -0.6));
    g.add(box(0.5, 0.3, 0.5, COLORS.roofRed, 0, 3.6, -0.6));
    // Pumpjack: the beam is animated (named).
    g.add(box(0.3, 1, 0.3, COLORS.dark, 1.2, 0.2, 1.1));
    const beam = new THREE.Group();
    beam.name = 'pumpjack';
    beam.position.set(1.2, 1.25, 1.1);
    beam.add(box(0.25, 0.25, 1.8, COLORS.gold, 0, -0.12, 0));
    beam.add(box(0.35, 0.5, 0.25, COLORS.gold, 0, -0.45, 0.9));
    g.add(beam);
    g.add(cyl(0.45, 0.6, COLORS.oil, -1.2, 0.2, 1.2));
    return g;
  },
  refinery() {
    const g = new THREE.Group();
    g.add(pad());
    g.add(cyl(0.8, 1.8, COLORS.white, -0.9, 0.2, -0.7, 12));
    g.add(cyl(0.6, 1.3, COLORS.white, 0.9, 0.2, -0.9, 12));
    g.add(cyl(0.35, 3, COLORS.steel, 0.4, 0.2, 0.9, 8));
    const pipe = box(2.4, 0.18, 0.18, COLORS.dark, 0, 1.4, 0.1);
    g.add(pipe);
    g.add(box(1, 0.6, 0.8, COLORS.army, -1.1, 0.2, 1.2)); // fuel drums
    return g;
  },
  warehouse() {
    const g = new THREE.Group();
    g.add(pad());
    g.add(box(3.4, 1.6, 2.6, COLORS.canvas, 0, 0.2, -0.4));
    g.add(roof(3.5, 0.9, 2.8, COLORS.armyDark, 0, 1.8, -0.4));
    g.add(box(1.2, 1.1, 0.1, COLORS.wood, 0, 0.2, 0.92));
    g.add(crate(-1.4, 1.5));
    g.add(crate(-0.8, 1.6, 0.5));
    g.add(crate(1.3, 1.5));
    g.add(crate(1.3, 1.5, 0.5).translateY(0.55));
    return g;
  },
  commander() {
    const g = new THREE.Group();
    g.add(pad(4.2, 4.2, COLORS.sand));
    g.add(box(2.6, 1.2, 2, COLORS.armyDark, 0, 0.2, -0.6));
    g.add(roof(2.8, 0.9, 2.2, COLORS.army, 0, 1.4, -0.6));
    g.add(cyl(0.06, 3.4, COLORS.dark, 1.6, 0.2, -1.3, 6));
    const flag = box(0.9, 0.55, 0.05, COLORS.gold, 2.05, 3, -1.3);
    flag.name = 'flag';
    g.add(flag);
    const cmd = soldier(COLORS.gold, COLORS.armyDark);
    cmd.scale.setScalar(1.3);
    cmd.position.set(0, 0.2, 1.2);
    g.add(cmd);
    return g;
  },
  barracks() {
    const g = new THREE.Group();
    g.add(pad(4.2, 4.2, COLORS.sand));
    // Quonset hut.
    const hut = mesh(
      new THREE.CylinderGeometry(1.2, 1.2, 3.2, 10, 1, false, 0, Math.PI),
      COLORS.armyDark,
      0,
      0.2,
      -0.5,
    );
    hut.rotation.z = Math.PI / 2;
    hut.rotation.y = Math.PI / 2;
    hut.position.y = 0.2;
    g.add(hut);
    g.add(box(0.8, 0.9, 0.05, COLORS.dark, 0, 0.2, 1.1));
    for (let i = 0; i < 3; i++) {
      const s = soldier();
      s.position.set(-1.2 + i * 1.2, 0.2, 1.6);
      g.add(s);
    }
    return g;
  },
  range() {
    const g = new THREE.Group();
    g.add(pad(4.2, 4.2, COLORS.sand));
    for (let i = 0; i < 3; i++) {
      const x = -1.3 + i * 1.3;
      g.add(box(0.1, 1, 0.1, COLORS.wood, x, 0.2, -1.3));
      const target = mesh(
        new THREE.CylinderGeometry(0.45, 0.45, 0.08, 12),
        COLORS.white,
        x,
        1.4,
        -1.3,
      );
      target.rotation.x = Math.PI / 2;
      g.add(target);
      const bull = mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 0.1, 10),
        COLORS.roofRed,
        x,
        1.4,
        -1.27,
      );
      bull.rotation.x = Math.PI / 2;
      g.add(bull);
    }
    // Sandbag line + shooters.
    for (let i = 0; i < 6; i++)
      g.add(box(0.6, 0.35, 0.4, COLORS.canvas, -1.6 + i * 0.64, 0.2, 0.9));
    for (let i = 0; i < 3; i++) {
      const s = soldier();
      s.position.set(-1.3 + i * 1.3, 0.2, 1.5);
      g.add(s);
    }
    return g;
  },
  tankFactory() {
    const g = new THREE.Group();
    g.add(pad());
    const hangar = mesh(
      new THREE.CylinderGeometry(1.5, 1.5, 3, 12, 1, false, 0, Math.PI),
      COLORS.concreteDark,
      0,
      0.2,
      -0.8,
    );
    hangar.rotation.z = Math.PI / 2;
    hangar.rotation.y = Math.PI / 2;
    hangar.position.y = 0.2;
    g.add(hangar);
    const t = tank();
    t.position.set(0, 0.2, 1);
    g.add(t);
    return g;
  },
  artillery() {
    const g = new THREE.Group();
    g.add(pad(4.2, 4.2, COLORS.sand));
    // Sandbag ring.
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const bag = box(0.7, 0.4, 0.4, COLORS.canvas, Math.cos(a) * 1.6, 0.2, Math.sin(a) * 1.6);
      bag.rotation.y = -a + Math.PI / 2;
      g.add(bag);
    }
    g.add(cyl(0.7, 0.4, COLORS.armyDark, 0, 0.2, 0));
    const gun = new THREE.Group();
    gun.name = 'gun';
    gun.position.set(0, 0.9, 0);
    const barrel = mesh(new THREE.CylinderGeometry(0.14, 0.18, 2.6, 8), COLORS.dark, 0, 0, -1);
    barrel.rotation.x = Math.PI / 2 - 0.5;
    gun.add(barrel);
    gun.add(box(0.9, 0.5, 0.9, COLORS.army, 0, -0.3, 0));
    g.add(gun);
    return g;
  },
  airfield() {
    const g = new THREE.Group();
    g.add(box(4.4, 0.15, 4.4, COLORS.dark));
    for (let i = 0; i < 4; i++) g.add(box(0.15, 0.02, 0.6, COLORS.white, 0, 0.15, -1.6 + i * 1.1));
    const plane = new THREE.Group();
    plane.name = 'plane';
    plane.add(box(0.5, 0.45, 2.2, COLORS.army, 0, 0, 0));
    plane.add(box(2.6, 0.1, 0.6, COLORS.armyDark, 0, 0.15, 0.1));
    plane.add(box(1, 0.08, 0.35, COLORS.armyDark, 0, 0.2, -0.95));
    plane.add(box(0.08, 0.5, 0.35, COLORS.armyDark, 0, 0.35, -0.95));
    plane.position.set(0, 0.6, 0.4);
    g.add(plane);
    return g;
  },
};

export type Side = 'ours' | 'rival';

/** Our army colours → the rival's. */
const RIVAL_SWAP = new Map<number, number>([
  [COLORS.army, COLORS.enemy],
  [COLORS.armyDark, COLORS.enemyDark],
]);

export function buildingModel(assetId: string, side: Side = 'ours'): THREE.Group {
  const build = BUILDERS[assetId];
  const g = build ? build() : new THREE.Group().add(box(3, 2, 3, COLORS.concrete));
  if (side === 'rival') {
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const swap = RIVAL_SWAP.get((m.material as THREE.MeshLambertMaterial).color.getHex());
      if (swap !== undefined) m.material = mat(swap);
    });
    // Mirror so the rival's buildings face the battlefield too.
    g.rotation.y = Math.PI;
  }
  g.userData.assetId = assetId;
  return g;
}

/** An empty construction plot with a sign, for locked buildings. */
export function lockedPlot(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(4.2, 0.12, 4.2, COLORS.sand));
  for (const [x, z] of [
    [-1.9, -1.9],
    [1.9, -1.9],
    [-1.9, 1.9],
    [1.9, 1.9],
  ] as const) {
    g.add(box(0.15, 0.7, 0.15, COLORS.wood, x, 0.1, z));
  }
  for (let i = 0; i < 6; i++) {
    const stripe = box(
      0.5,
      0.12,
      0.12,
      i % 2 ? COLORS.gold : COLORS.black,
      -1.25 + i * 0.5,
      0.55,
      1.9,
    );
    g.add(stripe);
  }
  return g;
}

export function sandbagWall(width: number, color: number = COLORS.canvas): THREE.Group {
  const g = new THREE.Group();
  const n = Math.round(width / 0.7);
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < n; i++) {
      g.add(box(0.68, 0.38, 0.5, color, -width / 2 + i * 0.7 + (row ? 0.35 : 0), row * 0.38, 0));
    }
  }
  return g;
}

export function tree(): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.18, 0.6, COLORS.wood, 0, 0, 0, 6));
  g.add(mesh(new THREE.ConeGeometry(1.1, 1.8, 7), 0xc9d6e8, 0, 1.4, 0));
  g.add(mesh(new THREE.ConeGeometry(0.8, 1.4, 7), 0xdde6f2, 0, 2.3, 0));
  return g;
}

export { tank };
