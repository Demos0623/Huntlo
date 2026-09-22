import * as THREE from 'three';
import { Movement as M } from '../config.js?v=faster-movement-reset';

export const Stance = { STAND: 'stand', CROUCH: 'crouch' };

export class MovementController {
  constructor(world, spawn = new THREE.Vector3(0, 0, 0)) {
    this.world = world;

    this.position = spawn.clone();
    this.velocity = new THREE.Vector3();
    this.grounded = false;

    this.stance = Stance.STAND;
    this.height = M.standingHeight;
    this.silentWalk = false;

    this.turnPenalty = 0;
    this._justJumped = 0;

    this.fly = false;       // "fly" cheat: noclip free-fly
    this.speedMul = 1;      // "speed" cheat: movement speed multiplier

    this._wish = new THREE.Vector3();
    this._horiz = new THREE.Vector3();
  }

  get eyePosition() {
    return new THREE.Vector3(
      this.position.x,
      this.position.y + this.height - M.eyeOffset,
      this.position.z
    );
  }

  get speed() {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  update(dt, input, basis) {
    if (this.fly) { this._flyMove(dt, input, basis); return; }
    this._updateStance(dt, input);

    const w = this._wish.set(0, 0, 0);
    const f = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
    const s = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    w.addScaledVector(basis.forward, f);
    w.addScaledVector(basis.right, s);
    w.y = 0;
    const hasWish = w.lengthSq() > 1e-6;
    if (hasWish) w.normalize();

    const wishSpeed = this._currentMaxSpeed();

    if (this.grounded) {
      this._groundMove(dt, w, hasWish, wishSpeed);

      if (input.jump) {
        this.velocity.y = M.jumpVelocity;
        this.grounded = false;
        this._justJumped = 0.25;
      }
    } else {
      this._airMove(dt, w, hasWish, wishSpeed);
    }

    this._integrate(dt);

    this.turnPenalty = Math.max(0, this.turnPenalty - M.turnPenaltyDecay * dt);
    this._justJumped = Math.max(0, this._justJumped - dt);
  }

  _currentMaxSpeed() {
    let base;
    if (this.stance === Stance.CROUCH) base = M.crouchSpeed;
    else if (this.silentWalk) base = M.silentWalkSpeed;
    else base = M.walkSpeed;
    return base * this.speedMul;
  }

  // Free-fly noclip: move along the look plane + vertical keys, no gravity or
  // collision. Up = jump held, down = crouch held.
  _flyMove(dt, input, basis) {
    this.grounded = false;
    this.velocity.set(0, 0, 0);
    const speed = M.walkSpeed * this.speedMul * 1.6;
    const w = this._wish.set(0, 0, 0);
    const f = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
    const s = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    w.addScaledVector(basis.forward, f);
    w.addScaledVector(basis.right, s);
    w.y = 0;
    if (w.lengthSq() > 1e-6) w.normalize();
    const up = (input.jumpHeld ? 1 : 0) - (input.crouchHeld ? 1 : 0);
    this.position.x += w.x * speed * dt;
    this.position.z += w.z * speed * dt;
    this.position.y += up * speed * dt;
    if (this.position.y < 0) this.position.y = 0;
    this.height += ((this.stance === Stance.CROUCH ? M.crouchingHeight : M.standingHeight) - this.height) * Math.min(1, M.crouchLerp * dt);
  }

  _updateStance(dt, input) {
    this.silentWalk = !!input.silentHeld && this.grounded;

    const wantCrouch = !!input.crouchHeld;
    if (wantCrouch) {
      this.stance = Stance.CROUCH;
    } else if (this.stance === Stance.CROUCH) {

      const blocked = this.world.hasCeilingObstruction(
        this.position.x, this.position.z,
        this.position.y + M.crouchingHeight,
        this.position.y + M.standingHeight,
        M.radius
      );
      if (!blocked) this.stance = Stance.STAND;
    }

    const targetH = this.stance === Stance.CROUCH ? M.crouchingHeight : M.standingHeight;
    const k = Math.min(1, M.crouchLerp * dt);
    this.height += (targetH - this.height) * k;
  }

  _groundMove(dt, wish, hasWish, wishSpeed) {
    const vel = this.velocity;
    const speed = Math.hypot(vel.x, vel.z);

    if (speed > 0) {
      const control = Math.max(speed, M.stopSpeed);
      const drop = control * M.friction * dt;
      const newSpeed = Math.max(0, speed - drop);
      const scale = newSpeed / speed;
      vel.x *= scale; vel.z *= scale;
    }

    if (hasWish) {

      const dot = vel.x * wish.x + vel.z * wish.z;
      const reversing = dot < -0.1 && speed > 0.5;
      if (reversing) this.turnPenalty = Math.min(2, this.turnPenalty + M.turnPenaltyGain);
      const accel = reversing ? M.deceleration : M.acceleration;

      const current = vel.x * wish.x + vel.z * wish.z;
      const add = wishSpeed - current;
      if (add > 0) {
        const a = Math.min(accel * dt * wishSpeed, add);
        vel.x += wish.x * a;
        vel.z += wish.z * a;
      }
    }
  }

  _airMove(dt, wish, hasWish, wishSpeed) {
    const vel = this.velocity;
    vel.y -= M.gravity * dt;

    if (hasWish) {

      const airTarget = wishSpeed * M.airControl;
      const current = vel.x * wish.x + vel.z * wish.z;
      const add = airTarget - current;
      if (add > 0) {
        const a = Math.min(M.airAcceleration * dt * wishSpeed, add);
        vel.x += wish.x * a;
        vel.z += wish.z * a;
      }
    }
  }

  _integrate(dt) {
    const pos = this.position;
    const feetY = pos.y;

    // Sweep long horizontal movement in small pieces.  Resolving only at the
    // final position can skip over a thin wall on a stutter frame or at an
    // increased movement speed; each piece is shorter than the player radius.
    const travelX = this.velocity.x * dt;
    const travelZ = this.velocity.z * dt;
    const maxSweepStep = Math.max(0.06, M.radius * 0.45);
    const sweepSteps = Math.max(1, Math.ceil(Math.hypot(travelX, travelZ) / maxSweepStep));
    for (let i = 0; i < sweepSteps; i++) {
      pos.x += travelX / sweepSteps;
      pos.z += travelZ / sweepSteps;
      this.world.resolveHorizontal(pos, M.radius, feetY, this.height, M.stepHeight, this.velocity);
    }

    const groundY = this.world.groundHeight(pos.x, pos.z, feetY, M.stepHeight);

    if (this.grounded && this._justJumped <= 0) {
      if (groundY !== null && Math.abs(groundY - feetY) <= M.stepHeight + 0.05) {
        pos.y = groundY;
        this.velocity.y = 0;
      } else {
        this.grounded = false;
        pos.y += this.velocity.y * dt;
      }
    } else {
      pos.y += this.velocity.y * dt;
      if (groundY !== null && pos.y <= groundY + 0.02 && this.velocity.y <= 0) {
        pos.y = groundY;
        this.velocity.y = 0;
        this.grounded = true;
      }
    }
  }

  getAccuracyState() {
    const ref = M.maxGroundSpeed || 1;
    return {
      speed: this.speed,
      speedFrac: Math.min(1, this.speed / ref),
      grounded: this.grounded,
      crouching: this.stance === Stance.CROUCH,
      silentWalk: this.silentWalk,
      airborne: !this.grounded,
      justJumped: this._justJumped > 0,
      turnPenalty: this.turnPenalty,
    };
  }
}
