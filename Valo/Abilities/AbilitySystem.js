// Valo — ability system. Binds Q/E/C/X to abilities with cooldowns and a HUD bar.
// First ability: Curveball (Phoenix's flash) — a glowing orb that flies out,
// curves sideways, and pops into a flash that blinds anyone looking at it.
import * as THREE from 'three';

const FLASH_RANGE = 26;      // how far the pop can blind
const CURVE_SPEED = 12;      // close-range entry flash, not a long projectile
const CURVE_TURN = Math.PI / 2; // total heading change over its flight (90° arc)
const CURVE_LIFE = 0.5;      // quick post-throw detonation
const FLASH_MAX_DURATION = 1.5;
const SMOKE_RANGE = 31;      // tactical-map range in world units
const SMOKE_DROP_HEIGHT = 18;

// Procedural cloudy grayscale texture (fractal value noise) for the smoke shell.
function _smokeTexture() {
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
  blur(); blur(); blur(); blur();
  // Add a second, finer octave for wispiness.
  const f = new Float32Array(N);
  for (let i = 0; i < N; i++) f[i] = Math.random();
  const c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d'); const img = ctx.createImageData(S, S);
  for (let i = 0; i < N; i++) {
    const v = h[i] * 0.65 + f[i] * 0.35;
    const g = Math.round((0.30 + v * 0.38) * 255); // darker mottled smoke gray
    img.data[i * 4] = g; img.data[i * 4 + 1] = g + 3; img.data[i * 4 + 2] = g + 9; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); t.anisotropy = 4;
  return t;
}
const SMOKE_TEX = _smokeTexture();

export class AbilitySystem {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this._ray = new THREE.Raycaster();
    this._fx = [];             // active orbs / pop flashes

    this.slots = [
      { key: 'abilityQ', label: 'Q', name: '—', cd: 0, t: 0 },
      { key: 'abilityE', label: 'E', name: 'CURVEBALL', cd: 7, t: 0, flash: true },
      { key: 'abilityC', label: 'C', name: 'SMOKE', cd: 18, t: 0, smoke: true },
      { key: 'abilityX', label: 'X', name: '—', cd: 0, t: 0 },
    ];
    this._flashSlot = this.slots[1];
    this._smokeSlot = this.slots[2];
    this.armed = false;   // curveball equipped, waiting for a left/right click
    this.tablet = false;  // brimstone-style smoke map open

    this._buildHud(game);
    this._flashEl = this._makeFlashOverlay();
    this._smokeFogEl = this._makeSmokeFog();
    this._buildTablet(game);
  }

  _makeSmokeFog() {
    let el = document.getElementById('v-smokefog');
    if (!el) {
      el = document.createElement('div');
      el.id = 'v-smokefog';
      el.style.cssText = 'position:fixed;inset:0;background:radial-gradient(circle at 50% 50%, #696c70 0%, #43464b 48%, #24262b 100%);pointer-events:none;z-index:45;opacity:0;transition:opacity 0.12s;';
      document.body.appendChild(el);
    }
    return el;
  }

  update(dt) {
    const g = this.game;
    const engaged = g.input.engaged && !g._dead && !g.buyMenu?.isOpen;
    // Tick down every slot's cooldown (not just the flash — the smoke slot was
    // getting stuck at its full cooldown because it was never decremented here).
    for (const slot of this.slots) {
      if (slot.t > 0) slot.t = Math.max(0, slot.t - dt);
    }
    const s = this._flashSlot;

    if (!engaged) { this.armed = false; this._closeTablet(); }
    else if (this.tablet) {
      // Tactical smoke map: select up to three in-range markers, then confirm
      // them together. This keeps its fast-execute character without allowing
      // placements anywhere on the map.
      const m = g.input.consumeMouseDelta();
      this._retX = Math.max(6, Math.min(this._tab.width - 6, this._retX + m.dx * 0.6));
      this._retY = Math.max(6, Math.min(this._tab.height - 6, this._retY + m.dy * 0.6));
      if (g.input.wasPressed('abilityC') || g.input.wasPressed('menu')) {
        this._closeTablet();
      } else if (g.input.wasPressed('fire')) {
        if (this._marks.length < 3 && this._reticleInSmokeRange()) {
          this._marks.push({ x: this._retX, y: this._retY });
        }
      } else if (g.input.wasPressed('altAction')) {
        if (this._marks.length) {
          for (const mk of this._marks) {
            this._skyDeploySmoke((mk.x - this._tox) / this._ts, (mk.y - this._toz) / this._ts);
          }
          this._smokeSlot.t = this._smokeSlot.cd;
          this._closeTablet();
        }
      }
      if (this.tablet) this._drawTablet();
    } else {
      // E equips/unequips the curveball (if it's not on cooldown).
      if (g.input.wasPressed('abilityE')) {
        if (this.armed) this.armed = false;
        else if (s.t <= 0) this.armed = true;
      }
      // While equipped: Fire curves left; alternate fire curves right.
      if (this.armed) {
        if (g.input.wasPressed('fire')) { this._curveball(1); this.armed = false; s.t = s.cd; }
        else if (g.input.wasPressed('altAction')) { this._curveball(-1); this.armed = false; s.t = s.cd; }
      } else if (g.input.wasPressed('abilityC') && this._smokeSlot.t <= 0) {
        this._openTablet();
      }
    }

    this._updateFx(dt);
    this._updateSmokeVision();
    this._paintHud();
  }

  // The smoke is a hollow volume: once inside, a player can read its interior,
  // while the solid outer shell still prevents sight into or out of it.
  _updateSmokeVision() {
    this._smokeFogEl.style.opacity = '0';
  }

  // A smoke blocks a sight line when its sphere touches the segment between
  // the viewer and a target. This is used to hide enemy models, not bullets.
  blocksSmokeVision(from, to) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const lenSq = dx * dx + dy * dy + dz * dz || 1;
    for (const e of this._fx) {
      if (e.type !== 'smoke') continue;
      const c = e.mesh.position, r = e.mesh.scale.x + 0.35;
      if (r <= 0.05) continue;
      const t = Math.max(0, Math.min(1, ((c.x - from.x) * dx + (c.y - from.y) * dy + (c.z - from.z) * dz) / lenSq));
      const x = from.x + dx * t - c.x, y = from.y + dy * t - c.y, z = from.z + dz * t - c.z;
      if (x * x + y * y + z * z < r * r) return true;
    }
    return false;
  }

  isInsideSmoke(point, padding = 0) {
    for (const e of this._fx) {
      if (e.type !== 'smoke') continue;
      const r = e.mesh.scale.x + padding;
      if (r <= 0.05) continue;
      const dx = point.x - e.mesh.position.x, dy = point.y - e.mesh.position.y, dz = point.z - e.mesh.position.z;
      if (dx * dx + dy * dy + dz * dz < r * r) return true;
    }
    return false;
  }

  // Two points in the same smoke share its clear interior.  This is kept
  // separate from general smoke occlusion so a player still cannot see from
  // one smoke to another, or from a smoke to the open map.
  sharesSmoke(a, b, padding = 0) {
    for (const e of this._fx) {
      if (e.type !== 'smoke') continue;
      const r = e.mesh.scale.x + padding;
      if (r <= 0.05) continue;
      if (a.distanceToSquared(e.mesh.position) < r * r && b.distanceToSquared(e.mesh.position) < r * r) return true;
    }
    return false;
  }

  // --- Curveball ------------------------------------------------------------
  _curveball(sign, remote = false, throwData = null) {
    const g = this.game;
    const eye = throwData
      ? new THREE.Vector3(throwData.x, throwData.y, throwData.z)
      : g.movement.eyePosition;
    const aim = throwData
      ? new THREE.Vector3(throwData.dx, throwData.dy, throwData.dz).normalize()
      : g.camera.getAimDirection(new THREE.Vector3());
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 14, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffc766, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    mesh.add(halo);
    mesh.position.copy(eye);
    if (!throwData) mesh.position.addScaledVector(aim, 0.6);
    this.scene.add(mesh);

    this._fx.push({
      type: 'orb', mesh,
      pos: mesh.position.clone(),
      vel: aim.clone().multiplyScalar(CURVE_SPEED),
      sign, t: 0, broadcast: !remote,
    });

    // Everyone simulates the same short arc locally.  This makes the thrown
    // flash visible to opponents rather than only showing its final pop.
    if (!remote && g.net?.connected) {
      g.net.send({ t: 'flashThrow', x: mesh.position.x, y: mesh.position.y, z: mesh.position.z,
        dx: aim.x, dy: aim.y, dz: aim.z, sign });
    }
  }

  _updateFx(dt) {
    for (let i = this._fx.length - 1; i >= 0; i--) {
      const e = this._fx[i];
      if (e.type === 'orb') {
        e.t += dt;
        // Rotate the velocity around Y at a constant rate so the path is a
        // circular 90° arc, completed right as it pops.
        const a = e.sign * CURVE_TURN * (dt / CURVE_LIFE);
        const ca = Math.cos(a), sa = Math.sin(a);
        const vx = e.vel.x, vz = e.vel.z;
        e.vel.x = vx * ca + vz * sa;
        e.vel.z = -vx * sa + vz * ca;
        const prev = e.pos.clone();
        e.pos.addScaledVector(e.vel, dt);
        // Pop on a wall hit or when its life runs out.
        let popAt = null;
        const seg = e.pos.clone().sub(prev); const len = seg.length();
        if (len > 1e-4) {
          this._ray.set(prev, seg.clone().multiplyScalar(1 / len)); this._ray.far = len;
          const hit = this._ray.intersectObjects(this.game.occluders, true)[0];
          if (hit) popAt = hit.point;
        }
        if (popAt || e.t >= CURVE_LIFE) {
          this.scene.remove(e.mesh);
          this._fx.splice(i, 1);
          this._applyFlashAt(popAt || e.pos, false);
          continue;
        }
        e.mesh.position.copy(e.pos);
      } else if (e.type === 'flash') {
        e.t += dt;
        const k = Math.min(1, e.t / 0.12);
        e.mesh.scale.setScalar(0.4 + k * 6);
        e.mesh.material.opacity = Math.max(0, 0.9 * (1 - e.t / 0.4));
        if (e.t > 0.4) { this.scene.remove(e.mesh); this._fx.splice(i, 1); }
      } else if (e.type === 'smokeorb') {
        e.t += dt;
        e.vel.y -= 22 * dt;
        e.pos.addScaledVector(e.vel, dt);
        // Orbital smoke resolves on the chosen ground point; walls and cover
        // do not deflect it onto a roof or crate.
        let land = null;
        if (e.pos.y <= 0.05) { land = e.pos.clone(); land.y = 0; }
        if (!land && e.t > 1.5) { land = e.pos.clone(); land.y = 0; }
        if (land) { this.scene.remove(e.mesh); this._fx.splice(i, 1); this._deploySmoke(land); }
        else e.mesh.position.copy(e.pos);
      } else if (e.type === 'smoke') {
        e.t += dt;
        const grow = Math.min(1, e.t / 0.5);
        e.mesh.scale.setScalar(grow * e.R);
        e.mesh.updateMatrixWorld();
        // Both shells stay opaque for their entire lifetime. The sphere grows
        // into place, rather than becoming see-through at either boundary.
        e.outerMat.opacity = 1;
        e.innerMat.opacity = 1;
        e.outerMat.depthWrite = true;
        e.innerMat.depthWrite = true;
        if (e.t >= e.life) {
          this.scene.remove(e.mesh);
          const oi = this.game.occluders.indexOf(e.mesh);
          if (oi >= 0) this.game.occluders.splice(oi, 1);
          this._fx.splice(i, 1);
        }
      }
    }
  }

  // --- Brimstone smoke tablet -----------------------------------------------
  _buildTablet(game) {
    const b = game._arena.bounds;
    const W = 460, H = 500, pad = 16;
    const s = Math.min((W - pad * 2) / (b.maxX - b.minX), (H - pad * 2) / (b.maxZ - b.minZ));
    this._ts = s;
    this._tox = pad - b.minX * s;
    this._toz = pad - b.minZ * s;

    const wrap = document.createElement('div');
    wrap.id = 'v-tablet';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:40;display:none;align-items:center;justify-content:center;' +
      'background:rgba(6,9,13,0.55);pointer-events:none;flex-direction:column;gap:10px;';
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    canvas.style.cssText = 'border:1px solid #3a4656;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,0.6);background:#0e1116;';
    const hint = document.createElement('div');
    hint.textContent = 'LEFT-CLICK to place (up to 3)   ·   RIGHT-CLICK to deploy   ·   C to cancel';
    hint.style.cssText = 'font-family:inherit;font-size:13px;letter-spacing:2px;color:#9fb0c4;text-shadow:0 1px 3px #000;';
    wrap.appendChild(canvas); wrap.appendChild(hint);
    (game.hud && game.hud.root ? game.hud.root : document.getElementById('hud') || document.body).appendChild(wrap);
    this._tab = canvas; this._tabWrap = wrap; this._tabCtx = canvas.getContext('2d');
    this._drawTabletStatic();
  }

  _drawTabletStatic() {
    const g = this.game, a = g._arena;
    const c = document.createElement('canvas'); c.width = this._tab.width; c.height = this._tab.height;
    const x = c.getContext('2d');
    const wx = (v) => this._tox + v * this._ts, wz = (v) => this._toz + v * this._ts;
    x.fillStyle = 'rgba(14,17,22,0.95)'; x.fillRect(0, 0, c.width, c.height);
    const ZONE = { teal: '#3f6b60', gray: '#525d6b', mauve: '#7a5560' };
    for (const ar of (a.areas || [])) {
      x.fillStyle = ZONE[ar.zone] || '#444';
      x.fillRect(wx(ar.cx - ar.w / 2), wz(ar.cz - ar.d / 2), Math.ceil(ar.w * this._ts), Math.ceil(ar.d * this._ts));
    }
    x.strokeStyle = 'rgba(207,214,226,0.8)'; x.lineWidth = 1.5; x.lineCap = 'round'; x.beginPath();
    for (const w of (a.walls || [])) { x.moveTo(wx(w.x1), wz(w.z1)); x.lineTo(wx(w.x2), wz(w.z2)); }
    x.stroke();
    x.fillStyle = 'rgba(196,182,150,0.7)'; x.strokeStyle = 'rgba(20,24,30,0.8)'; x.lineWidth = 1;
    for (const cv of (a.covers || [])) {
      const px = wx(cv.cx - cv.w / 2), py = wz(cv.cz - cv.d / 2);
      const w = Math.max(3, cv.w * this._ts), h = Math.max(3, cv.d * this._ts);
      x.fillRect(px, py, w, h); x.strokeRect(px, py, w, h);
    }
    this._tabStatic = c;
  }

  _openTablet() {
    this.tablet = true;
    this._marks = [];
    this._tabWrap.style.display = 'flex';
    // Start the reticle on the player's position.
    const p = this.game.movement.position;
    this._retX = this._tox + p.x * this._ts;
    this._retY = this._toz + p.z * this._ts;
    this._drawTablet();
  }

  _closeTablet() {
    if (!this.tablet) return;
    this.tablet = false;
    if (this._tabWrap) this._tabWrap.style.display = 'none';
  }

  _drawTablet() {
    const ctx = this._tabCtx;
    ctx.clearRect(0, 0, this._tab.width, this._tab.height);
    ctx.drawImage(this._tabStatic, 0, 0);
    // player
    const p = this.game.movement.position;
    const px = this._tox + p.x * this._ts, pz = this._toz + p.z * this._ts;
    ctx.fillStyle = '#7fe0c8'; ctx.strokeStyle = '#0e1116'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(px, pz, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // Deployment range: the player can inspect the whole map but only mark a
    // location inside this ring.
    ctx.strokeStyle = 'rgba(216,184,120,0.52)'; ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.arc(px, pz, SMOKE_RANGE * this._ts, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    // placed smoke markers
    const SR = 4.2 * this._ts;
    for (const mk of (this._marks || [])) {
      ctx.fillStyle = 'rgba(196,200,206,0.35)';
      ctx.strokeStyle = '#e7eaee'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mk.x, mk.y, SR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    // reticle
    const rx = this._retX, ry = this._retY, R = SR;
    const inRange = this._reticleInSmokeRange();
    ctx.strokeStyle = inRange ? 'rgba(127,224,200,0.7)' : 'rgba(255,102,102,0.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(rx, ry, R, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = inRange ? 'rgba(127,224,200,0.18)' : 'rgba(255,102,102,0.14)'; ctx.beginPath(); ctx.arc(rx, ry, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = inRange ? '#eaf6f1' : '#ffd1d1'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(rx - 8, ry); ctx.lineTo(rx + 8, ry); ctx.moveTo(rx, ry - 8); ctx.lineTo(rx, ry + 8); ctx.stroke();
  }

  _reticleInSmokeRange() {
    const p = this.game.movement.position;
    const x = (this._retX - this._tox) / this._ts;
    const z = (this._retY - this._toz) / this._ts;
    return Math.hypot(x - p.x, z - p.z) <= SMOKE_RANGE;
  }

  // Drop a smoke from the sky onto (worldX, worldZ).
  _skyDeploySmoke(worldX, worldZ, remote = false) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x8a9098, roughness: 0.8 })
    );
    mesh.position.set(worldX, SMOKE_DROP_HEIGHT, worldZ);
    this.scene.add(mesh);
    this._fx.push({ type: 'smokeorb', mesh, pos: mesh.position.clone(), vel: new THREE.Vector3(0, -6, 0), t: 0 });
    // Send the target point, not the animated mesh, so every client performs
    // the same orbital drop and owns an identical sight-blocking volume.
    if (!remote && this.game.net?.connected) this.game.net.send({ t: 'smoke', x: worldX, z: worldZ });
  }

  // Deploy a smoke cloud at `pos`: an opaque sphere that blocks vision
  // (added to occluders, so it stops vision/aim-lock/bot sight — bullets still pass).
  _deploySmoke(pos) {
    const R = 4.2;
    // Front and back shells are both solid. From outside, the front shell
    // owns the depth buffer; from inside, the back shell does the same.
    const outerMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, map: SMOKE_TEX, transparent: false, opacity: 1,
      side: THREE.FrontSide, depthWrite: true, toneMapped: false,
    });
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xc7cbd0, map: SMOKE_TEX, transparent: false, opacity: 1,
      side: THREE.BackSide, depthWrite: true, toneMapped: false,
    });
    const smoke = new THREE.Group();
    smoke.add(new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16), outerMat));
    const inner = new THREE.Mesh(new THREE.SphereGeometry(0.985, 20, 16), innerMat);
    smoke.add(inner);
    smoke.position.set(pos.x, pos.y + R * 0.55, pos.z);
    smoke.scale.setScalar(0.2);
    smoke.updateMatrixWorld();
    this.scene.add(smoke);
    this.game.occluders.push(smoke);             // blocks LOS while it's up
    this._fx.push({ type: 'smoke', mesh: smoke, outerMat, innerMat, t: 0, life: 15, R });
  }

  // Detonate a flash at a world position. Blinds the local player + local bots,
  // and (when `broadcast`) tells other players so they blind themselves too.
  _applyFlashAt(pos, broadcast) {
    const g = this.game;
    // Visual pop.
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    flash.position.copy(pos); this.scene.add(flash);
    this._fx.push({ type: 'flash', mesh: flash, t: 0 });

    this._blindLocalPlayer(pos);

    // Blind bots that can see the pop.
    for (const b of g.bots.list) {
      if (b._downTimer > 0) continue;
      const be = b._eye ? b._eye(new THREE.Vector3()) : b.mesh.position;
      const d = be.distanceTo(pos);
      if (d < FLASH_RANGE && this._clearLOS(be, pos, d)) b.blind(FLASH_MAX_DURATION);
    }

    // Tell everyone else so they can flash their own screen.
    if (broadcast && g.net && g.net.connected) {
      g.net.send({ t: 'flash', x: pos.x, y: pos.y, z: pos.z });
    }
  }

  // Blind the local player, scaled by how the pop sits on their screen:
  //  - actually on screen  -> full blind, longer the more centered it is
  //  - in front but off the screen edges -> short blind
  //  - behind you          -> brief blind
  //  - blocked by a wall    -> no blind
  _blindLocalPlayer(pos) {
    const g = this.game, cam = g.camera.camera;
    const eye = g.movement.eyePosition;
    const rel = pos.clone().sub(eye); const dist = rel.length();
    if (dist > FLASH_RANGE + 8) return;
    if (!this._clearLOS(eye, pos, dist)) return;           // wall between -> nothing

    // On-screen test from the camera basis + FOV (robust; avoids relying on the
    // projection matrix, whose aspect can be NaN when the viewport is hidden).
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const fz = rel.dot(fwd);
    if (fz <= 0.1) { this._flashScreen(0.45, 0.25); return; } // behind -> short
    const rgt = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const size = g.renderer.getSize(new THREE.Vector2());
    const aspect = (size.x > 0 && size.y > 0) ? size.x / size.y
      : ((window.innerWidth / Math.max(1, window.innerHeight)) || 1.7778);
    const tanV = Math.tan((cam.fov * Math.PI / 180) / 2);
    const nx = (rel.dot(rgt) / fz) / (tanV * aspect);
    const ny = (rel.dot(up) / fz) / tanV;
    const onScreen = Math.abs(nx) <= 1 && Math.abs(ny) <= 1;
    if (onScreen) this._flashScreen(1.0, FLASH_MAX_DURATION);
    else this._flashScreen(0.45, 0.25);
  }

  _clearLOS(from, to, dist) {
    const dir = to.clone().sub(from).multiplyScalar(1 / Math.max(dist, 1e-4));
    this._ray.set(from, dir); this._ray.far = dist - 0.4;
    return this._ray.intersectObjects(this.game.occluders, true).length === 0;
  }

  // --- Screen flash overlay -------------------------------------------------
  _makeFlashOverlay() {
    let el = document.getElementById('v-flash');
    if (!el) {
      el = document.createElement('div');
      el.id = 'v-flash';
      el.style.cssText = 'position:fixed;inset:0;background:#fff;pointer-events:none;z-index:100;opacity:0;';
      document.body.appendChild(el);
    }
    return el;
  }

  _flashScreen(intensity, dur) {
    const el = this._flashEl;
    if (this._flashHoldTimer) clearTimeout(this._flashHoldTimer);
    el.style.transition = 'none';
    el.style.opacity = '0';
    // Force the reset to commit so a new flash cannot be swallowed by a
    // previous fade. The bright frame is held for the entire blind duration;
    // only then does it quickly clear.
    void el.offsetWidth;
    el.style.opacity = String(Math.min(1, 0.6 + intensity * 0.4));
    requestAnimationFrame(() => {
      this._flashHoldTimer = setTimeout(() => {
        el.style.transition = 'opacity 0.12s ease-out';
        el.style.opacity = '0';
      }, Math.round(dur * 1000));
    });
    // Mark ourselves flashed so others see the head-up pose.
    this.game._flashedT = Math.max(this.game._flashedT || 0, dur);
  }

  // --- HUD ------------------------------------------------------------------
  _buildHud(game) {
    if (!document.getElementById('v-abil-css')) {
      const st = document.createElement('style'); st.id = 'v-abil-css';
      st.textContent =
        '#v-abilities{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);display:flex;gap:8px;z-index:16;pointer-events:none;}' +
        '.v-abil{width:52px;height:52px;border-radius:8px;border:1px solid #3a4656;background:rgba(10,14,20,0.72);' +
        'display:flex;flex-direction:column;align-items:center;justify-content:center;color:#cfd8e3;font-family:inherit;position:relative;overflow:hidden;}' +
        '.v-abil .k{font-weight:800;font-size:15px;letter-spacing:1px;}' +
        '.v-abil .nm{font-size:8px;letter-spacing:1px;color:#8fa0b4;margin-top:1px;white-space:nowrap;}' +
        '.v-abil.ready{border-color:#5ac878;color:#d7f5e0;}' +
        '.v-abil .cd{position:absolute;inset:0;background:rgba(6,9,13,0.72);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;color:#fff;}' +
        '.v-abil.empty{opacity:0.4;}' +
        '.v-abil.armed{border-color:#ffd089;box-shadow:0 0 10px rgba(255,184,77,0.8);color:#ffe6b3;}' +
        '#v-abil-hint{position:fixed;left:50%;bottom:74px;transform:translateX(-50%);z-index:16;pointer-events:none;' +
        'font-family:inherit;font-size:12px;letter-spacing:2px;color:#ffd089;text-shadow:0 1px 3px #000;display:none;}';
      document.head.appendChild(st);
    }
    const wrap = document.createElement('div'); wrap.id = 'v-abilities';
    this._els = this.slots.map((s) => {
      const box = document.createElement('div');
      box.className = 'v-abil' + ((s.flash || s.smoke || s.cast) ? '' : ' empty');
      box.innerHTML = '<div class="k">' + s.label + '</div><div class="nm">' + s.name + '</div>' +
        '<div class="cd" style="display:none"></div>';
      wrap.appendChild(box);
      return { box, cd: box.querySelector('.cd') };
    });
    const root = (game.hud && game.hud.root ? game.hud.root : document.getElementById('hud') || document.body);
    root.appendChild(wrap);
    this._hint = document.createElement('div');
    this._hint.id = 'v-abil-hint';
    this._hint.textContent = '◀ LEFT-CLICK   RIGHT-CLICK ▶';
    root.appendChild(this._hint);
  }

  _paintHud() {
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i], el = this._els[i];
      if (!(s.flash || s.smoke || s.cast)) continue;
      const armed = (s.flash && this.armed) || (s.smoke && this.tablet);
      el.box.classList.toggle('armed', armed);
      if (s.t > 0) {
        el.cd.style.display = 'flex';
        el.cd.textContent = Math.ceil(s.t);
        el.box.classList.remove('ready');
      } else {
        el.cd.style.display = 'none';
        el.box.classList.toggle('ready', !armed);
      }
    }
    if (this._hint) this._hint.style.display = this.armed ? 'block' : 'none';
  }
}
