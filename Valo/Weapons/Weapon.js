import { Accuracy as A } from '../config.js';

export const WeaponState = { READY: 'ready', RELOADING: 'reloading', EQUIPPING: 'equipping' };

export class Weapon {
  constructor(def) {
    this.def = def;
    this.magazine = def.magazine;
    this.reserve = def.reserve;

    this.state = WeaponState.READY;
    this._cooldown = 0;
    this._reloadT = 0;
    this._equipT = 0;
    this.bloom = 0;
    this._triggerHeldLast = false;

    this._shotInterval = 60 / def.rpm;
  }

  onEquip() {
    this.state = WeaponState.EQUIPPING;
    this._equipT = this.def.equipTime;
    this._cooldown = Math.max(this._cooldown, 0);
  }

  get isReady() { return this.state === WeaponState.READY; }
  get isEmpty() { return this.magazine <= 0; }

  get reloadProgress() {
    if (this.state !== WeaponState.RELOADING) return 0;
    return Math.max(0, Math.min(1, 1 - this._reloadT / this.def.reloadTime));
  }

  get canReload() {
    return this.state === WeaponState.READY && this.magazine < this.def.magazine;
  }

  update(dt) {
    if (this._cooldown > 0) this._cooldown -= dt;

    if (this.state === WeaponState.EQUIPPING) {
      this._equipT -= dt;
      if (this._equipT <= 0) this.state = WeaponState.READY;
    } else if (this.state === WeaponState.RELOADING) {
      this._reloadT -= dt;
      if (this._reloadT <= 0) this._finishReload();
    }

    if (this.bloom > 0) {
      this.bloom = Math.max(0, this.bloom - A.recoverRate * this.def.maxBloom * dt);
    }
  }

  startReload() {
    if (!this.canReload) return false;
    this.state = WeaponState.RELOADING;
    this._reloadT = this.def.reloadTime;
    return true;
  }

  _finishReload() {

    this.magazine = this.def.magazine;
    this.state = WeaponState.READY;
  }

  refill() {
    this.magazine = this.def.magazine;
    this.reserve = this.def.reserve;
    if (this.state === WeaponState.RELOADING) this.state = WeaponState.READY;
  }

  tryFire(triggerDown, aiming, moveState, onFire) {
    const wasHeld = this._triggerHeldLast;
    this._triggerHeldLast = triggerDown;

    if (this.state !== WeaponState.READY) return false;
    if (!triggerDown) return false;
    if (this.def.fireMode === 'semi' && wasHeld && !this.rapid) return false;
    if (this._cooldown > 0) return false;

    if (this.isEmpty) {
      if (!wasHeld) onFire?.({ empty: true });
      this._cooldown = 0.15;
      return false;
    }

    this.magazine -= 1;
    this._cooldown = this.rapid ? Math.min(this._shotInterval, 0.03) : this._shotInterval;

    const spread = this.computeSpread(aiming, moveState);
    this.bloom = Math.min(this.def.maxBloom, this.bloom + this.def.bloomPerShot);

    onFire?.({ empty: false, spread, def: this.def });
    return true;
  }

  computeSpread(aiming, m) {
    const d = this.def;
    let move = A.movingPenalty * m.speedFrac * d.moveSpreadMul;

    if (m.crouching) move *= A.crouchBonus;
    if (m.silentWalk) move *= A.silentBonus;

    let spread = d.baseSpread + move + this.bloom;
    spread += A.turnPenaltyScale * m.turnPenalty;

    if (m.airborne) spread += A.airPenalty;
    if (m.justJumped) spread += A.jumpPenalty;

    if (aiming) spread *= d.aimSpreadMul;
    return spread;
  }
}
