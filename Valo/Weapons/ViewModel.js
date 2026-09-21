import * as THREE from 'three';
import { buildWeaponModel } from './WeaponModels.js';
import { isPerfMode } from '../perf.js';

const PERF = isPerfMode();

const BASE = new THREE.Vector3(0.16, -0.15, -0.34);

export class ViewModel {
  constructor(camera, modelLoader = null) {
    this.camera = camera;
    this.modelLoader = modelLoader;

    this.scene = new THREE.Scene();
    const amb = new THREE.AmbientLight(0xffffff, 0.9);
    const key = new THREE.DirectionalLight(0xfff2e0, 1.1);
    key.position.set(-0.5, 1, 0.6);
    this.scene.add(amb, key);

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this._trailMax = 16;
    this._trailPos = [];
    this._prevTip = null;
    this._prevBase = null;
    this._trailMesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, depthTest: false, side: THREE.DoubleSide,
      })
    );
    this._trailMesh.frustumCulled = false;
    this._trailMesh.visible = false;
    this.scene.add(this._trailMesh);

    this._pMax = 70;
    this._pData = Array.from({ length: this._pMax }, () => ({ life: 0, max: 1, vx: 0, vy: 0, vz: 0 }));
    this._pPositions = new Float32Array(this._pMax * 3);
    this._pColors = new Float32Array(this._pMax * 3);
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(this._pPositions, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(this._pColors, 3));
    this._points = new THREE.Points(pGeo, new THREE.PointsMaterial({
      size: 0.028, sizeAttenuation: true, map: this._makeSparkTexture(),
      vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: false,
    }));
    this._points.frustumCulled = false;
    this._points.visible = false;
    this.scene.add(this._points);

    this._id = null;
    this._lastSlot = null;
    this._lastShot = -1;

    this._recoil = 0;
    this._equip = 0;
    this._reload = 0;
    this._inspectT = 0;
    this._inspectDur = 0.8;
    this._meleeSpinning = false;
    this._meleeSpin = 0;
    this._drawSpinT = 0;
    this._swingT = 0;
    this._swingDur = 0.26;
    this._swingDir = 1;
    this._pendingSpin = false;
    this._hitSpinT = 0;
    this._hitSpinDur = 0.42;
    this._ads = 0;
    this._time = 0;
    this._swayVel = new THREE.Vector3();
    this._rainbow = false;
    this._rainbowAccents = [];
    this._rainbowColorA = new THREE.Color();
    this._rainbowColorB = new THREE.Color();

    this._off = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
  }

  forceRebuild() { const id = this._id; this._id = null; if (id) this.setWeapon(id); }

  startInspect() {
    if (this._isMelee) { this._meleeSpinning = true; return; }
    if (this._inspectT <= 0 && this._equip <= 0.01) this._inspectT = this._inspectDur;
  }

  setRainbow(on) {
    this._rainbow = !!on;
    if (this._rainbow) this._collectRainbowAccents();
    else this._restoreRainbowAccents();
  }

  _collectRainbowAccents() {
    if (!this._rainbow || this._rainbowAccents.length) return;
    this.group.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const styled = mats.map((mat) => {
        if (!mat || !mat.color) return mat;
        const c = mat.color;
        // Metallic warm/yellow pieces are the gun's gold accents. Clone first:
        // imported gun models otherwise share their skin materials with the cache.
        const isGold = c.r > 0.55 && c.g > 0.32 && c.g < 0.97 && c.b < 0.66 && (mat.metalness || 0) > 0.4;
        if (!isGold) return mat;
        const copy = mat.clone();
        this._rainbowAccents.push({
          mat: copy,
          color: copy.color.clone(),
          emissive: copy.emissive ? copy.emissive.clone() : null,
          emissiveIntensity: copy.emissiveIntensity,
        });
        return copy;
      });
      o.material = Array.isArray(o.material) ? styled : styled[0];
    });
  }

  _restoreRainbowAccents() {
    for (const accent of this._rainbowAccents) {
      accent.mat.color.copy(accent.color);
      if (accent.emissive && accent.mat.emissive) accent.mat.emissive.copy(accent.emissive);
      accent.mat.emissiveIntensity = accent.emissiveIntensity;
    }
    this._rainbowAccents.length = 0;
  }

  _updateRainbowAccents() {
    if (!this._rainbow) return;
    this._collectRainbowAccents();
    // Use wall-clock time instead of a per-gun timer: every accent, even after
    // a weapon swap, reads the same fast color at the same instant.
    const hue = (performance.now() * 0.001) % 1;
    this._rainbowAccents.forEach((accent) => {
      accent.mat.color.setHSL(hue, 0.92, 0.55);
      if (accent.mat.emissive) accent.mat.emissive.setHSL(hue, 0.9, 0.24);
    });
  }

  setWeapon(id) {
    if (id === this._id) return;
    this._id = id;
    this.group.clear();

    const model = (this.modelLoader && this.modelLoader.getModel(id)) || buildWeaponModel(id);
    this.group.add(model);
    // A swap disposes the old view model, so collect accent copies again for
    // the new gun while rainbow mode is active.
    this._rainbowAccents.length = 0;
    if (this._rainbow) this._collectRainbowAccents();

    this._mag = null;
    model.traverse((o) => { if (o.userData && o.userData.part === 'magazine') this._mag = o; });
    this._magBase = this._mag ? this._mag.position.clone() : null;

    this._spinner = model.userData.spinner || null;

    const m = model.userData.muzzle || { x: 0, y: 0, z: -0.4 };
    // Imported models include these anchors. Procedural fallbacks get a pair
    // derived from their muzzle so every gun (including the Sheriff) supports
    // the cosmetic rainbow ribbon.
    const trailTip = model.userData.trailTip || new THREE.Vector3(m.x, m.y, m.z);
    const trailBase = model.userData.trailBase || new THREE.Vector3(m.x, m.y - 0.025, m.z + 0.12);
    this._tipMarker = null; this._baseMarker = null;
    if (trailTip) {
      const parent = this._spinner || this.group;
      this._tipMarker = new THREE.Object3D();
      this._tipMarker.position.copy(trailTip);
      parent.add(this._tipMarker);
      this._baseMarker = new THREE.Object3D();
      this._baseMarker.position.copy(trailBase);
      parent.add(this._baseMarker);
    }
    this._trailPos.length = 0;
    this._prevTip = null; this._prevBase = null;
    if (this._trailMesh) this._trailMesh.visible = false;

    this._meleeSpinning = false;
    this._meleeSpin = 0;
    this._drawSpinT = this._spinner ? 0.55 : 0;

    this._flashGroup = new THREE.Group();
    this._flashGroup.position.set(m.x, m.y, m.z);
    const flashMat = () => new THREE.MeshBasicMaterial({
      color: 0xffe6a0, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 10), flashMat());
    cone.rotation.x = -Math.PI / 2;
    cone.position.z = -0.06;
    this._flashGroup.add(cone);
    const star = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.14), flashMat());
    this._flashGroup.add(star);
    this._flashGroup.visible = false;
    this.group.add(this._flashGroup);

    this._flashT = 0;
    this._equip = 1;
  }

  update(dt, manager, moveState) {
    this._time += dt;

    this._lastSlot = manager.currentSlot;
    this.setWeapon(manager.current.def.id);
    this._updateRainbowAccents();
    this._isMelee = !!manager.current.def.melee;
    let fired = false;
    if (manager.shotCount !== this._lastShot) {
      const delta = manager.shotCount - this._lastShot;
      this._lastShot = manager.shotCount;
      const kick = manager.current.def.recoilKick || 1;
      if (delta > 0) {
        this._recoil = Math.min(1.6, this._recoil + 0.6 * kick);
        if (!this._isMelee) this._flashT = 0.05;
        fired = true;
      }
    }

    if (this._flashGroup) {
      this._flashT = Math.max(0, this._flashT - dt);
      const on = this._flashT > 0;
      this._flashGroup.visible = on;
      if (on) {
        const t = this._flashT / 0.05;
        const s = 0.7 + Math.random() * 0.6;
        this._flashGroup.scale.setScalar(s * (0.6 + 0.4 * t));
        this._flashGroup.rotation.z = Math.random() * Math.PI;
        this._flashGroup.children.forEach((c) => { c.material.opacity = t; });
      }
    }

    this._recoil = Math.max(0, this._recoil - dt * 7);
    this._equip = Math.max(0, this._equip - dt * 2.2);
    this._reloadP = manager.current.reloadProgress;

    this._drawSpinT = Math.max(0, this._drawSpinT - dt);
    if (this._isMelee && this._meleeSpinning) this._meleeSpin += 10.5 * dt;

    const swingWas = this._swingT;
    this._swingT = Math.max(0, this._swingT - dt);
    if (fired && this._isMelee) { this._swingT = this._swingDur; this._swingDir = -this._swingDir; this._pendingSpin = true; }
    this._hitSpinT = Math.max(0, this._hitSpinT - dt);
    if (this._pendingSpin && swingWas > 0 && this._swingT === 0) {
      this._hitSpinT = this._hitSpinDur; this._pendingSpin = false;
    }

    if (fired || manager.current.reloadProgress > 0 || this._equip > 0.01) this._inspectT = 0;
    if (fired) { this._meleeSpinning = false; this._meleeSpin = 0; }
    this._inspectT = Math.max(0, this._inspectT - dt);
    this._inspectP = this._inspectDur > 0 ? this._inspectT / this._inspectDur : 0;

    const wantAds = !!manager.aiming && !this._isMelee;
    this._ads += ((wantAds ? 1 : 0) - this._ads) * Math.min(1, dt * 16);

    this._scoped = !!manager.scoped;
    this.group.visible = !this._scoped;

    this._animateMagazine();
    this._applyTransform(dt, moveState);
    this._updateTrail(dt, fired);
    this._updateParticles(dt);
  }

  _makeSparkTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    // White source texture keeps the particle vertex colors accurate; the old
    // warm-yellow texture would muddy blue and violet rainbow particles.
    g.addColorStop(0.4, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(c);
    return tex;
  }

  _emitSparks(origin, tipVel, count = 3) {
    if (PERF) return;
    let spawned = 0;
    for (let i = 0; i < this._pMax && spawned < count; i++) {
      const p = this._pData[i];
      if (p.life > 0) continue;
      p.max = 0.22 + Math.random() * 0.28;
      p.life = p.max;
      p.px = origin.x + (Math.random() - 0.5) * 0.01;
      p.py = origin.y + (Math.random() - 0.5) * 0.01;
      p.pz = origin.z + (Math.random() - 0.5) * 0.01;

      p.vx = tipVel.x * 0.35 + (Math.random() - 0.5) * 1.4;
      p.vy = tipVel.y * 0.35 + (Math.random() - 0.5) * 1.4;
      p.vz = tipVel.z * 0.35 + (Math.random() - 0.5) * 1.4;
      spawned++;
    }
  }

  _updateParticles(dt) {
    if (PERF) { if (this._points) this._points.visible = false; return; }
    const pts = this._points;
    // Gun spark particles are an explicit rainbow-only cosmetic. The normal
    // firing presentation stays unchanged while the code is off.
    if ((!this._isMelee && !this._rainbow) || this._scoped) {
      if (pts) pts.visible = false;
      for (const p of this._pData) p.life = 0;
      return;
    }
    let live = 0;
    const pos = this._pPositions, col = this._pColors;
    const rainbowHue = this._rainbow ? (performance.now() * 0.001) % 1 : 0;
    for (let i = 0; i < this._pMax; i++) {
      const p = this._pData[i];
      let a = 0;
      if (p.life > 0) {
        p.life -= dt;
        p.vx *= (1 - 2.2 * dt); p.vz *= (1 - 2.2 * dt);
        p.vy = p.vy * (1 - 2.2 * dt) - 2.4 * dt;
        p.px += p.vx * dt; p.py += p.vy * dt; p.pz += p.vz * dt;
        a = Math.max(0, p.life / p.max);
        if (p.life > 0) live++;
      }
      pos[i * 3] = p.px || 0; pos[i * 3 + 1] = p.py || 0; pos[i * 3 + 2] = p.pz || 0;

      if (this._rainbow) {
        this._rainbowColorA.setHSL((rainbowHue + i * 0.11) % 1, 0.95, 0.62);
        col[i * 3] = this._rainbowColorA.r * a;
        col[i * 3 + 1] = this._rainbowColorA.g * a;
        col[i * 3 + 2] = this._rainbowColorA.b * a;
      } else {
        col[i * 3] = 1.0 * a; col[i * 3 + 1] = 0.82 * a; col[i * 3 + 2] = 0.4 * a;
      }
    }
    this._points.geometry.attributes.position.needsUpdate = true;
    this._points.geometry.attributes.color.needsUpdate = true;
    pts.visible = live > 0;
  }

  _updateTrail(dt, fired = false) {
    if (PERF) { if (this._trailMesh) this._trailMesh.visible = false; return; }
    const mesh = this._trailMesh;
    if (!this._tipMarker || this._scoped) {
      if (mesh) mesh.visible = false;
      this._trailPos.length = 0; this._prevTip = null; this._prevBase = null;
      return;
    }

    this.group.updateMatrixWorld(true);
    const tip = this._tipMarker.getWorldPosition(new THREE.Vector3());
    const base = this._baseMarker.getWorldPosition(new THREE.Vector3());

    const flourish = this._isMelee
      ? (this._meleeSpinning || this._drawSpinT > 0 || this._swingT > 0 || this._hitSpinT > 0)
      // Rainbow mode continuously emits a cosmetic gun ribbon as soon as the
      // code is enabled; firing is no longer required to start or sustain it.
      : (this._id === 'marker' && this._inspectT > 0) || this._rainbow;

    if (this._prevTip) this._tipVel = tip.clone().sub(this._prevTip).multiplyScalar(1 / Math.max(dt, 1e-4));
    else this._tipVel = new THREE.Vector3();
    const previousTip = this._prevTip;
    const previousBase = this._prevBase;
    this._prevTip = tip.clone(); this._prevBase = base.clone();
    if (flourish) {
      // A single semi-auto shot needs two ribbon cross-sections; otherwise a
      // Sheriff shot would only have one point and no visible trail.
      if (this._rainbow && fired && !this._isMelee && previousTip && previousBase) {
        this._trailPos.push({ tip: previousTip.clone(), base: previousBase.clone(), life: 0.6, duration: 0.18 });
      }
      if (this._rainbow && !this._isMelee) {
        // A tiny wave prevents a stationary first-person gun from producing a
        // zero-area ribbon, so the trail remains visible even when standing.
        const wave = new THREE.Vector3(
          Math.sin(this._time * 17) * 0.012,
          Math.cos(this._time * 21) * 0.012,
          Math.sin(this._time * 13) * 0.007,
        );
        tip.add(wave); base.add(wave);
      }
      this._trailPos.push({ tip: tip.clone(), base: base.clone(), life: 1, duration: this._rainbow && !this._isMelee ? 0.18 : 0.08 });
      if (this._isMelee || (this._rainbow && fired)) {
        this._emitSparks(tip, this._tipVel, this._isMelee ? 3 : 10);
      }
    }

    for (const s of this._trailPos) s.life -= dt / (s.duration || 0.08);
    while (this._trailPos.length && this._trailPos[0].life <= 0) this._trailPos.shift();
    if (this._trailPos.length > this._trailMax) this._trailPos.splice(0, this._trailPos.length - this._trailMax);

    const n = this._trailPos.length;
    if (n < 2) { mesh.visible = false; return; }

    const positions = new Float32Array(n * 2 * 3);
    const colors = new Float32Array(n * 2 * 3);
    const rainbowHue = this._rainbow ? (performance.now() * 0.001) % 1 : 0;
    for (let i = 0; i < n; i++) {
      const s = this._trailPos[i];
      const a = Math.max(0, Math.min(1, s.life)) * 0.7;
      positions.set([s.tip.x, s.tip.y, s.tip.z], i * 6);
      positions.set([s.base.x, s.base.y, s.base.z], i * 6 + 3);

      if (this._rainbow) {
        // Offset each ribbon segment so the moving trail contains the whole
        // spectrum, rather than flashing one flat color at a time.
        this._rainbowColorA.setHSL((rainbowHue + i * 0.09) % 1, 0.96, 0.62);
        this._rainbowColorB.setHSL((rainbowHue + i * 0.09 + 0.055) % 1, 0.96, 0.46);
        colors.set([this._rainbowColorA.r * a, this._rainbowColorA.g * a, this._rainbowColorA.b * a], i * 6);
        colors.set([this._rainbowColorB.r * a, this._rainbowColorB.g * a, this._rainbowColorB.b * a], i * 6 + 3);
      } else {
        colors.set([0.95 * a, 0.7 * a, 0.22 * a], i * 6);
        colors.set([0.6 * a, 0.4 * a, 0.1 * a], i * 6 + 3);
      }
    }
    const indices = [];
    for (let i = 0; i < n - 1; i++) {
      const t0 = i * 2, b0 = i * 2 + 1, t1 = (i + 1) * 2, b1 = (i + 1) * 2 + 1;
      indices.push(t0, b0, t1, t1, b0, b1);
    }
    const geo = mesh.geometry;
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    mesh.visible = true;
  }

  _animateMagazine() {
    if (!this._mag || !this._magBase) return;
    const p = this._reloadP || 0;
    let drop = 0;
    if (p > 0) {
      if (p < 0.12) drop = 0;
      else if (p < 0.34) drop = (p - 0.12) / 0.22 * 0.26;
      else if (p < 0.5) drop = 0.26;
      else if (p < 0.72) drop = 0.26 * (1 - (p - 0.5) / 0.22);
      else drop = 0;
    }
    this._mag.position.set(this._magBase.x, this._magBase.y - drop, this._magBase.z);
    this._mag.rotation.z = drop * 1.2;
  }

  _applyTransform(dt, moveState) {
    const cam = this.camera.camera;

    const spd = moveState ? Math.min(1, moveState.speed / 6.6) : 0;
    const bobY = Math.sin(this._time * 10) * 0.006 * spd + Math.sin(this._time * 1.6) * 0.0015;
    const bobX = Math.cos(this._time * 5) * 0.006 * spd;

    const ads = this._isMelee ? 0 : this._ads;
    this._off.copy(BASE);
    this._off.x += bobX * (1 - 0.85 * ads);
    this._off.y += bobY * (1 - 0.85 * ads);

    this._off.x += (0.0 - BASE.x) * ads;
    this._off.y += (-0.11 - BASE.y) * ads;
    this._off.z += (-0.28 - BASE.z) * ads;

    this._off.z += this._recoil * 0.05;
    this._off.y += this._recoil * 0.012;

    const p = this._reloadP || 0;
    const dip = Math.sin(Math.PI * p);
    const settle = Math.min(1, p / 0.12);
    const reloadDip = dip * settle;
    this._off.y -= reloadDip * 0.11;
    this._off.x -= reloadDip * 0.04;
    this._off.z += reloadDip * 0.05;

    const reloadSpin = (!this._isMelee && this._id === 'marker' && p > 0)
      ? (p * p * (3 - 2 * p)) * Math.PI * 2
      : 0;

    this._off.y -= this._equip * 0.14;

    const q = this._inspectT > 0 ? 1 - this._inspectP : 0;
    const insEnv = Math.sin(Math.PI * q);
    this._off.y += insEnv * 0.05;
    this._off.x -= insEnv * 0.05;
    this._off.z += insEnv * 0.07;
    let insYaw, insPitch, insRoll;
    if (this._isMelee) {

      this._off.y += 0.06;
      insYaw = 0;
      insPitch = 0;
      insRoll = -Math.PI / 4;

      if (this._swingT > 0) {
        const p = 1 - this._swingT / this._swingDur;
        const sw = p < 0.35 ? p / 0.35 : 1 - (p - 0.35) / 0.65;
        const e = sw * sw * (3 - 2 * sw);
        const dir = this._swingDir;
        insYaw += e * 1.5 * dir;
        insPitch += e * -0.5;
        insRoll += e * -1.3 * dir;
        this._off.z -= e * 0.14;
        this._off.x -= e * 0.05 * dir;
        this._off.y -= e * 0.02;
      }
      if (this._spinner) {
        let spin = (345 * Math.PI) / 180;
        if (this._drawSpinT > 0) spin += (1 - this._drawSpinT / 0.55) * Math.PI * 2;
        if (this._hitSpinT > 0) spin += (1 - this._hitSpinT / this._hitSpinDur) * Math.PI * 2;
        if (this._meleeSpinning) spin += this._meleeSpin;
        this._spinner.rotation.z = spin;
      }
    } else if (this._id === 'marker') {

      const spinEase = q * q * (3 - 2 * q);
      insYaw = 0;
      insPitch = spinEase * Math.PI * 8;
      insRoll = insEnv * -0.35;
    } else {
      insYaw = insEnv * -1.9;
      insPitch = insEnv * 0.45 + Math.sin(q * Math.PI * 2) * 0.15;
      insRoll = insEnv * 0.6;
    }

    this._e.set(
      -this._recoil * 0.18 + reloadDip * 0.55 + this._equip * 0.4 + insPitch + reloadSpin,
      reloadDip * 0.35 + insYaw,
      reloadDip * 0.5 - this._equip * 0.2 + insRoll,
      'XYZ'
    );
    this._q.setFromEuler(this._e);

    this.group.quaternion.copy(cam.quaternion).multiply(this._q);
    this._off.applyQuaternion(cam.quaternion);
    this.group.position.copy(cam.position).add(this._off);
  }

  render(renderer) {
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera.camera);
    renderer.autoClear = true;
  }
}
