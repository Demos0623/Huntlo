import * as THREE from 'three';
import { Combat } from '../config.js';

export class HitSystem {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.raycaster = new THREE.Raycaster();
    this._effects = [];
    this._effectRoot = new THREE.Group();
    scene.add(this._effectRoot);
    this.damageMul = 1;
    this.rainbow = false;
  }

  setColliders(colliders) { this.colliders = colliders; }
  setRainbow(on) { this.rainbow = !!on; }

  fireRay(origin, dir, spread, def, tracerFrom = null) {
    const shotDir = this._applySpread(dir, spread);
    this.raycaster.set(origin, shotDir);
    this.raycaster.far = def.range * 1.5;

    const hits = this.raycaster.intersectObjects(this.colliders, true);
    let result = null;
    let endPoint;

    if (hits.length > 0) {
      const h = hits[0];
      endPoint = h.point.clone();
      const target = this._resolveTarget(h.object);
      if (target) {

        let zone = 'body';
        if (typeof target.classifyHit === 'function') zone = target.classifyHit(h.point);
        else if (this._zoneOf(h.object) === 'head') zone = 'head';

        const base = zone === 'head'
          ? (def.headshotDamage ?? def.damage * Combat.headshotMultiplier)
          : def.damage;
        const dmg = base * this._falloffFrac(def, h.distance) * this.damageMul;
        const dmgRes = target.applyDamage(dmg, zone);
        result = { target, point: h.point, distance: h.distance, damage: dmg, zone, ...dmgRes };
        this._spawnImpact(h.point, h.face ? h.face.normal : null, true);
        if (zone === 'head') this._spawnHeadSpark(h.point, h.face ? h.face.normal : null);
      } else {
        result = { target: null, point: h.point, distance: h.distance };
        this._spawnImpact(h.point, h.face ? h.face.normal : null, false);
      }
    } else {
      endPoint = origin.clone().addScaledVector(shotDir, def.range);
    }

    if (!def.melee) this._spawnTracer(tracerFrom || origin, endPoint);
    return result;
  }

  _applySpread(dir, spread) {
    if (spread <= 0) return dir.clone();

    const up = Math.abs(dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(dir, up).normalize();
    const realUp = new THREE.Vector3().crossVectors(right, dir).normalize();
    const ang = Math.random() * Math.PI * 2;

    const r = Math.tan(spread) * Math.sqrt(Math.random());
    const out = dir.clone()
      .addScaledVector(right, Math.cos(ang) * r)
      .addScaledVector(realUp, Math.sin(ang) * r);
    return out.normalize();
  }

  _resolveTarget(object) {
    let o = object;
    while (o) {
      if (o.userData && o.userData.target) return o.userData.target;
      o = o.parent;
    }
    return null;
  }

  _zoneOf(object) {
    let o = object;
    while (o) {
      if (o.userData && o.userData.hitZone) return o.userData.hitZone;
      o = o.parent;
    }
    return 'body';
  }

  _falloffFrac(def, dist) {
    if (dist <= def.falloffStart) return 1;
    if (dist >= def.falloffEnd) return def.minDamageFrac;
    const t = (dist - def.falloffStart) / (def.falloffEnd - def.falloffStart);
    return 1 - t * (1 - def.minDamageFrac);
  }

  _damageForDistance(def, dist) {
    return def.damage * this._falloffFrac(def, dist);
  }

  spawnTracer(from, to) { this._spawnTracer(from, to); }

  _spawnTracer(from, to) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    if (len < 1e-4) return;
    dir.multiplyScalar(1 / len);

    const mid = from.clone().addScaledVector(dir, len * 0.5);
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

    const hue = (performance.now() * 0.00042) % 1;
    const coreColor = this.rainbow ? new THREE.Color().setHSL(hue, 0.96, 0.66) : 0xfff2c4;
    const haloColor = this.rainbow ? new THREE.Color().setHSL((hue + 0.07) % 1, 0.96, 0.52) : 0xffbb55;
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, len, 6, 1, true),
      new THREE.MeshBasicMaterial({ color: coreColor, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false })
    );
    core.position.copy(mid); core.quaternion.copy(quat);
    this._effectRoot.add(core);
    this._effects.push({ obj: core, mat: core.material, life: 0.09, max: 0.09, kind: 'tracer' });

    const halo = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, len, 6, 1, true),
      new THREE.MeshBasicMaterial({ color: haloColor, transparent: true, opacity: 0.4,
        blending: THREE.AdditiveBlending, depthWrite: false })
    );
    halo.position.copy(mid); halo.quaternion.copy(quat);
    this._effectRoot.add(halo);
    this._effects.push({ obj: halo, mat: halo.material, life: 0.09, max: 0.09, kind: 'tracer' });
  }

  _spawnImpact(point, normal, isTarget) {
    const mat = new THREE.MeshBasicMaterial({
      color: isTarget ? 0xff5a5a : 0xbfe9ff, transparent: true, opacity: 0.95,
    });
    const dot = new THREE.Mesh(new THREE.SphereGeometry(isTarget ? 0.06 : 0.045, 8, 6), mat);
    dot.position.copy(point);
    if (normal) dot.position.addScaledVector(normal, 0.01);
    this._effectRoot.add(dot);
    this._effects.push({ obj: dot, mat, life: 0.35, max: 0.35, kind: 'impact' });
  }

  // A headshot gets a quick gold-white burst distinct from the regular red
  // impact dot. One LineSegments draw call keeps it light even for automatic
  // weapons, while a round glowing core makes the confirmation readable at range.
  _spawnHeadSpark(point, normal) {
    const count = 17;
    const positions = new Float32Array(count * 6);
    const outward = normal ? normal.clone().normalize() : new THREE.Vector3(0, 0.35, 0);
    const dir = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      dir.set(Math.random() - 0.5, Math.random() - 0.25, Math.random() - 0.5).normalize();
      dir.lerp(outward, 0.28).normalize();
      const start = i * 6;
      const inner = 0.035 + Math.random() * 0.04;
      // Deliberately larger than the target's head: the burst is a readable
      // gameplay confirmation, not a small surface-only impact.
      const outer = 0.52 + Math.random() * 0.42;
      positions[start] = dir.x * inner;
      positions[start + 1] = dir.y * inner;
      positions[start + 2] = dir.z * inner;
      positions[start + 3] = dir.x * outer;
      positions[start + 4] = dir.y * outer;
      positions[start + 5] = dir.z * outer;
    }

    const burst = new THREE.Group();
    burst.position.copy(point);
    if (normal) burst.position.addScaledVector(normal, 0.015);
    const streakGeo = new THREE.BufferGeometry();
    streakGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const streakMat = new THREE.LineBasicMaterial({
      color: 0xffd75a, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    });
    burst.add(new THREE.LineSegments(streakGeo, streakMat));

    // PointsMaterial uses a square sprite. A small mesh sphere keeps the
    // center visibly round from every angle.
    const coreGeo = new THREE.SphereGeometry(0.16, 16, 12);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffe5, transparent: true,
      opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    burst.add(core);
    const haloGeo = new THREE.SphereGeometry(0.29, 16, 12);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xffc84f, transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    });
    burst.add(new THREE.Mesh(haloGeo, haloMat));
    this._effectRoot.add(burst);
    this._effects.push({
      obj: burst, mats: [streakMat, coreMat, haloMat], geometries: [streakGeo, coreGeo, haloGeo],
      life: 0.4, max: 0.4, kind: 'headSpark',
    });
  }

  update(dt) {
    for (let i = this._effects.length - 1; i >= 0; i--) {
      const e = this._effects[i];
      e.life -= dt;
      const t = Math.max(0, e.life / e.max);
      if (e.kind === 'headSpark') {
        e.obj.scale.setScalar(1 + (1 - t) * 0.8);
        e.mats[0].opacity = t;
        e.mats[1].opacity = Math.min(1, t * 1.35);
        e.mats[2].opacity = t * 0.4;
        if (e.life <= 0) {
          this._effectRoot.remove(e.obj);
          e.geometries.forEach((geometry) => geometry.dispose());
          e.mats.forEach((material) => material.dispose());
          this._effects.splice(i, 1);
        }
        continue;
      }
      e.mat.opacity = (e.kind === 'tracer' ? 0.9 : 0.95) * t;
      if (e.life <= 0) {
        this._effectRoot.remove(e.obj);
        e.obj.geometry?.dispose();
        e.mat.dispose();
        this._effects.splice(i, 1);
      }
    }
  }
}
