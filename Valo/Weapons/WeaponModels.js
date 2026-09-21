import * as THREE from 'three';
import { RoundedBoxGeometry } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/geometries/RoundedBoxGeometry.js';

function box(w, h, d) {
  const r = Math.max(0.0015, Math.min(0.012, Math.min(w, h, d) * 0.28));
  return new RoundedBoxGeometry(w, h, d, 2, r);
}

const MAT = {
  gunmetal: () => new THREE.MeshStandardMaterial({ color: 0x17191e, roughness: 0.3, metalness: 1.0, envMapIntensity: 1.2 }),
  black:    () => new THREE.MeshStandardMaterial({ color: 0x0e0f12, roughness: 0.5, metalness: 0.7, envMapIntensity: 0.85 }),
  poly:     () => new THREE.MeshStandardMaterial({ color: 0x141519, roughness: 0.85, metalness: 0.1, envMapIntensity: 0.5 }),
  steel:    () => new THREE.MeshStandardMaterial({ color: 0xc79a2e, roughness: 0.22, metalness: 1.0, emissive: 0x2a1d00, emissiveIntensity: 0.35, envMapIntensity: 1.5 }),
  wood:     () => new THREE.MeshStandardMaterial({ color: 0xb5892b, roughness: 0.3, metalness: 1.0, emissive: 0x241900, emissiveIntensity: 0.3, envMapIntensity: 1.3 }),
  woodDark: () => new THREE.MeshStandardMaterial({ color: 0x8a6520, roughness: 0.35, metalness: 1.0, envMapIntensity: 1.1 }),
  skin:     () => new THREE.MeshStandardMaterial({ color: 0xc79a6f, roughness: 0.85, metalness: 0.0 }),
  sleeve:   () => new THREE.MeshStandardMaterial({ color: 0x2f3a46, roughness: 0.9, metalness: 0.0 }),
  accent:   () => new THREE.MeshStandardMaterial({ color: 0xffd479, roughness: 0.3, metalness: 0.9, emissive: 0xffb733, emissiveIntensity: 1.15, envMapIntensity: 1.2 }),
};

function part(parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}

export function buildHand() {
  return new THREE.Group();
}

function buildVandalism() {
  const g = new THREE.Group();
  const metal = MAT.gunmetal(), black = MAT.black(), wood = MAT.wood(), woodDark = MAT.woodDark();

  part(g, box(0.052, 0.07, 0.30), metal, 0, 0, -0.02);

  part(g, box(0.05, 0.02, 0.24), black, 0, 0.045, -0.02);
  part(g, box(0.03, 0.02, 0.02), black, 0, 0.055, 0.08);

  part(g, box(0.05, 0.05, 0.14), wood, 0, -0.008, -0.19);

  part(g, box(0.042, 0.028, 0.12), woodDark, 0, 0.04, -0.185);
  part(g, new THREE.CylinderGeometry(0.008, 0.008, 0.13, 10), metal, 0, 0.055, -0.185, Math.PI / 2, 0, 0);

  part(g, new THREE.CylinderGeometry(0.011, 0.011, 0.22, 12), metal, 0, 0.006, -0.34, Math.PI / 2, 0, 0);
  part(g, box(0.03, 0.05, 0.03), black, 0, 0.03, -0.40);
  part(g, new THREE.CylinderGeometry(0.017, 0.016, 0.05, 12), black, 0, 0.006, -0.46, Math.PI / 2.3, 0, 0);

  const mag = new THREE.Group();
  const magMat = () => MAT.black();
  part(mag, box(0.034, 0.07, 0.06), magMat(), 0, -0.085, 0.01, 0.18, 0, 0);
  part(mag, box(0.032, 0.06, 0.058), magMat(), 0, -0.145, 0.045, 0.42, 0, 0);
  part(mag, box(0.03, 0.05, 0.05), magMat(), 0, -0.19, 0.10, 0.7, 0, 0);
  mag.userData.part = 'magazine';
  g.add(mag);

  part(g, box(0.034, 0.10, 0.05), black, 0, -0.075, 0.12, -0.35, 0, 0);
  part(g, new THREE.TorusGeometry(0.022, 0.005, 8, 16), black, 0, -0.045, 0.075, 0, Math.PI / 2, 0);

  part(g, box(0.038, 0.05, 0.16), wood, 0, 0.005, 0.22);
  part(g, box(0.03, 0.055, 0.03), woodDark, 0, 0.02, 0.30);

  const rHand = buildHand(0.9);
  rHand.position.set(0.0, -0.085, 0.115);
  rHand.rotation.set(0.5, 0, 0);
  g.add(rHand);

  const lHand = buildHand(1.0);
  lHand.position.set(0.0, -0.055, -0.19);
  lHand.rotation.set(-0.15, 0, 0.1);
  g.add(lHand);

  g.userData.muzzle = { x: 0, y: 0.006, z: -0.49 };
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return g;
}

function buildSheriff() {
  const g = new THREE.Group();
  const steel = MAT.steel(), black = MAT.black(), accent = MAT.accent();

  part(g, box(0.052, 0.062, 0.26), steel, 0, 0.03, -0.07);

  part(g, box(0.03, 0.014, 0.22), black, 0, 0.066, -0.07);
  for (let i = 0; i < 5; i++) part(g, box(0.034, 0.006, 0.008), steel, 0, 0.073, -0.15 + i * 0.03);

  part(g, box(0.05, 0.05, 0.06), steel, 0, 0.028, -0.2);
  part(g, new THREE.CylinderGeometry(0.012, 0.012, 0.02, 14), black, 0, 0.028, -0.235, Math.PI / 2, 0, 0);

  for (let i = 0; i < 5; i++) part(g, box(0.006, 0.05, 0.008), black, 0.028, 0.03, 0.02 + i * 0.012);

  part(g, box(0.04, 0.045, 0.14), steel, 0, -0.012, -0.02);
  part(g, new THREE.TorusGeometry(0.024, 0.006, 8, 16), black, 0, -0.05, 0.03, 0, Math.PI / 2, 0);
  part(g, box(0.01, 0.02, 0.01), black, 0, -0.045, 0.03);

  part(g, box(0.044, 0.13, 0.055), steel, 0, -0.085, 0.075, -0.2, 0, 0);
  part(g, box(0.03, 0.11, 0.012), black, 0.024, -0.085, 0.075, -0.2, 0, 0);
  part(g, box(0.03, 0.11, 0.012), black, -0.024, -0.085, 0.075, -0.2, 0, 0);

  const magP = new THREE.Group();
  part(magP, box(0.03, 0.1, 0.04), black, 0, -0.085, 0.075, -0.2, 0, 0);
  magP.userData.part = 'magazine';
  g.add(magP);

  part(g, box(0.02, 0.026, 0.014), black, 0, 0.05, 0.095, -0.4, 0, 0);
  part(g, box(0.006, 0.024, 0.024), accent, 0.026, 0.0, -0.02);

  const rHand = buildHand(0.85);
  rHand.position.set(0.0, -0.075, 0.08);
  rHand.rotation.set(0.35, 0, 0);
  g.add(rHand);

  const lHand = buildHand(0.7);
  lHand.position.set(-0.02, -0.11, 0.11);
  lHand.rotation.set(0.2, 0.4, 0.2);
  g.add(lHand);

  g.userData.muzzle = { x: 0, y: 0.028, z: -0.245 };
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return g;
}

function buildRequiem() {
  const g = new THREE.Group();
  const metal = MAT.gunmetal(), black = MAT.black(), wood = MAT.wood();
  const scopeGlass = () => new THREE.MeshStandardMaterial({ color: 0x2b6cff, roughness: 0.15, metalness: 0.4, emissive: 0x102040, emissiveIntensity: 0.6 });

  part(g, box(0.05, 0.075, 0.42), black, 0, 0, -0.06);

  part(g, box(0.045, 0.05, 0.26), metal, 0, 0.004, -0.34);
  part(g, new THREE.CylinderGeometry(0.013, 0.013, 0.5, 14), metal, 0, 0.006, -0.5, Math.PI / 2, 0, 0);

  part(g, new THREE.CylinderGeometry(0.024, 0.022, 0.09, 14), black, 0, 0.006, -0.78, Math.PI / 2, 0, 0);
  for (let i = 0; i < 3; i++) part(g, box(0.05, 0.01, 0.012), metal, 0, 0.006, -0.76 + i * 0.02);

  part(g, new THREE.CylinderGeometry(0.03, 0.03, 0.26, 16), black, 0, 0.085, -0.08, Math.PI / 2, 0, 0);
  part(g, new THREE.CylinderGeometry(0.038, 0.038, 0.04, 16), black, 0, 0.085, -0.19, Math.PI / 2, 0, 0);
  part(g, new THREE.CylinderGeometry(0.032, 0.032, 0.012, 16), scopeGlass(), 0, 0.085, -0.208, Math.PI / 2, 0, 0);
  part(g, new THREE.CylinderGeometry(0.026, 0.026, 0.012, 16), scopeGlass(), 0, 0.085, 0.048, Math.PI / 2, 0, 0);
  part(g, box(0.02, 0.05, 0.02), black, 0, 0.05, -0.02);
  part(g, box(0.02, 0.05, 0.02), black, 0, 0.05, 0.02);

  part(g, new THREE.CylinderGeometry(0.008, 0.008, 0.06, 8), metal, 0.05, 0.0, 0.06, 0, 0, Math.PI / 2);
  part(g, new THREE.SphereGeometry(0.014, 10, 8), metal, 0.085, 0.0, 0.06);

  part(g, box(0.045, 0.03, 0.14), wood, 0, 0.03, 0.14);
  part(g, box(0.04, 0.06, 0.14), black, 0, 0.0, 0.2);
  part(g, box(0.03, 0.05, 0.03), black, 0, -0.02, 0.28);
  part(g, box(0.034, 0.1, 0.05), black, 0, -0.07, 0.12, -0.32, 0, 0);
  part(g, new THREE.TorusGeometry(0.022, 0.005, 8, 16), black, 0, -0.04, 0.07, 0, Math.PI / 2, 0);

  const magR = new THREE.Group();
  part(magR, box(0.036, 0.08, 0.05), metal, 0, -0.075, -0.02);
  magR.userData.part = 'magazine';
  g.add(magR);

  const rHand = buildHand(0.9);
  rHand.position.set(0.0, -0.08, 0.11); rHand.rotation.set(0.5, 0, 0);
  g.add(rHand);
  const lHand = buildHand(1.0);
  lHand.position.set(0.0, -0.05, -0.32); lHand.rotation.set(-0.15, 0, 0.1);
  g.add(lHand);

  g.userData.muzzle = { x: 0, y: 0.006, z: -0.82 };
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return g;
}

const col = (hex) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.6, metalness: 0.6 });

function buildPistol({ len = 1, wide = false, color = 0x20242c } = {}) {
  const g = new THREE.Group();
  const body = col(color), black = MAT.black(), accent = MAT.accent();
  const bl = 0.14 * len;
  part(g, box(wide ? 0.06 : 0.045, 0.05, 0.18), body, 0, 0.02, -0.05);
  part(g, box(wide ? 0.05 : 0.03, 0.03, bl), black, 0, 0.03, -0.12 - bl * 0.4);
  part(g, new THREE.CylinderGeometry(wide ? 0.02 : 0.009, wide ? 0.02 : 0.009, 0.02, 12), black, 0, 0.02, -0.14 - bl * 0.5, Math.PI / 2, 0, 0);
  part(g, box(0.038, 0.1, 0.05), black, 0, -0.06, 0.06, -0.25, 0, 0);
  part(g, new THREE.TorusGeometry(0.02, 0.005, 8, 16), black, 0, -0.03, 0.02, 0, Math.PI / 2, 0);
  const magP = new THREE.Group();
  part(magP, box(0.03, 0.09, 0.04), black, 0, -0.075, 0.06, -0.25, 0, 0);
  magP.userData.part = 'magazine'; g.add(magP);
  part(g, box(0.006, 0.02, 0.02), accent, 0.02, 0.0, 0.0);
  const rHand = buildHand(0.85); rHand.position.set(0, -0.06, 0.055); rHand.rotation.set(0.35, 0, 0); g.add(rHand);
  g.userData.muzzle = { x: 0, y: 0.03, z: -0.16 - bl * 0.5 };
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; } });
  return g;
}

function buildSMG({ len = 1, color = 0x262b33 } = {}) {
  const g = new THREE.Group();
  const body = col(color), black = MAT.black(), accent = MAT.accent();
  part(g, box(0.05, 0.06, 0.24 * len), body, 0, 0, -0.05);
  part(g, box(0.03, 0.02, 0.18 * len), black, 0, 0.04, -0.06);
  part(g, new THREE.CylinderGeometry(0.011, 0.011, 0.16, 12), black, 0, 0.004, -0.26 * len, Math.PI / 2, 0, 0);
  part(g, box(0.035, 0.09, 0.05), black, 0, -0.07, 0.08, -0.3, 0, 0);
  part(g, box(0.03, 0.045, 0.1), black, 0, 0.005, 0.16);
  part(g, new THREE.TorusGeometry(0.02, 0.005, 8, 16), black, 0, -0.04, 0.05, 0, Math.PI / 2, 0);
  const magP = new THREE.Group();
  part(magP, box(0.03, 0.12, 0.045), black, 0, -0.1, -0.02);
  magP.userData.part = 'magazine'; g.add(magP);
  part(g, box(0.006, 0.012, 0.16), accent, 0.026, 0.02, -0.05);
  const rHand = buildHand(0.9); rHand.position.set(0, -0.075, 0.07); rHand.rotation.set(0.45, 0, 0); g.add(rHand);
  const lHand = buildHand(1.0); lHand.position.set(0, -0.05, -0.16); lHand.rotation.set(-0.1, 0, 0.1); g.add(lHand);
  g.userData.muzzle = { x: 0, y: 0.004, z: -0.34 * len };
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; } });
  return g;
}

function buildRifleTac({ len = 1, color = 0x24282f, suppressed = false } = {}) {
  const g = new THREE.Group();
  const body = col(color), black = MAT.black(), accent = MAT.accent();
  part(g, box(0.05, 0.07, 0.32 * len), body, 0, 0, -0.04);
  part(g, box(0.03, 0.02, 0.28 * len), black, 0, 0.046, -0.04);
  part(g, box(0.045, 0.05, 0.16 * len), black, 0, -0.006, -0.2 * len);
  part(g, new THREE.CylinderGeometry(0.011, 0.011, 0.2, 12), black, 0, 0.006, -0.34 * len, Math.PI / 2, 0, 0);
  if (suppressed) part(g, new THREE.CylinderGeometry(0.022, 0.022, 0.12, 14), black, 0, 0.006, -0.46 * len, Math.PI / 2, 0, 0);
  part(g, box(0.035, 0.1, 0.05), black, 0, -0.075, 0.12, -0.35, 0, 0);
  part(g, box(0.04, 0.06, 0.12), black, 0, -0.005, 0.2);
  part(g, new THREE.TorusGeometry(0.022, 0.005, 8, 16), black, 0, -0.045, 0.08, 0, Math.PI / 2, 0);
  const magP = new THREE.Group();
  part(magP, box(0.034, 0.12, 0.055), black, 0, -0.11, 0.02, 0.1, 0, 0);
  magP.userData.part = 'magazine'; g.add(magP);
  part(g, box(0.006, 0.012, 0.2), accent, 0.026, 0.01, -0.05);
  const rHand = buildHand(0.9); rHand.position.set(0, -0.085, 0.115); rHand.rotation.set(0.5, 0, 0); g.add(rHand);
  const lHand = buildHand(1.0); lHand.position.set(0, -0.055, -0.2 * len); lHand.rotation.set(-0.15, 0, 0.1); g.add(lHand);
  g.userData.muzzle = { x: 0, y: 0.006, z: (suppressed ? -0.52 : -0.44) * len };
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; } });
  return g;
}

function buildShotgun({ len = 1, auto = false, color = 0x2a2f38 } = {}) {
  const g = new THREE.Group();
  const body = col(color), black = MAT.black(), wood = MAT.wood(), accent = MAT.accent();
  part(g, box(0.055, 0.07, 0.26 * len), body, 0, 0, -0.05);
  part(g, new THREE.CylinderGeometry(0.02, 0.02, 0.34 * len, 14), black, 0, 0.02, -0.32 * len, Math.PI / 2, 0, 0);
  part(g, new THREE.CylinderGeometry(0.014, 0.014, 0.32 * len, 12), black, 0, -0.02, -0.31 * len, Math.PI / 2, 0, 0);
  part(g, box(0.045, 0.05, 0.1), wood, 0, -0.01, -0.14 * len);
  part(g, box(0.038, 0.1, 0.05), wood, 0, -0.07, 0.1, -0.3, 0, 0);
  part(g, box(0.04, 0.06, 0.12), wood, 0, 0.0, 0.2);
  part(g, new THREE.TorusGeometry(0.022, 0.005, 8, 16), black, 0, -0.04, 0.06, 0, Math.PI / 2, 0);
  const magP = new THREE.Group();
  if (auto) part(magP, new THREE.CylinderGeometry(0.05, 0.05, 0.05, 16), black, 0, -0.08, 0.0, 0, 0, Math.PI / 2);
  else part(magP, box(0.03, 0.02, 0.2), black, 0, -0.03, -0.3 * len);
  magP.userData.part = 'magazine'; g.add(magP);
  part(g, box(0.006, 0.012, 0.16), accent, 0.028, 0.02, -0.05);
  const rHand = buildHand(0.9); rHand.position.set(0, -0.075, 0.09); rHand.rotation.set(0.45, 0, 0); g.add(rHand);
  const lHand = buildHand(1.0); lHand.position.set(0, -0.05, -0.14 * len); lHand.rotation.set(-0.1, 0, 0.1); g.add(lHand);
  g.userData.muzzle = { x: 0, y: 0.02, z: -0.48 * len };
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; } });
  return g;
}

function buildSniperGeneric({ len = 1, scope = 1, color = 0x20242c } = {}) {
  const g = new THREE.Group();
  const body = col(color), black = MAT.black(), metal = MAT.gunmetal();
  const glass = () => new THREE.MeshStandardMaterial({ color: 0x2b6cff, roughness: 0.15, metalness: 0.4, emissive: 0x102040, emissiveIntensity: 0.6 });
  part(g, box(0.05, 0.075, 0.4 * len), body, 0, 0, -0.06);
  part(g, new THREE.CylinderGeometry(0.013, 0.013, 0.5 * len, 14), metal, 0, 0.006, -0.5 * len, Math.PI / 2, 0, 0);
  part(g, new THREE.CylinderGeometry(0.022, 0.02, 0.08, 12), black, 0, 0.006, -0.78 * len, Math.PI / 2, 0, 0);

  part(g, new THREE.CylinderGeometry(0.028 * scope, 0.028 * scope, 0.24 * scope, 16), black, 0, 0.085, -0.08, Math.PI / 2, 0, 0);
  part(g, new THREE.CylinderGeometry(0.03 * scope, 0.03 * scope, 0.012, 16), glass(), 0, 0.085, -0.08 - 0.12 * scope, Math.PI / 2, 0, 0);
  part(g, new THREE.CylinderGeometry(0.024 * scope, 0.024 * scope, 0.012, 16), glass(), 0, 0.085, -0.08 + 0.12 * scope, Math.PI / 2, 0, 0);
  part(g, box(0.02, 0.05, 0.02), black, 0, 0.05, -0.02);
  part(g, box(0.034, 0.1, 0.05), black, 0, -0.07, 0.12, -0.32, 0, 0);
  part(g, box(0.04, 0.06, 0.16), black, 0, 0.0, 0.22);
  part(g, new THREE.TorusGeometry(0.022, 0.005, 8, 16), black, 0, -0.04, 0.07, 0, Math.PI / 2, 0);
  const magP = new THREE.Group();
  part(magP, box(0.036, 0.08, 0.05), metal, 0, -0.075, -0.02);
  magP.userData.part = 'magazine'; g.add(magP);
  const rHand = buildHand(0.9); rHand.position.set(0, -0.08, 0.11); rHand.rotation.set(0.5, 0, 0); g.add(rHand);
  const lHand = buildHand(1.0); lHand.position.set(0, -0.05, -0.3 * len); lHand.rotation.set(-0.15, 0, 0.1); g.add(lHand);
  g.userData.muzzle = { x: 0, y: 0.006, z: -0.82 * len };
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; } });
  return g;
}

function buildMG({ len = 1, belt = false, color = 0x22262d } = {}) {
  const g = new THREE.Group();
  const body = col(color), black = MAT.black(), accent = MAT.accent();
  part(g, box(0.06, 0.08, 0.4 * len), body, 0, 0, -0.05);
  part(g, new THREE.CylinderGeometry(0.014, 0.014, 0.3 * len, 12), black, 0, 0.01, -0.4 * len, Math.PI / 2, 0, 0);
  part(g, box(0.05, 0.04, 0.12), black, 0, 0.05, -0.24 * len);
  part(g, box(0.04, 0.1, 0.05), black, 0, -0.08, 0.1, -0.28, 0, 0);
  part(g, box(0.045, 0.07, 0.14), black, 0, 0.0, 0.22);

  const magP = new THREE.Group();
  if (belt) part(magP, box(0.08, 0.09, 0.1), black, 0.02, -0.09, 0.02);
  else part(magP, box(0.05, 0.11, 0.08), black, 0, -0.1, -0.02);
  magP.userData.part = 'magazine'; g.add(magP);
  part(g, box(0.006, 0.014, 0.22), accent, 0.031, 0.02, -0.04);
  const rHand = buildHand(0.9); rHand.position.set(0, -0.085, 0.09); rHand.rotation.set(0.45, 0, 0); g.add(rHand);
  const lHand = buildHand(1.0); lHand.position.set(0, -0.05, -0.22 * len); lHand.rotation.set(-0.1, 0, 0.1); g.add(lHand);
  g.userData.muzzle = { x: 0, y: 0.01, z: -0.56 * len };
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; } });
  return g;
}

function buildKarambit() {
  const spinner = new THREE.Group();

  const bladeMat = MAT.black(), black = MAT.black(), accent = MAT.accent();

  const RX = 0.116, RY = 0.026;

  const s = new THREE.Shape();
  s.moveTo(-0.06, 0.028);
  s.lineTo(0.205, 0.020);
  s.quadraticCurveTo(0.270, 0.015, 0.258, 0.0);
  s.quadraticCurveTo(0.172, -0.042, 0.085, -0.048);
  s.quadraticCurveTo(0.0, -0.052, -0.06, -0.024);
  s.closePath();
  const bladeGeo = new THREE.ExtrudeGeometry(s, { depth: 0.013, bevelEnabled: true, bevelThickness: 0.0018, bevelSize: 0.0016, bevelSegments: 2 });
  bladeGeo.translate(0, 0, -0.0065);
  const blade = new THREE.Mesh(bladeGeo, bladeMat);
  blade.position.set(RX, RY, 0);
  spinner.add(blade);

  const spineCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(RX - 0.06,  RY + 0.028, 0),
    new THREE.Vector3(RX + 0.205, RY + 0.020, 0),
    new THREE.Vector3(RX + 0.240, RY + 0.0155, 0),
    new THREE.Vector3(RX + 0.257, RY + 0.009, 0),
    new THREE.Vector3(RX + 0.258, RY + 0.0, 0),
  ], false, 'catmullrom', 0.5);
  const spine = new THREE.Mesh(new THREE.TubeGeometry(spineCurve, 40, 0.0055, 8, false), accent);
  spinner.add(spine);

  const handle = new THREE.Mesh(box(0.10, 0.038, 0.029), black);
  handle.position.set(RX - 0.045, RY - 0.008, 0); handle.rotation.z = -0.18;
  spinner.add(handle);
  part(spinner, box(0.10, 0.05, 0.03), black, RX - 0.03, RY - 0.006, 0, 0, 0, -0.1);

  part(spinner, box(0.02, 0.05, 0.038), accent, RX - 0.04, RY - 0.005, 0, 0, 0, -0.18);

  part(spinner, new THREE.CylinderGeometry(0.006, 0.006, 0.032, 12), accent, RX - 0.066, RY + 0.006, 0, Math.PI / 2, 0, 0);
  part(spinner, new THREE.CylinderGeometry(0.006, 0.006, 0.032, 12), accent, RX - 0.036, RY, 0, Math.PI / 2, 0, 0);

  const ringInner = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0035, 10, 30), accent);
  ringInner.scale.z = 0.5;
  spinner.add(ringInner);
  const ringOuter = new THREE.Mesh(new THREE.TorusGeometry(0.030, 0.006, 10, 30), black);
  ringOuter.scale.z = 0.5;
  spinner.add(ringOuter);

  part(spinner, new THREE.CylinderGeometry(0.0135, 0.0135, 0.034, 14), accent, RX, RY, 0, Math.PI / 2, 0, 0);

  spinner.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });

  const holder = new THREE.Group();
  holder.add(spinner);
  holder.rotation.set(0.2, -Math.PI / 2, 0.15);
  holder.scale.setScalar(0.8);
  spinner.position.set(0.05, 0.02, 0);
  holder.userData.muzzle = { x: 0, y: 0, z: -0.2 };
  holder.userData.spinner = spinner;

  holder.userData.trailTip = new THREE.Vector3(RX + 0.258, RY + 0.0, 0);
  holder.userData.trailBase = new THREE.Vector3(RX + 0.0, RY - 0.048, 0);
  return holder;
}

const BUILDERS = {

  vantage: buildVandalism, marker: buildSheriff, karambit: buildKarambit,

  classic: () => buildPistol({ len: 1 }),
  ghost: () => buildPistol({ len: 1.15, color: 0x181b21 }),
  frenzy: () => buildPistol({ len: 0.9, color: 0x2a2f38 }),
  shorty: () => buildPistol({ len: 0.7, wide: true, color: 0x3a2f2a }),

  stinger: () => buildSMG({ len: 0.95 }),
  spectre: () => buildSMG({ len: 1.15, color: 0x1c2027 }),

  bulldog: () => buildRifleTac({ len: 0.95, color: 0x2c3138 }),
  guardian: () => buildRifleTac({ len: 1.15, color: 0x2a2f38 }),
  phantom: () => buildRifleTac({ len: 1.05, color: 0x14171d, suppressed: true }),

  bucky: () => buildShotgun({ len: 1 }),
  judge: () => buildShotgun({ len: 1.15, auto: true, color: 0x24282f }),

  marshal: () => buildSniperGeneric({ len: 0.85, scope: 0.85 }),
  outlaw: () => buildSniperGeneric({ len: 1.0, scope: 1.0, color: 0x2a2f38 }),
  operator: () => buildSniperGeneric({ len: 1.15, scope: 1.15, color: 0x1c2027 }),

  ares: () => buildMG({ len: 1.0 }),
  odin: () => buildMG({ len: 1.2, belt: true, color: 0x1c2027 }),
};

export function buildWeaponModel(id) {
  return (BUILDERS[id] || buildVandalism)();
}
