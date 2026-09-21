import * as THREE from 'three';
import { mergeGeometries } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { CollisionWorld } from '../Movement/Collision.js';
import { isPerfMode } from '../perf.js';

const PERF = isPerfMode();

const _texLoader = new THREE.TextureLoader();
function _loadTex(url, srgb) {
  const t = _texLoader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const _sunlineTex = (file, srgb = false) =>
  _loadTex(new URL(`../Textures/Sunline/${file}`, import.meta.url).href, srgb);

function _sunlineMaterial({ color, diff, normal, rough, metalness = 0 }) {
  if (PERF) return new THREE.MeshLambertMaterial({ color });
  return new THREE.MeshStandardMaterial({
    map: _sunlineTex(diff, true),
    normalMap: _sunlineTex(normal),
    roughnessMap: _sunlineTex(rough),
    color, roughness: 0.84, metalness,
  });
}

// CC0 1K PBR set selected for Sunline. The source and license are recorded
// alongside the downloaded maps in Textures/Sunline/LICENSES.md.
const SUNLINE_MATERIALS = {
  floor: _sunlineMaterial({
    color: 0x8da19a, diff: 'cobblestone_diff.jpg', normal: 'cobblestone_nor.jpg', rough: 'cobblestone_rough.jpg',
  }),
  plaster: _sunlineMaterial({
    color: 0xc4c9ce, diff: 'plaster_diff.jpg', normal: 'plaster_nor.jpg', rough: 'plaster_rough.jpg',
  }),
  wood: _sunlineMaterial({
    color: 0xa8754f, diff: 'wood_diff.jpg', normal: 'wood_nor.jpg', rough: 'wood_rough.jpg',
  }),
  metal: _sunlineMaterial({
    color: 0x759089, diff: 'metal_diff.jpg', normal: 'metal_nor.jpg', rough: 'metal_rough.jpg', metalness: 0.62,
  }),
};

const SURFACE_MAT = PERF
  ? new THREE.MeshLambertMaterial({ color: 0x8a9099 })
  : new THREE.MeshStandardMaterial({
      map: _loadTex('Valo/Textures/Citadel/plaster_diff_1k.jpg', true),
      normalMap: _loadTex('Valo/Textures/Citadel/plaster_nor_1k.jpg', false),
      roughnessMap: _loadTex('Valo/Textures/Citadel/plaster_rough_1k.jpg', false),
      color: 0xc8c0b4, roughness: 1.0, metalness: 0.0,
    });

const FLOOR_MAT = PERF
  ? new THREE.MeshLambertMaterial({ color: 0x9aa0a6 })
  : new THREE.MeshStandardMaterial({
      map: _loadTex('Valo/Textures/Citadel/cobblestone_diff_1k.jpg', true),
      normalMap: _loadTex('Valo/Textures/Citadel/cobblestone_nor_1k.jpg', false),
      roughnessMap: _loadTex('Valo/Textures/Citadel/cobblestone_rough_1k.jpg', false),
      color: 0xd4d0c6, roughness: 1.0, metalness: 0.0,
    });

const COVER_MAT = PERF
  ? new THREE.MeshLambertMaterial({ color: 0x8c6b49 })
  : new THREE.MeshStandardMaterial({
      map: _loadTex('Valo/Textures/Citadel/wood_diff_1k.jpg', true),
      normalMap: _loadTex('Valo/Textures/Citadel/wood_nor_1k.jpg', false),
      roughnessMap: _loadTex('Valo/Textures/Citadel/wood_rough_1k.jpg', false),
      color: 0x9a7650, roughness: 0.88, metalness: 0.0,
    });
const TILE = 3.0;
const FLOOR_TILE = 2.2;

function tileUV(geo, rx, ry) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * rx, uv.getY(i) * ry);
  uv.needsUpdate = true;
}

function worldPlanarUV(geo, cx, cz, scale) {
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (pos.getX(i) + cx) / scale, (pos.getZ(i) + cz) / scale);
  }
  uv.needsUpdate = true;
}

// Rebuild a mesh's UVs by box-projecting world-space position, so a tiling
// texture repeats every `tile` metres regardless of the authored GLB UVs. The
// Higgsfield export maps a single 0..1 tile across a whole wall (a 66 m wall
// gets one stretched, blurry copy) and some meshes have no UVs at all, so a
// shared material with repeat=1 can't tile. Baking metre-scaled UVs into each
// geometry fixes the density for every wall while keeping one shared material.
const _uvP = new THREE.Vector3(), _uvN = new THREE.Vector3(), _uvNM = new THREE.Matrix3();
function boxProjectUV(mesh, tile) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  if (!pos) return;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  mesh.updateWorldMatrix(true, false);
  _uvNM.getNormalMatrix(mesh.matrixWorld);
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    _uvP.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    _uvN.fromBufferAttribute(nrm, i).applyMatrix3(_uvNM);
    const ax = Math.abs(_uvN.x), ay = Math.abs(_uvN.y), az = Math.abs(_uvN.z);
    let u, v;
    if (ay >= ax && ay >= az) { u = _uvP.x; v = _uvP.z; }       // up/down face
    else if (ax >= az) { u = _uvP.z; v = _uvP.y; }              // x-facing wall
    else { u = _uvP.x; v = _uvP.y; }                            // z-facing wall
    uv[i * 2] = u / tile;
    uv[i * 2 + 1] = v / tile;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

const IMG = { cx: 391, cy: 410 };
const SCALE = 0.075;
const wx = (px) => (px - IMG.cx) * SCALE;
const wz = (py) => (py - IMG.cy) * SCALE;

// Zones are deliberately distinct in both the world and the minimap.  The old
// neutral floor made the three parts of the map read as one large grey space.
const ZONE_COLOR = { teal: 0x2f8178, gray: 0x7395a8, mauve: 0x9b515d };

function zoneFloorMaterial(zone) {
  const color = ZONE_COLOR[zone] || 0x9aa0a6;
  if (PERF) return new THREE.MeshLambertMaterial({ color });
  return new THREE.MeshStandardMaterial({
    map: FLOOR_MAT.map,
    normalMap: FLOOR_MAT.normalMap,
    roughnessMap: FLOOR_MAT.roughnessMap,
    color,
    roughness: 0.96,
    metalness: 0.0,
  });
}

// CITADEL — three readable routes around a central market.  Rectangles form
// the walkable footprint; their outside edges are generated into walls below.
// North is a warm defender courtyard, the middle is cool stone, and the south
// becomes a garden-and-canal attacker approach.
const RECTS = [
  // North court and the two elevated approaches.
  ['mauve', 285, 65, 505, 170],
  ['mauve', 145, 125, 285, 230],
  ['mauve', 505, 125, 650, 230],
  ['mauve', 250, 165, 370, 315],
  ['mauve', 420, 165, 540, 315],

  // West lane: arches, a compact courtyard, then a garden connector.
  ['mauve', 70, 215, 175, 390],
  ['gray', 145, 340, 285, 455],
  ['gray', 90, 430, 225, 555],
  ['teal', 200, 505, 355, 605],

  // East lane is intentionally more open, with a longer exterior sightline.
  ['mauve', 615, 215, 725, 385],
  ['gray', 505, 335, 650, 450],
  ['gray', 565, 430, 705, 555],
  ['teal', 445, 505, 595, 605],

  // A single open market room gives Mid a wide, legible rotation instead of
  // a maze of short interior walls.
  ['gray', 270, 290, 520, 470],

  // Lower canal: two walkways flank a visible water channel.
  ['teal', 245, 585, 355, 735],
  ['teal', 445, 585, 555, 735],
  ['teal', 315, 540, 485, 615],
  ['teal', 275, 705, 525, 790],
];

const CELL = 1.0;
const MARGIN = 0.8;

// Sunline Arena is authored in Higgsfield 3D Jutsu and exported as a GLB.
// The compact gameplay definition below deliberately mirrors the authored
// geometry: visual mesh loading stays asynchronous, while movement, hits,
// smoke occlusion and the minimap have their exact data immediately.
function buildSunlineArena(scene) {
  const world = new CollisionWorld();
  const colliders = [], targets = [], walls = [], covers = [];
  const manualWorldBoxes = [], manualCollisionMeshes = [];
  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });
  const areas = [
    { cx: 0, cz: 0, w: 50.97, d: 28.85, zone: 'gray' },
    { cx: 0, cz: 25.97, w: 49.73, d: 23.01, zone: 'mauve' },
    { cx: 0, cz: -25.07, w: 48.61, d: 21.29, zone: 'teal' },
  ];
  const bounds = { minX: -25, maxX: 25, minZ: -33, maxZ: 33 };

  // The arena foundation is the only walkable volume. Every wall and prop is
  // explicitly non-walkable, so bumping a wall cannot turn into an unwanted
  // climb or step.
  world.addBox(
    { x: bounds.minX, y: -1, z: bounds.minZ },
    { x: bounds.maxX, y: 0.06, z: bounds.maxZ }
  );

  const rayMat = new THREE.MeshBasicMaterial({ visible: false });
  const solid = (name, cx, cz, w, d, h, cover = false) => {
    world.addBox(
      { x: cx - w / 2, y: 0, z: cz - d / 2 },
      { x: cx + w / 2, y: h, z: cz + d / 2 },
      { walkable: false }
    );
    manualWorldBoxes.push(world.boxes[world.boxes.length - 1]);
    // Invisible meshes give bullets and smoke the same blocking shape as a
    // player sees in the imported model.
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), rayMat);
    mesh.name = `Sunline collision — ${name}`;
    mesh.position.set(cx, h / 2, cz);
    mesh.updateMatrixWorld(true);
    colliders.push(mesh);
    manualCollisionMeshes.push(mesh);
    if (cover) covers.push({ cx, cz, w, d });
  };
  const wall = (name, cx, cz, w, d) => {
    solid(name, cx, cz, w, d, 6.4);
    if (w >= d) walls.push({ x1: cx - w / 2, z1: cz, x2: cx + w / 2, z2: cz });
    else walls.push({ x1: cx, z1: cz - d / 2, x2: cx, z2: cz + d / 2 });
  };

  wall('west perimeter', -24.5, 0, 1, 66);
  wall('east perimeter', 24.5, 0, 1, 66);
  wall('north perimeter', 0, 32.5, 50, 1);
  wall('south perimeter', 0, -32.5, 50, 1);

  // Revision 111 adds authored inner walls that reshape the site entries and
  // side alleys. These values come directly from the current Higgs scene.
  const currentInteriorWalls = [
    ['west north outer', -21.24, 10, 5.52, 0.8, 3.87],
    ['west south outer', -21.24, -10, 5.52, 0.8, 3.87],
    ['east north outer', 23.195, 10, 5.52, 0.8, 3.87],
    ['east north inner', 11.013, 10, 9.155, 0.8, 3.87],
    ['east south outer', 21.24, -10, 5.52, 0.8, 3.87],
    ['east south inner', 10.25, -10, 6.5, 0.8, 3.87],
    ['west alley north', -21.5, 22.5, 0.8, 19, 3.87],
    ['west alley south', -21.5, -22.5, 0.8, 19, 3.87],
    ['east alley north', 6.597, 5.441, 0.8, 9.925, 3.87],
    ['east alley south', 21.5, -22.5, 0.8, 19, 3.87],
    ['west north inner', -10.25, 10, 6.5, 0.8, 3.87],
    ['west south inner', -10.25, -10, 6.5, 0.8, 3.87],
  ];
  for (const [name, x, z, w, d, h] of currentInteriorWalls) {
    solid(name, x, z, w, d, h);
    if (w >= d) walls.push({ x1: x - w / 2, z1: z, x2: x + w / 2, z2: z });
    else walls.push({ x1: x, z1: z - d / 2, x2: x, z2: z + d / 2 });
  }

  // Side-route frames: columns block, overhead lintels stay above player height.
  for (const z of [-10, 10]) {
    for (const x of [-16, 16]) {
      solid(`route frame left ${x}/${z}`, x - 2.1, z, 0.75, 0.75, 4.6);
      solid(`route frame right ${x}/${z}`, x + 2.1, z, 0.75, 0.75, 4.6);
    }
  }

  const addCover = (name, x, z, w, d, h) => solid(name, x, z, w, d, h, true);
  addCover('mid west cover', -7.7, -2.8, 3, 5.2, 1.6);
  addCover('mid east cover', 7.7, 3, 3, 5.2, 1.6);
  addCover('mid west planter', -9.8, 7.5, 2.3, 2.3, 1.5);
  addCover('mid east planter', 9.8, -7.5, 2.3, 2.3, 1.5);
  addCover('north back crate', 0, 27.5, 5.4, 2.3, 2.55);
  addCover('north left box', -9, 20.5, 3.4, 3.4, 2.25);
  addCover('north right box', 9, 23, 4, 2.6, 1.8);
  addCover('north entry box', -3.8, 16.8, 2.6, 3.2, 1.5);
  addCover('south back crate', 0, -27.2, 4.2, 3, 2.65);
  addCover('south left box', -8.8, -23, 4, 2.5, 1.8);
  addCover('south right box', 9, -20.4, 3.4, 3.4, 2.3);
  addCover('south entry box', 3.8, -16.8, 2.6, 3.2, 1.5);
  for (const side of [-1, 1]) {
    for (const [z, offset] of [[-18, 1.1], [-4, -1], [18, 0.8]]) {
      addCover(`side cover ${side}/${z}`, side * (17.5 + offset), z, 2.6, 4.5, 1.95);
    }
  }
  solid('north spawn windbreak', 0, 29.2, 10, 0.7, 2.4);
  solid('south spawn windbreak', 0, -29.2, 10, 0.7, 2.4);

  const loader = new GLTFLoader();
  loader.load(
    new URL('../Models/sunline-arena.glb?rev=20260921-010118', import.meta.url).href,
    (gltf) => {
      const arena = gltf.scene;
      arena.name = 'Sunline Arena — Higgsfield import';
      // Blender's forward axis is opposite Huntlo's world Z.  Mirroring the
      // imported hierarchy once keeps the authored GLB aligned with the
      // collision, spawn, smoke and minimap coordinates declared above.
      arena.scale.z = -1;
      arena.traverse((object) => {
        if (object.isMesh) {
          object.castShadow = true;
          object.receiveShadow = true;
          const name = object.name;
          // Material zones follow the authored object names, so the imported
          // map gains the new look without changing its model or collision.
          // Give every imported render surface a readable PBR material first.
          // Some Higgsfield mesh names do not follow the original naming
          // convention; leaving those untouched preserves their near-black
          // export material and makes whole walls look broken. Specific
          // surfaces below then replace this neutral plaster fallback.
          object.material = SUNLINE_MATERIALS.plaster;
          // Each gets world-scaled UVs (the GLB's own UVs stretch one tile over
          // an entire wall), with a per-surface tile size in metres.
          let tile = 2.6;
          if (/^(?:Arena_Foundation|Central_Open_Mid|North_Site_Platform|South_Site_Platform)/.test(name)) {
            object.material = SUNLINE_MATERIALS.floor; tile = 3.2;
          } else if (/Cover|_base/.test(name)) {
            object.material = SUNLINE_MATERIALS.wood; tile = 2.0;
          } else if (/^(?:Frame|Mid_[HV]_)/.test(name)) {
            object.material = SUNLINE_MATERIALS.metal; tile = 2.2;
          } else if (/^(?:Wall_|(?:East|West|North|South)_Perimeter|Spawn_Windbreak|Web[ _]cube)/.test(name)) {
            object.material = SUNLINE_MATERIALS.plaster; tile = 2.6;
          }
          if (tile) boxProjectUV(object, tile);
        }
      });
      scene.add(arena);

      // The old hand-authored boxes were only a loading fallback. Now that the
      // exact GLB is present, remove them so an out-of-date approximation can
      // never create an invisible wall.
      for (const box of manualWorldBoxes) {
        const index = world.boxes.indexOf(box);
        if (index >= 0) world.boxes.splice(index, 1);
      }
      for (const mesh of manualCollisionMeshes) {
        const index = colliders.indexOf(mesh);
        if (index >= 0) colliders.splice(index, 1);
      }

      // Use the imported render geometry as the authoritative hitscan surface.
      // The earlier hand-authored boxes cover the routes, but cannot include a
      // newly added Higgs wall (such as the spawn wall) until the map code is
      // updated.  Registering the actual arena means bullets always stop on
      // the wall a player can see.
      colliders.push(arena);

      // Movement needs simple solid volumes rather than triangle tests. Only
      // named, visibly solid map pieces become movement blockers. Bounding
      // every tall mesh turns open arches and decorative geometry into large
      // invisible boxes, so those must stay out of the collision world.
      //
      // These are PREFIX matches: the authored meshes are `Wall_East_North_Inner`,
      // `Spawn_Windbreak_292`, `Web_cube_2`, etc. (an earlier `$`-anchored version
      // only matched the literal stems, so every inner wall, windbreak and crate
      // silently lost its player collision while still stopping bullets). Excluded:
      // `FrameTop_*` overhead lintels (pass under), `*_cap` coping above the walls,
      // and the flat floor pieces (Foundation / Platform / Central_Open_Mid /
      // Mid_H_* / Mid_V_*), which the height filter below also rejects.
      arena.updateMatrixWorld(true);
      const visualBounds = new THREE.Box3();
      const isPlayerBlocker = (name) =>
        /^(?:Wall_|(?:East|West|North|South)_Perimeter|Spawn_Windbreak|Frame[LR]_|Web_cube|.*Cover.*|.*_base)/.test(name)
        && !/^FrameTop/.test(name) && !/_cap$/.test(name);
      arena.traverse((object) => {
        if (!object.isMesh || !isPlayerBlocker(object.name)) return;
        visualBounds.setFromObject(object);
        const h = visualBounds.max.y - visualBounds.min.y;
        if (h < 0.6 || visualBounds.max.y <= 0.25) return;
        world.addBox(visualBounds.min.clone(), visualBounds.max.clone(), { walkable: false });
      });
      resolveReady({ arena, loaded: true });
    },
    undefined,
    (error) => {
      console.error('Could not load Sunline Arena:', error);
      resolveReady({ arena: null, loaded: false, error: error?.message || String(error) });
    }
  );

  const attackerSpawn = new THREE.Vector3(0, 0, -28);
  const defenderSpawn = new THREE.Vector3(0, 0, 28);
  return {
    world, colliders, targets, areas, walls, covers, bounds, ready,
    spawn: attackerSpawn,
    spawns: {
      attacker: { pos: attackerSpawn, yaw: Math.PI },
      defender: { pos: defenderSpawn, yaw: 0 },
    },
    materials: {},
  };
}

export function buildArena(scene) {
  return buildSunlineArena(scene);

  const world = new CollisionWorld();
  const colliders = [];
  const targets = [];
  const areas = [];
  const walls = [];
  const covers = [];

  const wrects = RECTS.map(([zone, x1, y1, x2, y2]) => ({
    zone, x1: wx(x1), z1: wz(y1), x2: wx(x2), z2: wz(y2),
  }));

  // Build the floor from non-overlapping cells instead of the authored
  // rectangles directly.  Several routes intentionally intersect, but two
  // coplanar floor meshes at an intersection cause texture z-fighting.
  const floorGeos = {};
  const xCuts = [...new Set(wrects.flatMap((r) => [r.x1, r.x2]))].sort((a, b) => a - b);
  const zCuts = [...new Set(wrects.flatMap((r) => [r.z1, r.z2]))].sort((a, b) => a - b);
  const zonePriority = { mauve: 1, gray: 2, teal: 3 };

  for (let xi = 0; xi < xCuts.length - 1; xi++) {
    for (let zi = 0; zi < zCuts.length - 1; zi++) {
      const x1 = xCuts[xi], x2 = xCuts[xi + 1];
      const z1 = zCuts[zi], z2 = zCuts[zi + 1];
      const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
      const covered = wrects.filter((r) => cx > r.x1 && cx < r.x2 && cz > r.z1 && cz < r.z2);
      if (!covered.length) continue;

      // At a zone transition, the more interior route owns the shared cell:
      // Mid over North Court, then Canal over Mid.
      const zone = covered.reduce((best, r) =>
        zonePriority[r.zone] > zonePriority[best] ? r.zone : best, covered[0].zone);
      const w = x2 - x1, d = z2 - z1;
      const geo = new THREE.BoxGeometry(w, 0.1, d);
      worldPlanarUV(geo, cx, cz, FLOOR_TILE);
      geo.translate(cx, 0.0, cz);
      (floorGeos[zone] ||= []).push(geo);
      world.addBox({ x: x1, y: -1, z: z1 }, { x: x2, y: 0.05, z: z2 });
      areas.push({ cx, cz, w, d, zone });
    }
  }
  for (const [zone, geos] of Object.entries(floorGeos)) {
    const floorMesh = new THREE.Mesh(mergeGeometries(geos), zoneFloorMaterial(zone));
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);
  }

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const r of wrects) {
    minX = Math.min(minX, r.x1); maxX = Math.max(maxX, r.x2);
    minZ = Math.min(minZ, r.z1); maxZ = Math.max(maxZ, r.z2);
  }
  minX -= CELL; minZ -= CELL; maxX += CELL; maxZ += CELL;

  const bpad = 6;
  const bw = (maxX - minX) + bpad * 2, bd = (maxZ - minZ) + bpad * 2;
  const baseMesh = new THREE.Mesh(
    new THREE.BoxGeometry(bw, 1, bd),
    new THREE.MeshStandardMaterial({ color: 0x1e232b, roughness: 1 })
  );
  baseMesh.position.set((minX + maxX) / 2, -0.53, (minZ + maxZ) / 2);
  baseMesh.receiveShadow = true;
  scene.add(baseMesh);
  world.addBox({ x: minX - bpad, y: -1, z: minZ - bpad }, { x: maxX + bpad, y: 0, z: maxZ + bpad });

  // A shallow visual canal divides the southern route.  The flanking paths
  // remain fully walkable; the small bridge at the north end is part of RECTS.
  const canal = new THREE.Mesh(
    new THREE.PlaneGeometry((445 - 355) * SCALE, (735 - 555) * SCALE),
    new THREE.MeshStandardMaterial({ color: 0x1d7184, roughness: 0.28, metalness: 0.12 })
  );
  canal.rotation.x = -Math.PI / 2;
  canal.position.set(wx(400), -0.02, wz(645));
  canal.receiveShadow = true;
  scene.add(canal);

  // A pale stone inlay is the visual "spine" of Mid: it reads from both
  // entrances and leads directly through the market without changing collision.
  const midSpineMat = PERF
    ? new THREE.MeshLambertMaterial({ color: 0xb9d4d5 })
    : new THREE.MeshStandardMaterial({ color: 0xb9d4d5, roughness: 0.78, metalness: 0.03 });
  const midThresholdMat = PERF
    ? new THREE.MeshLambertMaterial({ color: 0xd8b878 })
    : new THREE.MeshStandardMaterial({ color: 0xd8b878, roughness: 0.74, metalness: 0.04 });
  const midInlay = (px, py, width, depth, material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width * SCALE, 0.016, depth * SCALE), material);
    mesh.position.set(wx(px), 0.058, wz(py));
    mesh.receiveShadow = true;
    scene.add(mesh);
  };
  midInlay(395, 380, 48, 178, midSpineMat);
  midInlay(395, 312, 118, 8, midThresholdMat);
  midInlay(395, 452, 118, 8, midThresholdMat);

  const gw = Math.ceil((maxX - minX) / CELL);
  const gh = Math.ceil((maxZ - minZ) / CELL);
  const occ = (i, j) => {
    if (i < 0 || j < 0 || i >= gw || j >= gh) return false;
    const cx = minX + (i + 0.5) * CELL, cz = minZ + (j + 0.5) * CELL;
    for (const r of wrects) {
      if (cx >= r.x1 - MARGIN && cx <= r.x2 + MARGIN && cz >= r.z1 - MARGIN && cz <= r.z2 + MARGIN) return true;
    }
    return false;
  };
  const grid = [];
  for (let i = 0; i < gw; i++) { grid[i] = []; for (let j = 0; j < gh; j++) grid[i][j] = occ(i, j); }

  const WALL_H = 4.2, WT = 0.35;
  const capMat = new THREE.MeshStandardMaterial({ color: 0x555c67, roughness: 0.9 });
  const wallGeos = [], capGeos = [];
  function wallBox(cx, cz, w, d) {
    const geo = new THREE.BoxGeometry(w, WALL_H, d);
    tileUV(geo, Math.max(w, d) / TILE, WALL_H / TILE);
    geo.translate(cx, WALL_H / 2, cz);
    wallGeos.push(geo);
    const cap = new THREE.BoxGeometry(w + 0.05, 0.15, d + 0.05);
    cap.translate(cx, WALL_H, cz);
    capGeos.push(cap);
    world.addBox(
      { x: cx - w / 2, y: 0, z: cz - d / 2 },
      { x: cx + w / 2, y: WALL_H, z: cz + d / 2 },
      { walkable: false }
    );

    if (w >= d) walls.push({ x1: cx - w / 2, z1: cz, x2: cx + w / 2, z2: cz });
    else walls.push({ x1: cx, z1: cz - d / 2, x2: cx, z2: cz + d / 2 });
  }

  function finalizeWalls() {
    if (!wallGeos.length) return;
    const wallMesh = new THREE.Mesh(mergeGeometries(wallGeos), SURFACE_MAT);
    wallMesh.castShadow = true; wallMesh.receiveShadow = true;
    scene.add(wallMesh);
    colliders.push(wallMesh);
    const capMesh = new THREE.Mesh(mergeGeometries(capGeos), capMat);
    scene.add(capMesh);
  }

  for (let e = 0; e <= gw; e++) {
    let runStart = -1;
    for (let j = 0; j <= gh; j++) {
      const left = e - 1 >= 0 && j < gh ? grid[e - 1][j] : false;
      const right = e < gw && j < gh ? grid[e][j] : false;
      const wallHere = j < gh && (left !== right);
      if (wallHere && runStart < 0) runStart = j;
      if (!wallHere && runStart >= 0) {
        const x = minX + e * CELL;
        const z1 = minZ + runStart * CELL, z2 = minZ + j * CELL;
        wallBox(x, (z1 + z2) / 2, WT, (z2 - z1) + WT);
        runStart = -1;
      }
    }
  }

  for (let f = 0; f <= gh; f++) {
    let runStart = -1;
    for (let i = 0; i <= gw; i++) {
      const up = f - 1 >= 0 && i < gw ? grid[i][f - 1] : false;
      const down = f < gh && i < gw ? grid[i][f] : false;
      const wallHere = i < gw && (up !== down);
      if (wallHere && runStart < 0) runStart = i;
      if (!wallHere && runStart >= 0) {
        const z = minZ + f * CELL;
        const x1 = minX + runStart * CELL, x2 = minX + i * CELL;
        wallBox((x1 + x2) / 2, z, (x2 - x1) + WT, WT);
        runStart = -1;
      }
    }
  }

  // Mid has no interior divider walls. The market cover below supplies the
  // fight geometry while preserving broad rotations through the centre.
  wallBox(wx(170), wz(465), (225 - 125) * SCALE, WT);
  wallBox(wx(620), wz(465), (675 - 575) * SCALE, WT);
  finalizeWalls();

  const coverGeos = {};
  function crate(cx, cz, w, d, h = 1.2, color = 0x4a3f36) {
    const geo = new THREE.BoxGeometry(w, h, d);
    geo.translate(cx, h / 2, cz);
    (coverGeos[color] ||= []).push(geo);
    world.addBox({ x: cx - w / 2, y: 0, z: cz - d / 2 }, { x: cx + w / 2, y: h, z: cz + d / 2 });
    covers.push({ cx, cz, w, d });
  }
  function finalizeCover() {
    for (const hex in coverGeos) {
      const mat = PERF
        ? new THREE.MeshLambertMaterial({ color: +hex })
        : new THREE.MeshStandardMaterial({
            map: COVER_MAT.map,
            normalMap: COVER_MAT.normalMap,
            roughnessMap: COVER_MAT.roughnessMap,
            color: +hex,
            roughness: 0.88,
            metalness: 0.0,
          });
      const m = new THREE.Mesh(mergeGeometries(coverGeos[hex]), mat);
      m.castShadow = true; m.receiveShadow = true; scene.add(m);
      colliders.push(m);
    }
  }

  const WOOD = 0x5b4634, STONE = 0x657487, CRATE2 = 0x806143;
  const pillar = (px, py, h = 2.6, s = 1.0) => crate(wx(px), wz(py), s, s, h, STONE);

  // North court: chunky cover creates short, readable angles from both
  // approaches.  West is tighter; east gives a longer exterior peek.
  crate(wx(340), wz(120), 2.5, 1.5, 1.15, CRATE2);
  crate(wx(445), wz(120), 1.6, 2.5, 1.15, WOOD);
  pillar(245, 190, 2.7); pillar(545, 190, 2.7);
  crate(wx(190), wz(175), 2.0, 1.4, 1.0, WOOD);
  crate(wx(600), wz(180), 1.3, 2.5, 1.2, CRATE2);

  // West arches and east terrace.
  crate(wx(115), wz(285), 1.6, 2.2, 1.15, CRATE2);
  pillar(155, 350, 2.5);
  crate(wx(220), wz(395), 2.2, 1.3, 1.0, WOOD);
  crate(wx(145), wz(495), 1.8, 1.8, 1.05, CRATE2);
  crate(wx(665), wz(285), 1.8, 2.6, 1.15, WOOD);
  pillar(630, 360, 2.5);
  crate(wx(550), wz(395), 2.1, 1.3, 1.0, CRATE2);
  crate(wx(650), wz(495), 1.6, 1.8, 1.05, WOOD);

  // The fountain sits in the eastern market pocket, leaving a clean direct
  // passage through the middle for rotations and first engagements.
  crate(wx(480), wz(382), 2.1, 2.1, 0.9, 0x3d6f78);
  crate(wx(340), wz(322), 1.5, 1.0, 1.0, CRATE2);
  crate(wx(450), wz(322), 1.0, 1.5, 1.0, CRATE2);
  crate(wx(340), wz(445), 1.5, 1.0, 1.0, WOOD);
  crate(wx(450), wz(445), 1.0, 1.5, 1.0, WOOD);

  // Canal route cover leaves both banks navigable while preventing a single
  // uninterrupted sightline across the entire southern half.
  crate(wx(290), wz(625), 1.5, 2.4, 1.1, WOOD);
  crate(wx(505), wz(625), 2.4, 1.5, 1.1, WOOD);
  pillar(330, 690, 2.4); pillar(470, 690, 2.4);
  crate(wx(295), wz(750), 2.3, 1.4, 1.0, CRATE2);
  crate(wx(495), wz(750), 1.4, 2.3, 1.0, CRATE2);
  finalizeCover();

  const attackerSpawn = new THREE.Vector3(wx(350), 0, wz(748));
  const defenderSpawn = new THREE.Vector3(wx(395), 0, wz(105));
  return {
    world, colliders, targets,
    spawn: attackerSpawn,
    spawns: {
      attacker: { pos: attackerSpawn, yaw: 0 },
      defender: { pos: defenderSpawn, yaw: Math.PI },
    },
    areas, walls, covers, bounds: { minX, maxX, minZ, maxZ },
    materials: { floor: FLOOR_MAT, wall: SURFACE_MAT },
  };
}
