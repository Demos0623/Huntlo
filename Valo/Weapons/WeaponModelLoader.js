import * as THREE from 'three';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { Weapons } from './WeaponData.js';

export const WEAPON_MODEL = {
  vantage: 'rifle_a', bulldog: 'rifle_b', guardian: 'rifle_c', phantom: 'bullpup',
  marker: 'revolver', classic: 'pistol_a', ghost: 'pistol_b', frenzy: 'pistol_c', shorty: 'shotgun_c',
  stinger: 'smg_a', spectre: 'smg_b', bucky: 'shotgun_a', judge: 'shotgun_b',
  marshal: 'sniper_c', outlaw: 'sniper_b', operator: 'sniper_a',

};

const LEN_BY_CAT = { sidearm: 0.30, smg: 0.46, rifle: 0.60, shotgun: 0.62, sniper: 0.82, mg: 0.72 };

const FILE = (key) => `Valo/Models/${key}.glb`;

// Procedurally generate worn-metal maps (CC0, no downloads): soft blotches +
// fine scratches drive a roughness map (so reflections vary like real, scuffed
// metal) and a matching normal map (subtle surface bumps/scratches).
function _metalMaps() {
  const S = 256, N = S * S;
  const h = new Float32Array(N);
  for (let i = 0; i < N; i++) h[i] = Math.random();
  const blur = () => {
    const o = new Float32Array(N);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
        s += h[((y + dy + S) % S) * S + ((x + dx + S) % S)];
      o[y * S + x] = s / 9;
    }
    h.set(o);
  };
  blur(); blur(); blur();
  for (let n = 0; n < 140; n++) {
    let x = Math.random() * S, y = Math.random() * S;
    const a = Math.random() * Math.PI, dx = Math.cos(a), dy = Math.sin(a), len = 8 + Math.random() * 70;
    for (let t = 0; t < len; t++, x += dx, y += dy) {
      const xi = (x | 0), yi = (y | 0);
      if (xi >= 0 && xi < S && yi >= 0 && yi < S) h[yi * S + xi] = Math.min(1, h[yi * S + xi] + 0.45);
    }
  }
  const canvas = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };
  const rc = canvas(), rx = rc.getContext('2d'), rimg = rx.createImageData(S, S);
  for (let i = 0; i < N; i++) { const v = Math.round((0.5 + h[i] * 0.45) * 255); rimg.data[i * 4] = v; rimg.data[i * 4 + 1] = v; rimg.data[i * 4 + 2] = v; rimg.data[i * 4 + 3] = 255; }
  rx.putImageData(rimg, 0, 0);
  const nc = canvas(), nx = nc.getContext('2d'), nimg = nx.createImageData(S, S), str = 2.2;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const l = h[y * S + ((x - 1 + S) % S)], r = h[y * S + ((x + 1) % S)];
    const u = h[((y - 1 + S) % S) * S + x], d = h[((y + 1 + S) % S) * S + x];
    let nvx = (l - r) * str, nvy = (u - d) * str, nvz = 1;
    const m = Math.hypot(nvx, nvy, nvz); nvx /= m; nvy /= m; nvz /= m;
    const i = (y * S + x) * 4;
    nimg.data[i] = Math.round((nvx * 0.5 + 0.5) * 255);
    nimg.data[i + 1] = Math.round((nvy * 0.5 + 0.5) * 255);
    nimg.data[i + 2] = Math.round((nvz * 0.5 + 0.5) * 255);
    nimg.data[i + 3] = 255;
  }
  nx.putImageData(nimg, 0, 0);
  const mk = (cv) => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); t.anisotropy = 8; return t; };
  return { rough: mk(rc), normal: mk(nc) };
}
const METAL = _metalMaps();

const SKIN = {
  gold:  new THREE.MeshStandardMaterial({ color: 0xc79a2e, roughness: 0.35, metalness: 1.0, roughnessMap: METAL.rough, normalMap: METAL.normal, normalScale: new THREE.Vector2(0.35, 0.35), emissive: 0xffb733, emissiveIntensity: 0.6, envMapIntensity: 1.6 }),
  black: new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.55, metalness: 1.0, roughnessMap: METAL.rough, normalMap: METAL.normal, normalScale: new THREE.Vector2(0.5, 0.5), envMapIntensity: 1.15 }),
};

function skinFor(mat) {
  const n = (mat && mat.name || '').toLowerCase();
  if (n.includes('glass')) return mat;
  if (n.includes('wood') || n.includes('light')) return SKIN.gold;
  return SKIN.black;
}

export class WeaponModelLoader {
  constructor() {
    this.loader = new GLTFLoader();
    this.cache = {};
    this.ready = false;
  }

  async preload() {
    const keys = [...new Set(Object.values(WEAPON_MODEL))];
    await Promise.all(keys.map(async (k) => {
      try {
        const gltf = await this.loader.loadAsync(FILE(k));
        gltf.scene.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
        this.cache[k] = gltf.scene;
      } catch (e) {  }
    }));
    this.ready = true;
  }

  has(id) { return !!this.cache[WEAPON_MODEL[id]]; }

  getModel(id) {
    const src = this.cache[WEAPON_MODEL[id]];
    if (!src) return null;

    const cat = (Weapons[id] && Weapons[id].category) || 'rifle';
    const targetLen = LEN_BY_CAT[cat] || 0.55;

    const holder = new THREE.Group();
    const model = src.clone(true);

    model.traverse((o) => {
      if (!o.isMesh) return;
      o.material = Array.isArray(o.material) ? o.material.map(skinFor) : skinFor(o.material);
    });
    holder.add(model);
    const bbox = new THREE.Box3().setFromObject(model);
    const size = bbox.getSize(new THREE.Vector3());
    const center = bbox.getCenter(new THREE.Vector3());
    model.position.sub(center);
    const dims = [['x', size.x], ['y', size.y], ['z', size.z]].sort((a, b) => b[1] - a[1]);
    const longAxis = dims[0][0], longLen = dims[0][1] || 1;
    if (longAxis === 'x') holder.rotation.y = Math.PI / 2;
    else if (longAxis === 'y') holder.rotation.x = -Math.PI / 2;
    holder.scale.setScalar(targetLen / longLen);

    const outer = new THREE.Group();
    outer.add(holder);
    outer.scale.set(1.5, 1.22, 1.0);
    outer.userData.muzzle = { x: 0, y: 0.02, z: -targetLen * 0.52 };

    outer.userData.trailTip = new THREE.Vector3(0, 0.03, -targetLen * 0.5);
    outer.userData.trailBase = new THREE.Vector3(0, 0.05, targetLen * 0.22);
    return outer;
  }
}
