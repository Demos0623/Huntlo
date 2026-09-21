import * as THREE from 'three';
import { CollisionWorld, Ramp } from '../Movement/Collision.js';
import { Target } from '../Combat/Target.js';
import { WeaponPickup } from '../Combat/WeaponPickup.js';

export function buildTestMap(scene) {
  const world = new CollisionWorld();
  const colliders = [];
  const targets = [];

  const AREA = 60;

  const box = (cx, cy, cz, sx, sy, sz, color, opts = {}) => {
    const geo = new THREE.BoxGeometry(sx, sy, sz);
    const mat = new THREE.MeshStandardMaterial({
      color, roughness: opts.rough ?? 0.9, metalness: 0.0,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(cx, cy, cz);
    m.castShadow = !opts.noShadow;
    m.receiveShadow = true;
    scene.add(m);
    colliders.push(m);
    world.addBox(
      { x: cx - sx / 2, y: cy - sy / 2, z: cz - sz / 2 },
      { x: cx + sx / 2, y: cy + sy / 2, z: cz + sz / 2 }
    );
    return m;
  };

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(AREA * 2, 1, AREA * 2),
    new THREE.MeshStandardMaterial({ color: 0x20242c, roughness: 1 })
  );
  floor.position.set(0, -0.5, 0);
  floor.receiveShadow = true;
  scene.add(floor);
  colliders.push(floor);
  world.addBox({ x: -AREA, y: -1, z: -AREA }, { x: AREA, y: 0, z: AREA });

  const grid = new THREE.GridHelper(AREA * 2, AREA, 0x33465e, 0x2a3444);
  grid.position.y = 0.01;
  scene.add(grid);

  const WH = 4, WT = 1;
  box(0, WH / 2, -AREA, AREA * 2, WH, WT, 0x2c3340, { noShadow: true });
  box(0, WH / 2, AREA, AREA * 2, WH, WT, 0x2c3340, { noShadow: true });
  box(-AREA, WH / 2, 0, WT, WH, AREA * 2, 0x2c3340, { noShadow: true });
  box(AREA, WH / 2, 0, WT, WH, AREA * 2, 0x2c3340, { noShadow: true });

  const ramp = (cx, cz, w, len, yHigh, axis, color) => {
    const angle = Math.atan2(yHigh, len);
    const geo = new THREE.BoxGeometry(axis === 'z' ? w : len, 0.2, axis === 'z' ? len : w);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
    const m = new THREE.Mesh(geo, mat);

    m.position.set(cx, yHigh / 2, cz);
    if (axis === 'z') m.rotation.x = -angle; else m.rotation.z = angle;
    m.receiveShadow = true; m.castShadow = true;
    scene.add(m);
    colliders.push(m);
    if (axis === 'z') {
      world.addRamp(new Ramp(cx - w / 2, cx + w / 2, cz - len / 2, cz + len / 2, 0, yHigh, 'z'));

      box(cx, yHigh, cz + len / 2 + 3, w, yHigh, 6, color, { noShadow: true });
    }
    return m;
  };
  ramp(-16, -14, 6, 12, 1.8, 'z', 0x394a63);
  ramp(-28, -14, 6, 8, 2.6, 'z', 0x3d4c66);

  const stairs = (x0, z0, steps, riser, tread, w, color) => {
    for (let i = 0; i < steps; i++) {
      const h = riser * (i + 1);
      box(x0, h / 2, z0 + tread * (i + 0.5), w, h, tread, color, { noShadow: true });
    }
  };
  stairs(16, -8, 6, 0.35, 1.2, 5, 0x39445a);

  box(16, 1.05, 3.0, 5, 2.1, 3, 0x323c50, { noShadow: true });

  box(-6, 0.6, 6, 2, 1.2, 2, 0x4a3a3a);
  box(6, 0.6, 6, 2, 1.2, 2, 0x4a3a3a);
  box(0, 1.5, 12, 3, 3, 1, 0x463a4a);
  box(-3, 1.5, 20, 1, 3, 6, 0x463a4a);
  box(3, 1.5, 20, 1, 3, 6, 0x463a4a);

  for (let i = -3; i <= 3; i++) {
    box(i * 3, 0.15, -4, 0.25, 0.3, 0.25, 0x54607a, { noShadow: true });
  }

  const addTarget = (x, z, label) => {
    const t = new Target(scene, new THREE.Vector3(x, 0, z), { label });
    targets.push(t);
    colliders.push(t.mesh);
    return t;
  };
  addTarget(0, -18, 'near');
  addTarget(-4, -30, 'mid');
  addTarget(4, -30, 'mid');
  addTarget(0, -45, 'far');
  addTarget(-10, -45, 'far');
  addTarget(10, -45, 'far');
  addTarget(16, 5.5, 'ledge');
  addTarget(-22, 5, 'slope-top');

  const pickups = [
    new WeaponPickup(scene, new THREE.Vector3(-6, 0, 4), 'requiem'),
    new WeaponPickup(scene, new THREE.Vector3(6, 0, 4), 'vantage'),
    new WeaponPickup(scene, new THREE.Vector3(0, 0, 13), 'marker'),
  ];

  return { world, colliders, targets, pickups, spawn: new THREE.Vector3(0, 0, 8) };
}
