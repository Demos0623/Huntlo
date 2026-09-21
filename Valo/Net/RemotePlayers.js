import * as THREE from 'three';
import { buildWeaponModel } from '../Weapons/WeaponModels.js';
import { Movement as M } from '../config.js';

const EYE = M.standingHeight - M.eyeOffset;

class RemotePlayer {
  constructor(scene, id, onHit, modelLoader) {
    this.id = id;
    this.onHit = onHit;
    this.modelLoader = modelLoader;
    this.hp = 150;
    this.dead = false;
    this._wid = null;

    this.group = new THREE.Group();
    const mat = (hex) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.6, metalness: 0.12 });

    this._team = null;
    this._mainMats = []; this._darkMats = []; this._accMats = [];

    const add = (parent, geo, role, x, y, z, zone) => {
      const m = new THREE.Mesh(geo, mat(0xffffff));
      m.position.set(x, y, z); m.castShadow = true;
      m.userData.target = this; m.userData.hitZone = zone || 'body';
      parent.add(m);
      this._parts.push(m);
      if (role === 'main') this._mainMats.push(m.material);
      else if (role === 'dark') this._darkMats.push(m.material);
      else if (role === 'acc') this._accMats.push(m.material);
      return m;
    };
    this._parts = [];

    this._headPivot = new THREE.Group();
    this._headPivot.position.set(0, 1.4, 0);
    this.group.add(this._headPivot);
    this.head = add(this._headPivot, new THREE.SphereGeometry(0.16, 16, 12), 'main', 0, 0.16, 0, 'head');

    for (const ex of [-0.062, 0.062]) {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0 }));
      ball.position.set(ex, 0.185, -0.13); ball.raycast = () => {};
      this._headPivot.add(ball);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.4 }));
      pupil.position.set(ex, 0.185, -0.17); pupil.raycast = () => {};
      this._headPivot.add(pupil);
    }
    add(this.group, new THREE.BoxGeometry(0.42, 0.55, 0.26), 'main', 0, 1.12, 0);
    add(this.group, new THREE.BoxGeometry(0.44, 0.07, 0.28), 'acc', 0, 0.86, 0);

    const chestMat = mat(0xffffff); this._mainMats.push(chestMat);
    for (const sx of [-0.12, 0.12]) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 12), chestMat);
      b.position.set(sx, 1.22, -0.11); b.scale.set(1, 1, 0.8);
      b.castShadow = true; b.raycast = () => {};
      this.group.add(b);
    }
    const limb = (px, py, pz, geo, role) => {
      const pivot = new THREE.Group(); pivot.position.set(px, py, pz);
      const half = geo.parameters.height / 2;
      add(pivot, geo, role, 0, -half, 0);
      this.group.add(pivot); return pivot;
    };
    this.armL = limb(-0.28, 1.37, 0, new THREE.BoxGeometry(0.12, 0.5, 0.14), 'main');
    this.armR = limb(0.28, 1.37, 0, new THREE.BoxGeometry(0.12, 0.5, 0.14), 'main');
    this.legL = limb(-0.11, 0.85, 0, new THREE.BoxGeometry(0.16, 0.85, 0.19), 'dark');
    this.legR = limb(0.11, 0.85, 0, new THREE.BoxGeometry(0.16, 0.85, 0.19), 'dark');
    this.setTeam('attacker');

    this._hitViz = new THREE.Group(); this._hitViz.visible = false;
    const wireBox = (w, h, d, y, col) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshBasicMaterial({ color: col, wireframe: true, transparent: true, opacity: 0.85, depthTest: false })
      );
      m.position.set(0, y, 0); m.renderOrder = 999; m.raycast = () => {};
      this._hitViz.add(m); return m;
    };
    this._vizBody = wireBox(0.5, 1.35, 0.34, 0.675, 0x33ff66);
    this._vizHead = wireBox(0.36, 0.37, 0.36, 1.53, 0xff3355);
    this._vizAura = wireBox(3.6, 4.4, 3.6, 1.4, 0x33d0ff); this._vizAura.visible = false;
    this.group.add(this._hitViz);

    this._aura = new THREE.Mesh(new THREE.BoxGeometry(3.6, 4.4, 3.6),
      new THREE.MeshBasicMaterial({ visible: false }));
    this._aura.position.set(0, 1.4, 0);
    this._aura.userData.target = this; this._aura.userData.hitZone = 'body';
    this.group.add(this._aura);

    this._gunHolder = new THREE.Group();
    this._gunHolder.position.set(0.26, 1.18, -0.12);
    this.group.add(this._gunHolder);

    this._name = '';
    this._nameTag = null;
    this._smokeHidden = false;

    scene.add(this.group);

    this._buf = [];
    this._interpDelay = 0.12;
    this._lastSeq = -1;
    this._pitch = 0;
    this._moving = false; this._phase = 0; this._amp = 0;
  }

  setTeam(team) {
    if (team === this._team) { this._recolor(); return; }
    this._team = team;
    this._recolor();
  }

  _recolor() {
    const friendly = !!(this._team && this._myTeam && this._team === this._myTeam);
    const P = friendly
      ? { main: 0x3f8fd0, dark: 0x244f6e, acc: 0x9ed3ff }
      : { main: 0xd0473a, dark: 0x7a241a, acc: 0xff9e8e };
    this._mainMats.forEach((m) => m.color.setHex(P.main));
    this._darkMats.forEach((m) => m.color.setHex(P.dark));
    this._accMats.forEach((m) => m.color.setHex(P.acc));
  }

  setName(name) {
    if (!name || name === this._name) return;
    this._name = name;
    if (this._nameTag) {
      this.group.remove(this._nameTag);
      this._nameTag.material.map.dispose();
      this._nameTag.material.dispose();
    }
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const x = c.getContext('2d');
    x.font = 'bold 34px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,0.85)'; x.strokeText(name, 128, 34);
    x.fillStyle = '#ffd9c0'; x.fillText(name, 128, 34);
    const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
    // A small patch on the chest moves and occludes with the character model;
    // it is not a billboard or a floating UI label.
    const tag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 0.105),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide })
    );
    tag.position.set(0, 1.28, -0.145); tag.raycast = () => {};
    this._nameTag = tag;
    this.group.add(tag);
  }

  setWeapon(wid) {
    if (wid === this._wid) return;
    this._wid = wid;
    while (this._gunHolder.children.length) this._gunHolder.remove(this._gunHolder.children[0]);
    let gun = null;
    if (this.modelLoader && this.modelLoader.getModel) gun = this.modelLoader.getModel(wid);
    if (!gun) { try { gun = buildWeaponModel(wid); } catch (_) { gun = null; } }
    if (!gun) return;
    gun.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.raycast = () => {}; } });
    this._gunHolder.add(gun);
  }

  get label() { return this._name || 'PLAYER'; }

  setHitboxView(showHit, bigHit) {
    this._hitViz.visible = !!showHit;
    this._vizAura.visible = !!showHit && !!bigHit;
  }

  classifyHit(point) {
    if (this.dead) return 'body';
    return point.y >= this.group.position.y + 1.35 ? 'head' : 'body';
  }

  applyDamage(amount, zone = 'body') {
    if (this.dead) return { killed: false, ignored: true };
    // No friendly fire: a teammate takes no damage and never counts as a kill.
    if (this._team && this._myTeam && this._team === this._myTeam) {
      return { killed: false, ignored: true };
    }
    this.onHit(this.id, amount, zone === 'head');
    const killed = this.hp - amount <= 0;
    return { killed, zone, headshot: zone === 'head' };
  }

  setState(d) {

    // WebSockets normally preserve order, but a reconnect/snapshot can arrive
    // beside an old buffered update. Never let that pull a player backwards.
    if (Number.isInteger(d.seq)) {
      if (d.seq <= this._lastSeq) return;
      this._lastSeq = d.seq;
    }

    this._buf.push({
      t: performance.now() / 1000,
      x: d.x, y: (d.y ?? EYE) - EYE, z: d.z,
      yaw: d.yaw ?? 0,
      pitch: Math.max(-1.2, Math.min(1.2, d.pitch ?? 0)),
    });
    if (this._buf.length > 40) this._buf.shift();
    this._moving = !!d.moving;
    this._crouching = d.stance === 'crouch';
    this._flashed = !!d.flashed;
    if (typeof d.hp === 'number') this.hp = d.hp;
    if (d.wid) this.setWeapon(d.wid);
    if (d.name) this.setName(d.name);
    if (d.team) this.setTeam(d.team);
    if (d.dead) this.setDead(true); else if (this.dead && d.dead === false) this.setDead(false);
  }

  setDead(v) { this.dead = v; this.group.visible = !v && !this._smokeHidden; }

  setSmokeHidden(v) {
    this._smokeHidden = !!v;
    this.group.visible = !this.dead && !this._smokeHidden;
  }

  update(dt) {
    const buf = this._buf;
    if (buf.length) {
      const renderT = performance.now() / 1000 - this._interpDelay;

      while (buf.length > 2 && buf[1].t <= renderT) buf.shift();
      let a = buf[0], b = buf[1] || buf[0];
      let f = (b.t > a.t) ? (renderT - a.t) / (b.t - a.t) : 1;
      f = Math.max(0, Math.min(1, f));
      this.group.position.set(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f);
      let dy = b.yaw - a.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.group.rotation.y = a.yaw + dy * f;
      this._pitch = a.pitch + (b.pitch - a.pitch) * f;
    }
    // Flashed players tilt their head up so others can tell they're blinded.
    this._headPivot.rotation.x = this._flashed ? 1.0 : this._pitch;
    this._gunHolder.rotation.x = this._pitch;
    // Keep remote feet planted while communicating the smaller crouch stance.
    this.group.scale.y += ((this._crouching ? 0.72 : 1) - this.group.scale.y) * Math.min(1, dt * 12);

    const target = this._moving ? 0.7 : 0;
    this._amp += (target - this._amp) * Math.min(1, dt * 10);
    if (this._moving) this._phase += dt * 11;
    const s = Math.sin(this._phase) * this._amp;
    this.legL.rotation.x = s; this.legR.rotation.x = -s;
    this.armL.rotation.x = -s * 0.7; this.armR.rotation.x = s * 0.7;
  }

  dispose(scene) { scene.remove(this.group); }
}

export class RemotePlayers {
  constructor(scene, colliders, onHit, modelLoader) {
    this.scene = scene;
    this.colliders = colliders;
    this.onHit = onHit;
    this.modelLoader = modelLoader;
    this.players = new Map();
    this.myTeam = null;
    this.showHit = false;
    this.bigHit = false;
    this._interpDelay = 0.12;
  }

  setInterpolationDelay(seconds) {
    this._interpDelay = Math.max(0.06, Math.min(0.16, seconds));
    for (const p of this.players.values()) p._interpDelay = this._interpDelay;
  }

  setMyTeam(team) {
    this.myTeam = team;
    for (const p of this.players.values()) { p._myTeam = team; p._recolor(); }
  }

  setShowHitboxes(on) {
    this.showHit = on;
    for (const p of this.players.values()) p.setHitboxView(on, this.bigHit);
  }

  setBigHitboxes(on) {
    this.bigHit = on;
    for (const p of this.players.values()) {
      this._setAura(p, on);
      p.setHitboxView(this.showHit, on);
    }
  }

  _setAura(p, on) {
    const i = this.colliders.indexOf(p._aura);
    if (on && i < 0) this.colliders.push(p._aura);
    else if (!on && i >= 0) this.colliders.splice(i, 1);
  }

  ensure(id) {
    let p = this.players.get(id);
    if (!p) {
      p = new RemotePlayer(this.scene, id, this.onHit, this.modelLoader);
      p._interpDelay = this._interpDelay;
      p._myTeam = this.myTeam;
      p._recolor();
      this.players.set(id, p);
      for (const m of p._parts) this.colliders.push(m);

      p.setHitboxView(this.showHit, this.bigHit);
      if (this.bigHit) this.colliders.push(p._aura);
    }
    return p;
  }

  setState(id, d) { this.ensure(id).setState(d); }

  remove(id) {
    const p = this.players.get(id);
    if (!p) return;
    for (const m of [...p._parts, p._aura]) {
      const i = this.colliders.indexOf(m);
      if (i >= 0) this.colliders.splice(i, 1);
    }
    p.dispose(this.scene);
    this.players.delete(id);
  }

  update(dt) { for (const p of this.players.values()) p.update(dt); }

  positions() {
    const out = [];
    for (const p of this.players.values()) {
      if (!p.dead) out.push({ x: p.group.position.x, z: p.group.position.z, yaw: p.group.rotation.y });
    }
    return out;
  }
}
