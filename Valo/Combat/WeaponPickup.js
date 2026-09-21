import * as THREE from 'three';
import { buildWeaponModel } from '../Weapons/WeaponModels.js';
import { Weapons } from '../Weapons/WeaponData.js';

function makeLabelSprite(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(14,17,22,0.0)';
  ctx.fillRect(0, 0, 256, 64);
  ctx.font = 'bold 34px ui-monospace, Menlo, monospace';
  ctx.fillStyle = '#ffd479';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 6;
  ctx.fillText(text.toUpperCase(), 128, 34);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.6, 0.4, 1);
  return sprite;
}

export class WeaponPickup {
  constructor(scene, position, weaponId, radius = 1.7) {
    this.scene = scene;
    this.position = position.clone();
    this.radius = radius;
    this.playerInside = false;
    this._t = Math.random() * Math.PI * 2;

    this.root = new THREE.Group();
    this.root.position.copy(this.position);
    scene.add(this.root);

    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 0.55, 0.05, 10, 40),
      new THREE.MeshStandardMaterial({ color: 0xffd479, emissive: 0x5a4200, emissiveIntensity: 0.8, roughness: 0.5 })
    );
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = 0.03;
    this.root.add(this.ring);

    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.45, radius * 0.45, 2.2, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd479, transparent: true, opacity: 0.06,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.beam.position.y = 1.1;
    this.root.add(this.beam);

    this.holder = new THREE.Group();
    this.holder.position.y = 1.1;
    this.root.add(this.holder);

    this.label = makeLabelSprite('');
    this.label.position.y = 1.9;
    this.root.add(this.label);

    this.setWeapon(weaponId);
  }

  get weaponId() { return this._weaponId; }

  setWeapon(weaponId) {
    this._weaponId = weaponId;
    this.holder.clear();
    const model = buildWeaponModel(weaponId);
    model.scale.setScalar(1.6);
    model.rotation.y = Math.PI * 0.5;

    model.children.slice().forEach((c) => { if (c.type === 'Group') model.remove(c); });
    this.holder.add(model);

    const def = Weapons[weaponId];
    this.label.material.map.dispose?.();
    const sprite = makeLabelSprite(def ? def.name : weaponId);
    this.label.material.map = sprite.material.map;
    this.label.material.needsUpdate = true;
  }

  checkEnter(playerPos) {
    const dx = playerPos.x - this.position.x;
    const dz = playerPos.z - this.position.z;
    const inside = (dx * dx + dz * dz) <= this.radius * this.radius;
    const entered = inside && !this.playerInside;
    this.playerInside = inside;
    return entered;
  }

  update(dt) {
    this._t += dt;
    this.holder.rotation.y += dt * 1.2;
    this.holder.position.y = 1.1 + Math.sin(this._t * 2) * 0.06;
    this.ring.rotation.z += dt * 0.6;
  }
}
