import * as THREE from 'three';

const GREEN = 0x43a047;
const RED = 0xe53935;
const MAX_UNITS = 400;

/**
 * Placeholder battlefield (phase 0): snowy ground, a sand road, our squad at the bottom and the
 * current enemy formation at the top. Unit counts follow the game state. Phase 3 replaces this
 * with real battles.
 */
export class BattlefieldScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
  private ours: THREE.InstancedMesh;
  private theirs: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private t = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.scene.background = new THREE.Color(0xdfe7ec);
    this.scene.fog = new THREE.Fog(0xdfe7ec, 60, 140);

    this.camera.position.set(0, 42, 34);
    this.camera.lookAt(0, 0, 4);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9fb3c8, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-20, 40, 20);
    sun.castShadow = true;
    sun.shadow.camera.left = -40;
    sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 40;
    sun.shadow.camera.bottom = -40;
    this.scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshLambertMaterial({ color: 0xf2f5f7 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 200),
      new THREE.MeshLambertMaterial({ color: 0xd8c3a0 }),
    );
    road.rotation.x = -Math.PI / 2;
    road.rotation.z = 0.25;
    road.position.y = 0.01;
    road.receiveShadow = true;
    this.scene.add(road);

    this.addTrees();

    const body = new THREE.CapsuleGeometry(0.35, 0.6, 4, 8);
    body.translate(0, 0.65, 0);
    this.ours = this.makeUnits(body, GREEN);
    this.theirs = this.makeUnits(body, RED);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private makeUnits(geo: THREE.BufferGeometry, color: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color }), MAX_UNITS);
    mesh.castShadow = true;
    mesh.count = 0;
    this.scene.add(mesh);
    return mesh;
  }

  private addTrees(): void {
    const cone = new THREE.ConeGeometry(1.4, 4, 7);
    cone.translate(0, 2, 0);
    const trees = new THREE.InstancedMesh(
      cone,
      new THREE.MeshLambertMaterial({ color: 0xc5d3e8 }),
      60,
    );
    trees.castShadow = true;
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < trees.count; i++) {
      const side = i % 2 ? 1 : -1;
      this.dummy.position.set(side * (14 + rand() * 30), 0, -60 + rand() * 100);
      this.dummy.scale.setScalar(0.7 + rand() * 0.8);
      this.dummy.updateMatrix();
      trees.setMatrixAt(i, this.dummy.matrix);
    }
    this.scene.add(trees);
  }

  private layout(mesh: THREE.InstancedMesh, count: number, z: number, facing: number): void {
    const n = Math.min(count, MAX_UNITS);
    const cols = Math.max(4, Math.ceil(Math.sqrt(n * 2)));
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const bob = Math.sin(this.t * 6 + i) * 0.04;
      this.dummy.position.set((col - (cols - 1) / 2) * 1.2, bob, z + facing * row * 1.3);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  }

  /** Unit counts are a visual hint only (log-scaled power). */
  update(dt: number, ourUnits: number, enemyUnits: number): void {
    this.t += dt;
    this.layout(this.ours, ourUnits, 0, 1);
    this.layout(this.theirs, enemyUnits, -18, -1);
    this.renderer.render(this.scene, this.camera);
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Keep the battlefield width visible on narrow portrait screens.
    this.camera.fov = w / h < 0.7 ? 60 : 45;
    this.camera.updateProjectionMatrix();
  }
}
