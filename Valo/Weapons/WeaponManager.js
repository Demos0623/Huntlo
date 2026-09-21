import * as THREE from 'three';
import { Weapon, WeaponState } from './Weapon.js';
import { Weapons, Loadout } from './WeaponData.js';

export class WeaponManager {
  constructor({ camera, hitSystem, audio, hud, getEyePosition, getMoveState, onShot }) {
    this.camera = camera;
    this.hit = hitSystem;
    this.audio = audio;
    this.hud = hud;
    this.getEyePosition = getEyePosition;
    this.getMoveState = getMoveState;
    this.onShot = onShot || null;

    this.weapons = {
      primary: new Weapon(Weapons[Loadout.primary]),
      secondary: new Weapon(Weapons[Loadout.secondary]),
      melee: new Weapon(Weapons[Loadout.melee]),
    };
    this.slots = ['primary', 'secondary', 'melee'];
    this.currentSlot = 'primary';
    this.current.onEquip();

    this.aiming = false;
    this.scoped = false;
    this._forceUnscope = false;
    this._switching = 0;
    this.shotCount = 0;
    this._spray = 0;
    this._sinceShot = 99;
    this.infiniteAmmo = false;
    this.rapidFire = false;
    this.noSpread = false;
  }

  _spreadMoveState() {
    const m = this.getMoveState();
    if (!this.noSpread) return m;
    return { ...m, speedFrac: 0, turnPenalty: 0, airborne: false, justJumped: false };
  }

  get current() { return this.weapons[this.currentSlot]; }

  refillAll() { for (const slot of this.slots) this.weapons[slot]?.refill(); }

  switchTo(slot) {
    if (slot === this.currentSlot || !this.weapons[slot]) return;
    if (this.current.state === WeaponState.RELOADING) {
      this.current.state = WeaponState.READY;
    }
    this.currentSlot = slot;
    this.current.onEquip();
    this._switching = this.current.def.equipTime;
    this.audio?.playSwitch();
    this.hud?.flashWeaponSwitch(this.current.def.name);
  }

  update(dt, actions) {
    if (this._switching > 0) this._switching -= dt;
    this._sinceShot += dt;

    if (actions.slotPrimary) this.switchTo('primary');
    else if (actions.slotSecondary) this.switchTo('secondary');
    else if (actions.slotMelee) this.switchTo('melee');

    const w = this.current;
    w.update(dt);
    w.rapid = this.rapidFire;

    if (this.infiniteAmmo && !w.def.melee) w.magazine = w.def.magazine;

    let aiming = !!actions.altDown && w.state === WeaponState.READY && this._switching <= 0;

    if (w.def.scope) {
      if (this._forceUnscope) {
        if (!actions.altDown) this._forceUnscope = false;
        else aiming = false;
      }
    }
    this.aiming = aiming;
    this.camera.setAiming(this.aiming, w.def.aimFov);

    this.scoped = this.aiming && !!w.def.scope;
    this.hud?.setScoped(this.scoped, w.def.scopeStyle || 'duplex');

    if (actions.reloadPressed && this._switching <= 0) {
      if (w.startReload()) this.audio?.playReload(w.def.reloadTime);
    }

    if (this._switching <= 0) {
      const moveState = this._spreadMoveState();
      w.tryFire(actions.fireDown, this.aiming, moveState, (shot) => {

        if (shot.empty) { if (!w.canReload) this.audio?.playEmpty(); return; }
        this._doShot(shot);
      });
    } else {

      w.tryFire(false, false, this.getMoveState(), null);
    }

    if (this._switching <= 0 && w.isEmpty && w.canReload) {
      if (w.startReload()) this.audio?.playReload(w.def.reloadTime);
    }

    this._pushHud();
  }

  _doShot(shot) {
    this.shotCount++;
    const melee = !!shot.def.melee;
    const eye = this.getEyePosition();
    const dir = this.camera.getAimDirection();

    const cam = this.camera.camera;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const muzzle = melee ? null : eye.clone().addScaledVector(dir, 0.5).addScaledVector(right, 0.14).addScaledVector(up, -0.10);

    const pellets = shot.def.pellets || 1;
    let hitAny = false, killedAny = false, headAny = false;
    let endPoint = null;
    for (let i = 0; i < pellets; i++) {
      const res = this.hit.fireRay(eye, dir, shot.spread, shot.def, muzzle);
      if (i === 0) endPoint = (res && res.point) ? res.point.clone()
        : eye.clone().addScaledVector(dir, shot.def.range);
      if (res && res.target) {
        hitAny = true;
        if (res.killed) killedAny = true;
        if (res.headshot) headAny = true;
        if (res.killed) {
          const label = res.target.label ? res.target.label.toUpperCase() : 'DUMMY';
          this.hud?.onKill({ victim: label, weapon: this.current.def.name, headshot: !!res.headshot });
        }
      }
    }

    if (!melee && muzzle && endPoint && this.onShot) this.onShot(muzzle, endPoint, shot.def.id);

    if (shot.def.scope && this.aiming) this._forceUnscope = true;

    if (this._sinceShot > 0.35) this._spray = 0;
    this._sinceShot = 0;
    const idx = this._spray++;
    const r = shot.def.recoil;
    let pitch, horiz;
    const sp = shot.def.spray;
    if (sp && sp.length) {

      const step = sp[Math.min(idx, sp.length - 1)];
      const D = Math.PI / 180;
      horiz = step[0] * D + (Math.random() - 0.5) * 2 * r.yawRand;
      pitch = step[1] * D + (Math.random() - 0.5) * 2 * r.pitchRand;
    } else {

      const climb = Math.min(1 + idx * 0.35, 3.2);
      pitch = r.pitch * climb + (Math.random() - 0.5) * 2 * r.pitchRand;
      horiz = (idx < 4 ? 0 : Math.sin(idx * 0.5) * r.yaw) + (Math.random() - 0.5) * 2 * r.yawRand;
    }
    this.camera.addRecoil(pitch, horiz);

    this.audio?.playFire(shot.def.id);
    this.hud?.onFire();

    if (hitAny) {
      this.hud?.showHitmarker(killedAny, headAny);
      this.audio?.playHit(killedAny, headAny);
    }
  }

  _pushHud() {
    const w = this.current;
    this.hud?.setWeapon({
      name: w.def.name,
      mag: w.magazine,
      capacity: w.def.magazine,
      reserve: '∞',

      reloading: w.state === WeaponState.RELOADING,
      equipping: w.state === WeaponState.EQUIPPING || this._switching > 0,
      fireMode: w.def.fireMode,
      empty: w.isEmpty,
      melee: !!w.def.melee,
    });
  }

  getCurrentSpread() {
    return this.current.computeSpread(this.aiming, this._spreadMoveState());
  }

  swapSlotWeapon(id) {
    const def = Weapons[id];
    if (!def) return null;
    const slot = def.slot;
    const oldId = this.weapons[slot].def.id;
    if (oldId === id) return oldId;
    this.weapons[slot] = new Weapon(def);
    this.currentSlot = slot;
    this.current.onEquip();
    this._switching = def.equipTime;
    this.audio?.playSwitch();
    this.hud?.flashWeaponSwitch('PICKED UP  ' + def.name);
    return oldId;
  }
}
