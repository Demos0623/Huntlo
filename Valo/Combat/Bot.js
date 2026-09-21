// Valo — AI bots. Each bot is a humanoid enemy (built on Target, so it already
// has health, head/body hit zones, damage flash, death and respawn) with simple
// combat AI: patrol random points, spot the player by field-of-view + range +
// line of sight, then face them, close the distance and shoot back.
import * as THREE from 'three';
import { Target } from './Target.js';

const KEEP_DIST = 8;               // preferred distance to the player

// Difficulty presets: range (m), fov (deg, can be flanked below 360), reaction (s),
// fire interval (s), per-shot accuracy, body/head damage, move speed (m/s).
export const DIFFICULTIES = {
  easy:   { range: 32, fov: 110, react: 0.55, fireMin: 0.6,  fireMax: 1.0,  hit: 0.30, dmgBody: 10, dmgHead: 20, speed: 2.2 },
  normal: { range: 46, fov: 150, react: 0.32, fireMin: 0.34, fireMax: 0.6,  hit: 0.55, dmgBody: 16, dmgHead: 33, speed: 2.7 },
  hard:   { range: 62, fov: 220, react: 0.15, fireMin: 0.2,  fireMax: 0.35, hit: 0.85, dmgBody: 24, dmgHead: 48, speed: 3.4 },
};

export class Bot extends Target {
  constructor(scene, position, opts = {}) {
    super(scene, position, { health: 100, label: opts.label || 'BOT' });
    this._home = position.clone();
    this._wander = position.clone();
    this._repick = 0;
    this._aggro = 0;                 // seconds of remaining alertness
    this._reaction = 0;
    this._strafe = Math.random() < 0.5 ? 1 : -1;
    this.setDifficulty(opts.diff || 'normal');
    this._fireCd = this._d.fireMin + Math.random() * (this._d.fireMax - this._d.fireMin);
    this._name = this._makeName(opts.label || 'BOT');
    this.mesh.add(this._name);
  }

  setDifficulty(name) {
    this._d = DIFFICULTIES[name] || DIFFICULTIES.normal;
    this._fovCos = Math.cos((this._d.fov * Math.PI / 180) / 2);
  }

  // Blind the bot for `dur` seconds (can't see/shoot) — from a flash.
  blind(dur) { this._blindT = Math.max(this._blindT || 0, dur); }

  _makeName(text) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const x = c.getContext('2d');
    x.font = 'bold 30px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,0.85)'; x.strokeText(text, 128, 34);
    x.fillStyle = '#ff8f8f'; x.fillText(text, 128, 34);
    const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.scale.set(1.4, 0.35, 1); sp.position.set(0, 0.95, 0); sp.raycast = () => {};
    return sp;
  }

  get _feetY() { return this.mesh.position.y - 1.11; }

  // World position of the bot's "eyes" (near the head).
  _eye(out) { return out.set(this.mesh.position.x, this.mesh.position.y + 0.46, this.mesh.position.z); }

  _respawn() {
    super._respawn();
    // Return home and reset AI.
    const a = Math.random() * Math.PI * 2, r = Math.random() * 6;
    this.mesh.position.set(this._home.x + Math.cos(a) * r, this._home.y + 1.11, this._home.z + Math.sin(a) * r);
    this._wander.copy(this._home);
    this._aggro = 0; this._reaction = 0;
  }

  update(dt, ctx) {
    super.update(dt);                 // flash + death timer + respawn
    if (this._downTimer > 0) return;   // dead

    const eye = this._eye(ctx._be || (ctx._be = new THREE.Vector3()));
    const toP = (ctx._bt || (ctx._bt = new THREE.Vector3())).copy(ctx.playerEye).sub(eye);
    const dist = toP.length();
    let sees = false;

    if (ctx.playerAlive && dist < this._d.range && dist > 0.1) {
      toP.multiplyScalar(1 / dist);
      // Facing test (skip while already alerted so a spotted player stays tracked).
      const fx = Math.sin(this.mesh.rotation.y), fz = Math.cos(this.mesh.rotation.y);
      const facing = (toP.x * fx + toP.z * fz) > this._fovCos;
      if (facing || this._aggro > 0) {
        ctx.ray.set(eye, toP); ctx.ray.far = dist - 0.4;
        if (ctx.ray.intersectObjects(ctx.occluders, true).length === 0) sees = true;
      }
    }

    // Blinded by a flash — can't see or shoot.
    if (this._blindT > 0) { this._blindT -= dt; sees = false; }

    if (sees) {
      this._aggro = 2.2;              // stay alert for a moment after losing sight
      if (this._reaction <= 0) this._reaction = this._d.react;
      // Face the player.
      this.mesh.rotation.y = Math.atan2(ctx.playerEye.x - eye.x, ctx.playerEye.z - eye.z);
    }
    this._aggro = Math.max(0, this._aggro - dt);
    this._reaction = Math.max(0, this._reaction - dt);

    if (this._aggro > 0) this._combatMove(dt, ctx, dist);
    else this._patrol(dt, ctx);

    // Shooting.
    this._fireCd -= dt;
    if (sees && this._reaction <= 0 && this._fireCd <= 0) {
      this._fireCd = this._d.fireMin + Math.random() * (this._d.fireMax - this._d.fireMin);
      this._shoot(ctx, eye, dist);
    }
  }

  _shoot(ctx, eye, dist) {
    // Tracer for feedback (muzzle at the eye toward the player).
    const to = (ctx._sh || (ctx._sh = new THREE.Vector3())).copy(ctx.playerEye);
    if (ctx.hitSystem) ctx.hitSystem.spawnTracer(eye, to);
    // Accuracy falls off with distance.
    const acc = this._d.hit * Math.max(0.35, 1 - dist / this._d.range);
    if (Math.random() < acc) {
      const head = Math.random() < 0.15;
      ctx.dealDamage(head ? this._d.dmgHead : this._d.dmgBody, head);
    }
  }

  _combatMove(dt, ctx, dist) {
    const p = ctx.playerEye;
    const dx = p.x - this.mesh.position.x, dz = p.z - this.mesh.position.z;
    const d = Math.hypot(dx, dz) || 1;
    let mx = 0, mz = 0;
    if (dist > KEEP_DIST + 2) { mx = dx / d; mz = dz / d; }          // advance
    else if (dist < KEEP_DIST - 2) { mx = -dx / d; mz = -dz / d; }   // back off
    else { mx = -dz / d * this._strafe; mz = dx / d * this._strafe; } // strafe
    this._tryMove(dt, ctx, mx, mz);
  }

  _patrol(dt, ctx) {
    this._repick -= dt;
    const dx = this._wander.x - this.mesh.position.x, dz = this._wander.z - this.mesh.position.z;
    if (Math.hypot(dx, dz) < 0.6 || this._repick <= 0) {
      const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 7;
      this._wander.set(this._home.x + Math.cos(a) * r, this._home.y, this._home.z + Math.sin(a) * r);
      this._repick = 3 + Math.random() * 3;
      return;
    }
    const d = Math.hypot(dx, dz) || 1;
    this.mesh.rotation.y = Math.atan2(dx, dz);
    this._tryMove(dt, ctx, dx / d, dz / d);
  }

  // Move along (mx,mz) if the ground is walkable and no wall is in the way.
  _tryMove(dt, ctx, mx, mz) {
    const step = this._d.speed * dt;
    const nx = this.mesh.position.x + mx * step, nz = this.mesh.position.z + mz * step;
    // Wall check just ahead.
    ctx.ray.set(
      (ctx._mp || (ctx._mp = new THREE.Vector3())).set(this.mesh.position.x, this._feetY + 0.6, this.mesh.position.z),
      (ctx._md || (ctx._md = new THREE.Vector3())).set(mx, 0, mz)
    );
    ctx.ray.far = 0.7;
    if (ctx.ray.intersectObjects(ctx.occluders, true).length > 0) { this._repick = 0; return; }
    const gy = ctx.world.groundHeight(nx, nz, this._feetY, 0.5);
    if (gy == null || Math.abs(gy - this._feetY) > 0.5) { this._repick = 0; return; }
    this.mesh.position.set(nx, gy + 1.11, nz);
  }
}

export class Bots {
  constructor(scene, colliders, spawns, diff = 'normal') {
    this.scene = scene;
    this.colliders = colliders;
    this.diff = diff;
    this.list = [];
    spawns.forEach((pos, i) => this.spawn(pos, 'BOT ' + (i + 1)));
  }

  // Spawn one more bot at `pos` (uses the current difficulty).
  spawn(pos, label) {
    const b = new Bot(this.scene, pos, { label: label || ('BOT ' + (this.list.length + 1)), diff: this.diff });
    this.colliders.push(b.mesh);      // hit parts are children -> recursive raycast finds them
    this.list.push(b);
    return b;
  }

  // Change difficulty at runtime (applies to all bots immediately).
  setDifficulty(name) {
    this.diff = name;
    for (const b of this.list) b.setDifficulty(name);
  }

  // Remove every bot from the world (unregister colliders, drop from the scene).
  clear() {
    for (const b of this.list) {
      const i = this.colliders.indexOf(b.mesh);
      if (i >= 0) this.colliders.splice(i, 1);
      this.scene.remove(b.mesh);
    }
    this.list = [];
  }

  update(dt, ctx) { for (const b of this.list) b.update(dt, ctx); }

  // Live bot positions for the minimap.
  positions() {
    const out = [];
    for (const b of this.list) {
      if (b._downTimer > 0) continue;
      out.push({ x: b.mesh.position.x, z: b.mesh.position.z, yaw: b.mesh.rotation.y });
    }
    return out;
  }
}
