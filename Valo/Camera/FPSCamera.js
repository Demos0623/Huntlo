import * as THREE from 'three';
import { Camera as Cfg } from '../config.js';

export class FPSCamera {
  constructor(aspect) {
    this.camera = new THREE.PerspectiveCamera(Cfg.fov, aspect, 0.05, 500);

    this.yaw = 0;
    this.pitch = 0;

    // User-adjustable look-sensitivity multiplier (1 = default). Set from the menu.
    this.sensScale = 1;

    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this._sinceRecoil = 99;
    this.noRecoil = false;

    this._targetFov = Cfg.fov;
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
  }

  setAspect(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  applyLook(dx, dy, aiming) {
    const s = Cfg.sensitivity * this.sensScale * (aiming ? Cfg.aimSensitivityScale : 1);
    this.yaw -= dx * s;
    this.pitch -= dy * s;
    this.pitch = Math.max(-Cfg.pitchLimit, Math.min(Cfg.pitchLimit, this.pitch));
  }

  addRecoil(pitch, yaw) {
    if (this.noRecoil) { this.recoilPitch = 0; this.recoilYaw = 0; return; }
    this.recoilPitch += pitch;
    this.recoilYaw += yaw;
    this._sinceRecoil = 0;
  }

  setAiming(aiming, fov) {
    this._targetFov = aiming ? (fov || Cfg.aimFov) : Cfg.fov;
  }

  update(dt, eyePosition) {

    this._sinceRecoil += dt;
    if (this._sinceRecoil > 0.14) {

      const rec = Math.min(1, Cfg.recoilRecovery * dt);
      this.recoilPitch -= this.recoilPitch * rec;
      this.recoilYaw -= this.recoilYaw * rec;
    }

    this._euler.set(this.pitch + this.recoilPitch, this.yaw + this.recoilYaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(this._euler);
    this.camera.position.copy(eyePosition);

    const f = Math.min(1, Cfg.fovLerp * dt);
    this.camera.fov += (this._targetFov - this.camera.fov) * f;
    this.camera.updateProjectionMatrix();
  }

  getMoveBasis() {
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);

    this._forward.set(-sy, 0, -cy);
    this._right.set(cy, 0, -sy);
    return { forward: this._forward, right: this._right };
  }

  getAimDirection(out = new THREE.Vector3()) {
    out.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    return out;
  }
}
