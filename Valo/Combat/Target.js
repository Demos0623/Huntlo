import * as THREE from 'three';

export class Target {
  constructor(scene, position, opts = {}) {
    this.maxHealth = opts.health ?? 150;
    this.health = this.maxHealth;
    this.label = opts.label ?? '';
    this.feetY = position.y;

    const SUIT = 0x2f6f66, SUIT_DARK = 0x234f49, SKINH = 0x3fb6a8, VISOR = 0x10201e;

    const torsoH = 0.62, torsoCenterY = this.feetY + 1.11;
    this._parts = [];

    const mkMat = (hex) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.55, metalness: 0.12 });
    const outlineMat = () => new THREE.MeshBasicMaterial({ color: 0xb14dff, side: THREE.BackSide });

    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(0.44, torsoH, 0.26), mkMat(SUIT));
    this.mesh.position.set(position.x, torsoCenterY, position.z);
    this.mesh.castShadow = true;
    this.mesh.userData.target = this;
    this.mesh.userData.hitZone = 'body';
    scene.add(this.mesh);
    this._parts.push({ mesh: this.mesh, base: new THREE.Color(SUIT) });

    const addPart = (geo, hex, x, y, z, zone = 'body') => {
      const m = new THREE.Mesh(geo, mkMat(hex));
      m.position.set(x, y, z);
      m.castShadow = true;
      m.userData.target = this;
      m.userData.hitZone = zone;
      this.mesh.add(m);
      this._parts.push({ mesh: m, base: new THREE.Color(hex) });
      const o = new THREE.Mesh(geo, outlineMat());
      o.position.set(x, y, z);
      o.scale.setScalar(1.14);
      o.raycast = () => {};
      this.mesh.add(o);
      return m;
    };

    const HEAD_R = 0.185;
    const headLocalY = torsoH / 2 + 0.16;
    this.headMesh = addPart(new THREE.SphereGeometry(HEAD_R, 18, 14), SKINH, 0, headLocalY, 0, 'head');

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.12), mkMat(VISOR));
    visor.material.emissive = new THREE.Color(0x0a3a34);
    visor.position.set(0, headLocalY + 0.01, -HEAD_R + 0.02);
    visor.userData.target = this;
    this.mesh.add(visor);

    addPart(new THREE.BoxGeometry(0.13, 0.5, 0.15), SUIT, -0.285, 0.02, 0);
    addPart(new THREE.BoxGeometry(0.13, 0.5, 0.15), SUIT, 0.285, 0.02, 0);

    addPart(new THREE.BoxGeometry(0.16, 0.8, 0.19), SUIT_DARK, -0.11, -(torsoH / 2 + 0.4), 0);
    addPart(new THREE.BoxGeometry(0.16, 0.8, 0.19), SUIT_DARK, 0.11, -(torsoH / 2 + 0.4), 0);

    this.headMinY = torsoCenterY + headLocalY - HEAD_R - 0.05;

    this._flash = 0;
    this._downTimer = 0;
  }

  classifyHit(point) {
    if (this._downTimer > 0) return 'body';
    return point.y >= this.headMinY ? 'head' : 'body';
  }

  applyDamage(amount, zone = 'body') {
    if (this._downTimer > 0) return { killed: false, ignored: true };
    this.health -= amount;
    this._flash = 0.12;
    const res = { killed: false, zone, headshot: zone === 'head' };
    if (this.health <= 0) {
      this.health = 0;
      this._downTimer = 2.5;
      this.mesh.rotation.z = Math.PI / 2.4;
      res.killed = true;
    }
    return res;
  }

  update(dt) {
    if (this._flash > 0) {
      this._flash -= dt;
      const t = Math.max(0, this._flash / 0.12);
      for (const p of this._parts) {
        p.mesh.material.color.setRGB(
          p.base.r + (1 - p.base.r) * t,
          p.base.g + (1 - p.base.g) * t,
          p.base.b + (1 - p.base.b) * t);
      }
    }
    if (this._downTimer > 0) {
      this._downTimer -= dt;
      if (this._downTimer <= 0) this._respawn();
    }
  }

  _respawn() {
    this.health = this.maxHealth;
    this.mesh.rotation.z = 0;
    for (const p of this._parts) p.mesh.material.color.copy(p.base);
  }
}
