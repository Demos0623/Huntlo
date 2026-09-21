import * as THREE from 'three';

export class PlayerModel {
  constructor(scene) {
    this.group = new THREE.Group();
    const mat = (hex) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.6, metalness: 0.12 });
    const BLUE = 0x3a6ea5, DARK = 0x28405c, ACC = 0x7fbfe0;

    const add = (parent, geo, hex, x, y, z) => {
      const m = new THREE.Mesh(geo, mat(hex));
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };

    add(this.group, new THREE.BoxGeometry(0.42, 0.55, 0.26), BLUE, 0, -0.62, 0.14);
    add(this.group, new THREE.BoxGeometry(0.44, 0.07, 0.28), ACC, 0, -0.86, 0.14);

    for (const sx of [-0.12, 0.12]) {
      const b = add(this.group, new THREE.SphereGeometry(0.13, 14, 12), BLUE, sx, -0.52, 0.03);
      b.scale.set(1, 1, 0.8);
    }

    const limb = (px, py, pz, geo, hex) => {
      const pivot = new THREE.Group();
      pivot.position.set(px, py, pz);

      const half = geo.parameters.height / 2;
      add(pivot, geo, hex, 0, -half, 0);
      this.group.add(pivot);
      return pivot;
    };
    this.armL = limb(-0.28, -0.33, 0.14, new THREE.BoxGeometry(0.12, 0.5, 0.14), BLUE);
    this.armR = limb(0.28, -0.33, 0.14, new THREE.BoxGeometry(0.12, 0.5, 0.14), BLUE);
    this.legL = limb(-0.11, -0.755, 0.08, new THREE.BoxGeometry(0.16, 0.85, 0.19), DARK);
    this.legR = limb(0.11, -0.755, 0.08, new THREE.BoxGeometry(0.16, 0.85, 0.19), DARK);

    this._phase = 0;
    this._amp = 0;
    scene.add(this.group);
  }

  update(eyePosition, yaw, moveState, dt = 0.016) {
    this.group.position.copy(eyePosition);
    this.group.rotation.y = yaw;

    const speed = moveState ? moveState.speed : 0;
    const grounded = moveState ? moveState.grounded : true;
    const moving = grounded && speed > 0.6;
    const norm = Math.min(1, speed / 6.6);

    if (moving) this._phase += dt * (6 + norm * 6);
    const targetAmp = moving ? 0.35 + norm * 0.4 : 0;
    this._amp += (targetAmp - this._amp) * Math.min(1, dt * 10);

    const s = Math.sin(this._phase) * this._amp;
    this.legL.rotation.x = s;
    this.legR.rotation.x = -s;
    this.armL.rotation.x = -s * 0.7;
    this.armR.rotation.x = s * 0.7;
  }
}
