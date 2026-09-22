import * as THREE from 'three';
import { CollisionWorld } from '../Movement/Collision.js';

// A compact, self-contained practice space placed away from Sunline so the
// player can move between maps without rebuilding the active game scene.
const ORIGIN_X = 135;
const BOUNDS = { minX: 101, maxX: 169, minZ: -28, maxZ: 28 };

export function buildTrainingRange(scene) {
  const world = new CollisionWorld();
  const colliders = [], walls = [], covers = [], areas = [];
  const root = new THREE.Group();
  root.name = 'Huntlo Training Range';
  scene.add(root);

  const floorMat = new THREE.MeshStandardMaterial({ color: 0x344b50, roughness: 0.92, metalness: 0.04 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x59646d, roughness: 0.82, metalness: 0.08 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0xe3b14f, emissive: 0x56360b, emissiveIntensity: 0.28, roughness: 0.45, metalness: 0.36 });
  const laneMat = new THREE.MeshStandardMaterial({ color: 0x426b69, emissive: 0x0a201e, roughness: 0.78 });
  const addSolid = (name, x, z, w, d, h, material = wallMat, wall = false) => {
    world.addBox(
      { x: x - w / 2, y: 0, z: z - d / 2 },
      { x: x + w / 2, y: h, z: z + d / 2 },
      { walkable: false },
    );
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.name = `Training range — ${name}`;
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    colliders.push(mesh);
    if (wall) {
      walls.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    } else if (h <= 2.3) {
      covers.push({ cx: x, cz: z, w, d });
    }
    return mesh;
  };

  // Flat collision floor plus a visually distinct shooting deck.
  world.addBox(
    { x: BOUNDS.minX, y: -1, z: BOUNDS.minZ },
    { x: BOUNDS.maxX, y: 0.06, z: BOUNDS.maxZ },
  );
  areas.push({ cx: ORIGIN_X, cz: 0, w: BOUNDS.maxX - BOUNDS.minX, d: BOUNDS.maxZ - BOUNDS.minZ, zone: 'teal' });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(68, 0.16, 56), floorMat);
  floor.position.set(ORIGIN_X, -0.08, 0);
  floor.receiveShadow = true;
  root.add(floor);

  // Perimeter is deliberately open above the low front wall so the range is
  // bright while all player and bullet boundaries remain visible and solid.
  addSolid('west boundary', BOUNDS.minX + 0.45, 0, 0.9, 56, 4.8, wallMat, true);
  addSolid('east boundary', BOUNDS.maxX - 0.45, 0, 0.9, 56, 4.8, wallMat, true);
  addSolid('back boundary', ORIGIN_X, -27.55, 68, 0.9, 4.8, wallMat, true);
  addSolid('front backstop', ORIGIN_X, 27.55, 68, 0.9, 5.8, wallMat, true);

  // Five luminous lane strips lead from the firing line to the moving bots.
  for (const x of [111, 123, 135, 147, 159]) {
    const lane = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.025, 43), laneMat);
    lane.position.set(x, 0.095, 2.5);
    root.add(lane);
  }
  addSolid('firing line', ORIGIN_X, 17.4, 67, 0.25, 0.12, accentMat);
  addSolid('left bench', 108, 20.5, 5.4, 1.4, 1.25, wallMat);
  addSolid('right bench', 162, 20.5, 5.4, 1.4, 1.25, wallMat);

  // A simple title marker gives the new map a strong landmark without affecting
  // gameplay collision or target visibility.
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 1024; signCanvas.height = 180;
  const ctx = signCanvas.getContext('2d');
  ctx.fillStyle = '#10171d'; ctx.fillRect(0, 0, signCanvas.width, signCanvas.height);
  ctx.strokeStyle = '#e3b14f'; ctx.lineWidth = 10; ctx.strokeRect(8, 8, signCanvas.width - 16, signCanvas.height - 16);
  ctx.fillStyle = '#f8e5a6'; ctx.font = 'bold 92px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('HUNTLO TRAINING RANGE', signCanvas.width / 2, signCanvas.height / 2);
  const signTex = new THREE.CanvasTexture(signCanvas); signTex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(19, 3.35), new THREE.MeshBasicMaterial({ map: signTex }));
  sign.position.set(ORIGIN_X, 4.2, 27.02);
  sign.rotation.y = Math.PI;
  root.add(sign);

  const spawn = new THREE.Vector3(ORIGIN_X, 0, 19.5);
  const botSpawns = [
    new THREE.Vector3(111, 0, 8), new THREE.Vector3(123, 0, 1), new THREE.Vector3(135, 0, -7),
    new THREE.Vector3(147, 0, 3), new THREE.Vector3(159, 0, -11),
  ];
  // A close, stationary target gives players a consistent baseline for aim and DPS practice.
  const staticBotSpawn = new THREE.Vector3(135, 0, 12);
  return {
    root, world, colliders, targets: [], areas, walls, covers, bounds: BOUNDS, botSpawns, staticBotSpawn,
    spawns: {
      attacker: { pos: spawn, yaw: 0 },
      defender: { pos: spawn.clone(), yaw: 0 },
    },
    materials: {},
  };
}
