import * as THREE from 'three';
import { CollisionWorld, Ramp } from '../Movement/Collision.js';
import { MovementController } from '../Movement/MovementController.js';
import { Weapon } from '../Weapons/Weapon.js';
import { Weapons } from '../Weapons/WeaponData.js';
import { WeaponManager } from '../Weapons/WeaponManager.js';
import { HitSystem } from '../Combat/HitSystem.js';
import { Target } from '../Combat/Target.js';
import { Movement as M } from '../config.js';
import { buildArena } from '../World/Arena.js';
import { RemotePlayers } from '../Net/RemotePlayers.js';
import { FPSCamera } from '../Camera/FPSCamera.js';

const DT = 1 / 120;
const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond, detail });
}
function sim(mc, input, seconds, basis) {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) mc.update(DT, input, basis);
}

function simTrack(mc, input, seconds, basis) {
  const steps = Math.round(seconds / DT);
  let maxY = -Infinity, minSpeed = Infinity, maxSpeed = -Infinity, turnPeak = 0;
  for (let i = 0; i < steps; i++) {
    mc.update(DT, input, basis);
    maxY = Math.max(maxY, mc.position.y);
    minSpeed = Math.min(minSpeed, mc.speed);
    maxSpeed = Math.max(maxSpeed, mc.speed);
    turnPeak = Math.max(turnPeak, mc.turnPenalty);
  }
  return { maxY, minSpeed, maxSpeed, turnPeak };
}
const BASIS = {
  forward: new THREE.Vector3(0, 0, -1),
  right: new THREE.Vector3(1, 0, 0),
};
const NONE = { forward: false, back: false, left: false, right: false, jump: false, crouchHeld: false, silentHeld: false };

function flatWorld() {
  const w = new CollisionWorld();
  w.addBox({ x: -50, y: -1, z: -50 }, { x: 50, y: 0, z: 50 });
  return w;
}

export function runTests() {
  results.length = 0;

  {
    const mc = new MovementController(flatWorld(), new THREE.Vector3(0, 0, 0));
    sim(mc, { ...NONE }, 0.2, BASIS);
    check('grounded on spawn', mc.grounded && Math.abs(mc.position.y) < 0.02, `y=${mc.position.y.toFixed(3)}`);
  }

  {
    const mc = new MovementController(flatWorld());
    sim(mc, { ...NONE, forward: true }, 1.0, BASIS);
    check('forward reaches ~maxGroundSpeed', mc.speed > M.maxGroundSpeed * 0.9,
      `speed=${mc.speed.toFixed(2)} vz=${mc.velocity.z.toFixed(2)}`);
    check('forward is -Z', mc.velocity.z < -1, `vz=${mc.velocity.z.toFixed(2)}`);
  }

  {
    const mc = new MovementController(flatWorld());
    sim(mc, { ...NONE, back: true }, 1.0, BASIS);
    check('backward is +Z', mc.velocity.z > 1, `vz=${mc.velocity.z.toFixed(2)}`);
  }

  {
    const mc = new MovementController(flatWorld());
    sim(mc, { ...NONE, right: true }, 1.0, BASIS);
    check('strafe right is +X', mc.velocity.x > 1, `vx=${mc.velocity.x.toFixed(2)}`);
  }

  {
    const mc = new MovementController(flatWorld());
    sim(mc, { ...NONE, forward: true }, 1.0, BASIS);
    const before = mc.speed;
    sim(mc, { ...NONE }, 0.35, BASIS);
    check('stops quickly on release', mc.speed < before * 0.25,
      `before=${before.toFixed(2)} after=${mc.speed.toFixed(2)}`);
  }

  {
    const mc = new MovementController(flatWorld());
    sim(mc, { ...NONE, right: true }, 1.0, BASIS);
    const vxStart = mc.velocity.x;

    const t = simTrack(mc, { ...NONE, left: true }, 0.4, BASIS);
    check('counter-strafe passes through ~zero fast', t.minSpeed < 1.0,
      `vxStart=${vxStart.toFixed(2)} minSpeed=${t.minSpeed.toFixed(2)}`);
    check('counter-strafe raises turn penalty', t.turnPeak > 0.1, `turnPeak=${t.turnPeak.toFixed(2)}`);
  }

  {
    const mc = new MovementController(flatWorld());
    sim(mc, { ...NONE }, 0.1, BASIS);
    mc.update(DT, { ...NONE, jump: true }, BASIS);
    check('jump leaves ground', !mc.grounded && mc.velocity.y > 1, `vy=${mc.velocity.y.toFixed(2)}`);
    const apex = mc.position.y;
    sim(mc, { ...NONE }, 1.2, BASIS);
    check('lands back on ground', mc.grounded && Math.abs(mc.position.y) < 0.05,
      `apex=${apex.toFixed(2)} y=${mc.position.y.toFixed(3)}`);
  }

  {
    const mc = new MovementController(flatWorld());
    sim(mc, { ...NONE }, 0.15, BASIS);
    mc.update(DT, { ...NONE, jump: true }, BASIS);
    check('jump registered (airborne)', !mc.grounded, `grounded=${mc.grounded}`);
    sim(mc, { ...NONE, forward: true }, 0.35, BASIS);
    check('air speed limited below ground max', mc.speed < M.maxGroundSpeed * M.airControl + 1.5,
      `airSpeed=${mc.speed.toFixed(2)}`);
  }

  {
    const mc = new MovementController(flatWorld());
    sim(mc, { ...NONE, crouchHeld: true }, 0.6, BASIS);
    check('crouch lowers height', Math.abs(mc.height - M.crouchingHeight) < 0.1, `h=${mc.height.toFixed(2)}`);
    sim(mc, { ...NONE, crouchHeld: true, forward: true }, 1.0, BASIS);
    check('crouch caps speed near crouchSpeed', mc.speed < M.crouchSpeed + 0.3, `speed=${mc.speed.toFixed(2)}`);
  }

  {
    const mc = new MovementController(flatWorld());
    sim(mc, { ...NONE, silentHeld: true, forward: true }, 1.2, BASIS);
    check('silent walk caps near silentWalkSpeed', mc.speed < M.silentWalkSpeed + 0.3 && mc.speed > 1,
      `speed=${mc.speed.toFixed(2)}`);
    check('silent walk keeps standing height', Math.abs(mc.height - M.standingHeight) < 0.1, `h=${mc.height.toFixed(2)}`);
  }

  {
    const w = flatWorld();

    w.addBox({ x: -1, y: 1.4, z: -1 }, { x: 1, y: 1.6, z: 1 });
    const mc = new MovementController(w);
    sim(mc, { ...NONE, crouchHeld: true }, 0.6, BASIS);
    sim(mc, { ...NONE }, 0.6, BASIS);
    check('cannot stand under low ceiling', mc.height < M.standingHeight - 0.3, `h=${mc.height.toFixed(2)}`);
  }

  {
    const w = flatWorld();

    w.addBox({ x: -3, y: 0, z: -20 }, { x: 3, y: 0.35, z: -1 });
    const mc = new MovementController(w, new THREE.Vector3(0, 0, 2));
    const t = simTrack(mc, { ...NONE, forward: true }, 1.5, BASIS);
    check('climbs small step', t.maxY > 0.3 && mc.position.y > 0.3,
      `maxY=${t.maxY.toFixed(2)} endY=${mc.position.y.toFixed(2)} z=${mc.position.z.toFixed(2)}`);
  }

  {
    const w = flatWorld();
    w.addBox({ x: -2, y: 0, z: -5 }, { x: 2, y: 3, z: -3 });
    const mc = new MovementController(w, new THREE.Vector3(0, 0, 2));
    sim(mc, { ...NONE, forward: true }, 1.5, BASIS);
    check('wall blocks forward movement', mc.position.z > -3 - M.radius - 0.2 && mc.position.y < 0.3,
      `z=${mc.position.z.toFixed(2)} y=${mc.position.y.toFixed(2)}`);
  }

  {
    const w = flatWorld();
    w.addBox({ x: -50, y: 0, z: -5 }, { x: 50, y: 3, z: -3 }, { walkable: false });
    const mc = new MovementController(w, new THREE.Vector3(0, 0, 2));
    sim(mc, { ...NONE, forward: true, right: true }, 1.5, BASIS);
    check('wall collision slides without jitter', mc.position.y < 0.08 && Math.abs(mc.velocity.z) < 1e-4 && mc.position.x > 1,
      `x=${mc.position.x.toFixed(2)} z=${mc.position.z.toFixed(2)} y=${mc.position.y.toFixed(2)} vz=${mc.velocity.z.toFixed(3)}`);
  }

  {
    const w = flatWorld();
    // Low trim on a wall should still be a wall, never a climbable step.
    w.addBox({ x: -2, y: 0, z: -5 }, { x: 2, y: 0.35, z: -3 }, { walkable: false });
    const mc = new MovementController(w, new THREE.Vector3(0, 0, 2));
    sim(mc, { ...NONE, forward: true }, 1.5, BASIS);
    check('non-walkable wall trim does not climb', mc.position.z > -3 - M.radius - 0.2 && mc.position.y < 0.08,
      `z=${mc.position.z.toFixed(2)} y=${mc.position.y.toFixed(2)}`);
  }

  {
    const w = flatWorld();

    w.addRamp(new Ramp(-3, 3, -12, -2, 2.4, 0, 'z'));
    const mc = new MovementController(w, new THREE.Vector3(0, 0, -3));
    const t = simTrack(mc, { ...NONE, forward: true }, 1.6, BASIS);
    check('walks up slope', t.maxY > 0.6, `maxY=${t.maxY.toFixed(2)} endZ=${mc.position.z.toFixed(2)}`);
  }

  {
    const scene = new THREE.Scene();
    const remotes = new RemotePlayers(scene, [], () => {}, null);
    const p = remotes.ensure('crouch-test');
    p.setState({ seq: 1, x: 0, y: M.standingHeight - M.eyeOffset, z: 0, stance: 'stand' });
    let senderHeight = M.standingHeight;
    for (let i = 0; i < 30; i++) {
      p._netHeightAt -= 1 / 30;
      senderHeight += (M.crouchingHeight - senderHeight) * (1 - Math.exp(-M.crouchLerp / 30));
      p.setState({ seq: 2 + i, x: 0, y: senderHeight - M.eyeOffset, z: 0, stance: 'crouch' });
    }
    p.update(1);
    const visibleHeight = 1.72 * p.group.scale.y;
    const lastRemoteState = p._buf[p._buf.length - 1];
    check('crouched remote feet stay planted', Math.abs(lastRemoteState.y) < 0.02,
      `feetY=${lastRemoteState.y.toFixed(3)}`);
    check('crouched remote model matches capsule height', Math.abs(visibleHeight - M.crouchingHeight) < 0.01,
      `model=${visibleHeight.toFixed(3)} capsule=${M.crouchingHeight.toFixed(3)}`);
    check('crouched remote head hit zone follows scaled model',
      p.classifyHit(new THREE.Vector3(0, 1.05, 0)) === 'head'
        && p.classifyHit(new THREE.Vector3(0, 0.75, 0)) === 'body');
  }

  {
    const camera = new FPSCamera(16 / 9);
    camera.addDamageKick(Math.PI / 2, 1, true);
    const pitch = camera.impactPitch, yaw = camera.impactYaw;
    camera.update(0.2, new THREE.Vector3());
    check('damage feedback adds a restrained directional camera kick',
      pitch > 0 && yaw > 0 && pitch < 0.03 && yaw < 0.03,
      `pitch=${pitch.toFixed(4)} yaw=${yaw.toFixed(4)}`);
    check('damage camera kick settles quickly',
      camera.impactPitch < pitch * 0.1 && camera.impactYaw < yaw * 0.1,
      `pitch=${camera.impactPitch.toFixed(4)} yaw=${camera.impactYaw.toFixed(4)}`);
  }

  {
    const w = new Weapon(Weapons.vantage);
    for (let i = 0; i < w._equipT / DT + 80; i++) w.update(DT);
    const still = { speed: 0, speedFrac: 0, grounded: true, crouching: false, silentWalk: false, airborne: false, justJumped: false, turnPenalty: 0 };
    let shots = 0;

    for (let i = 0; i < 120; i++) {
      w.update(DT);
      const fired = w.tryFire(true, false, still, null);
      if (fired) shots++;
    }
    const expected = Weapons.vantage.rpm / 60;
    check('auto fire rate ~rpm', Math.abs(shots - expected) <= 2, `shots=${shots} expected≈${expected.toFixed(1)}`);
    check('auto consumed ammo', w.magazine === Weapons.vantage.magazine - shots, `mag=${w.magazine}`);
  }

  {
    const w = new Weapon(Weapons.marker);
    for (let i = 0; i < 80; i++) w.update(DT);
    const still = { speed: 0, speedFrac: 0, grounded: true, crouching: false, silentWalk: false, airborne: false, justJumped: false, turnPenalty: 0 };
    let shots = 0;
    for (let i = 0; i < 120; i++) { w.update(DT); if (w.tryFire(true, false, still, null)) shots++; }
    check('semi fires once while held', shots === 1, `shots=${shots}`);

    w.tryFire(false, false, still, null);
    let shot2 = w.tryFire(true, false, still, null);
    check('semi fires again after re-press', shot2 === true, `shot2=${shot2}`);
  }

  {
    const w = new Weapon(Weapons.vantage);
    const mk = (o) => Object.assign({ speed: 0, speedFrac: 0, grounded: true, crouching: false, silentWalk: false, airborne: false, justJumped: false, turnPenalty: 0 }, o);
    const still = w.computeSpread(false, mk({}));
    const moving = w.computeSpread(false, mk({ speed: 6.6, speedFrac: 1 }));
    const crouchMove = w.computeSpread(false, mk({ speed: 3.3, speedFrac: 0.5, crouching: true }));
    const walkSame = w.computeSpread(false, mk({ speed: 3.3, speedFrac: 0.5 }));
    const silentMove = w.computeSpread(false, mk({ speed: 3.4, speedFrac: 0.5, silentWalk: true }));
    const jump = w.computeSpread(false, mk({ speed: 6.6, speedFrac: 1, airborne: true, justJumped: true }));
    const aim = w.computeSpread(true, mk({ speed: 6.6, speedFrac: 1 }));
    check('still tighter than moving', still < moving, `still=${still.toFixed(4)} moving=${moving.toFixed(4)}`);
    check('crouch tighter than same-speed walk', crouchMove < walkSame, `crouch=${crouchMove.toFixed(4)} walk=${walkSame.toFixed(4)}`);
    check('silent walk tighter than same-speed walk', silentMove < walkSame, `silent=${silentMove.toFixed(4)} walk=${walkSame.toFixed(4)}`);
    check('jump strongly worse than moving', jump > moving, `jump=${jump.toFixed(4)} moving=${moving.toFixed(4)}`);
    check('aim tighter than hip while moving', aim < moving, `aim=${aim.toFixed(4)} moving=${moving.toFixed(4)}`);
  }

  {
    const w = new Weapon(Weapons.vantage);
    for (let i = 0; i < 80; i++) w.update(DT);
    const still = { speed: 0, speedFrac: 0, grounded: true, crouching: false, silentWalk: false, airborne: false, justJumped: false, turnPenalty: 0 };
    for (let i = 0; i < 600; i++) { w.update(DT); w.tryFire(true, false, still, null); }
    const emptied = w.magazine;
    w.startReload();
    for (let i = 0; i < Weapons.vantage.reloadTime / DT + 5; i++) w.update(DT);
    check('reload empties reserve into mag', w.magazine > emptied && w.magazine <= Weapons.vantage.magazine,
      `mag ${emptied} -> ${w.magazine}, reserve=${w.reserve}`);
  }

  {
    const scene = new THREE.Scene();
    const t = new Target(scene, new THREE.Vector3(0, 0, -10));
    const hs = new HitSystem(scene, [t.mesh]);
    scene.updateMatrixWorld(true);
    const origin = new THREE.Vector3(0, 1.0, 0);
    const dir = new THREE.Vector3(0, 0, -1);
    const before = t.health;
    const res = hs.fireRay(origin, dir, 0, Weapons.marker);
    check('hitscan hits target & damages', res && res.target === t && t.health < before,
      `hp ${before} -> ${t.health}`);

    const near = hs._damageForDistance(Weapons.phantom, 10);
    const far = hs._damageForDistance(Weapons.phantom, 100);
    check('damage falloff reduces at range', far < near && far >= Weapons.phantom.damage * Weapons.phantom.minDamageFrac - 0.01,
      `near=${near.toFixed(1)} far=${far.toFixed(1)}`);
  }

  {
    const scene = new THREE.Scene();
    const t = new Target(scene, new THREE.Vector3(0, 0, -12));
    const hs = new HitSystem(scene, [t.mesh]);
    scene.updateMatrixWorld(true);

    const headY = t.headMinY + 0.08;
    const bodyY = t.feetY + 1.05;

    t.health = t.maxHealth; t._downTimer = 0; t.mesh.rotation.z = 0;
    const bodyShot = hs.fireRay(new THREE.Vector3(0, bodyY, 0), new THREE.Vector3(0, 0, -1), 0, Weapons.vantage);
    const bodyDmg = bodyShot ? bodyShot.damage : 0;

    t.health = t.maxHealth; t._downTimer = 0; t.mesh.rotation.z = 0;
    const headShot = hs.fireRay(new THREE.Vector3(0, headY, 0), new THREE.Vector3(0, 0, -1), 0, Weapons.vantage);
    const headDmg = headShot ? headShot.damage : 0;

    check('body shot classified body', bodyShot && bodyShot.zone === 'body', `zone=${bodyShot && bodyShot.zone}`);
    check('head shot classified head', headShot && headShot.zone === 'head', `zone=${headShot && headShot.zone}`);
    check('body damage matches weapon body value', Math.abs(bodyDmg - Weapons.vantage.damage) < 0.5,
      `body=${bodyDmg.toFixed(1)} expected=${Weapons.vantage.damage}`);
    check('headshot damage matches weapon head value', Math.abs(headDmg - Weapons.vantage.headshotDamage) < 0.5,
      `head=${headDmg.toFixed(1)} expected=${Weapons.vantage.headshotDamage}`);

    let headHits = 0, tries = 0;
    for (let dy = -0.12; dy <= 0.18; dy += 0.03) {
      for (let dx = -0.12; dx <= 0.12; dx += 0.06) {
        tries++;
        t.health = t.maxHealth; t._downTimer = 0; t.mesh.rotation.z = 0;
        const eye = new THREE.Vector3(dx, t.headMinY + 0.05 + Math.max(0, dy), 0);
        const r = hs.fireRay(eye, new THREE.Vector3(0, 0, -1), 0, Weapons.marker);
        if (r && r.target && r.zone === 'head') headHits++;
      }
    }
    check('head-band hits reliably register head', headHits >= tries * 0.75,
      `headHits=${headHits}/${tries}`);
  }

  {
    const scene = new THREE.Scene();
    const hs = new HitSystem(scene, []);
    const dir = new THREE.Vector3(0, 0, -1);
    let maxDev = 0;
    for (let i = 0; i < 200; i++) {
      const d = hs._applySpread(dir, 0.05);
      maxDev = Math.max(maxDev, dir.angleTo(d));
    }
    check('spread deviates within cone', maxDev > 0.001 && maxDev <= 0.05 + 1e-3, `maxDev=${maxDev.toFixed(4)}`);
    const zero = hs._applySpread(dir, 0);
    check('zero spread = no deviation', dir.angleTo(zero) < 1e-6, `dev=${dir.angleTo(zero)}`);
  }

  {
    const scene = new THREE.Scene();
    const t = new Target(scene, new THREE.Vector3(0, 0, -20));
    const hs = new HitSystem(scene, [t.mesh]);
    scene.updateMatrixWorld(true);
    const before = t.health;
    const res = hs.fireRay(new THREE.Vector3(0, t.feetY + 1.05, 0), new THREE.Vector3(0, 0, -1), 0, Weapons.operator);
    check('sniper body damage is 150', res && Math.abs(res.damage - 150) < 0.5, `dmg=${res && res.damage.toFixed(1)}`);
    check('sniper one-shots a 150HP body', res && res.killed, `hp ${before} -> ${t.health} killed=${res && res.killed}`);
  }

  {
    check('sniper is a scoped weapon', Weapons.operator.scope === true, `scope=${Weapons.operator.scope}`);
  }

  {
    const w = new Weapon(Weapons.operator);
    for (let i = 0; i < 200; i++) w.update(DT);
    w.magazine = 0;
    const p0 = w.reloadProgress;
    w.startReload();
    for (let i = 0; i < (w.def.reloadTime * 0.5) / DT; i++) w.update(DT);
    const pMid = w.reloadProgress;
    for (let i = 0; i < (w.def.reloadTime * 0.6) / DT; i++) w.update(DT);
    const pEnd = w.reloadProgress;
    check('reloadProgress ramps then resets', p0 === 0 && pMid > 0.3 && pMid < 0.7 && pEnd === 0,
      `p0=${p0} mid=${pMid.toFixed(2)} end=${pEnd}`);
  }

  {
    const still = { speed: 0, speedFrac: 0, grounded: true, crouching: false, silentWalk: false, airborne: false, justJumped: false, turnPenalty: 0 };
    const fakeCam = {
      camera: { quaternion: new THREE.Quaternion(), fov: 90, updateProjectionMatrix() {} },
      setAiming() {}, addRecoil() {}, getAimDirection: () => new THREE.Vector3(0, 0, -1),
    };
    const mgr = new WeaponManager({
      camera: fakeCam, hitSystem: { fireRay: () => null }, audio: null, hud: null,
      getEyePosition: () => new THREE.Vector3(), getMoveState: () => still,
    });
    const NA = { fireDown: false, altDown: false, reloadPressed: false, slotPrimary: false, slotSecondary: false };
    for (let i = 0; i < 200; i++) mgr.update(DT, NA);
    mgr.current.magazine = 1; mgr.current.reserve = 10;

    for (let i = 0; i < 5; i++) mgr.update(DT, { ...NA, fireDown: true });
    mgr.update(DT, NA);
    const reloadingAuto = mgr.current.state === 'reloading';

    for (let i = 0; i < mgr.current.def.reloadTime / DT + 5; i++) mgr.update(DT, NA);
    check('auto-reload triggers when empty', reloadingAuto, `state=${mgr.current.state}`);
    check('auto-reload refills the magazine', mgr.current.magazine > 0, `mag=${mgr.current.magazine} reserve=${mgr.current.reserve}`);
  }

  {
    const fakeCam = {
      camera: { quaternion: new THREE.Quaternion(), fov: 90, updateProjectionMatrix() {} },
      setAiming() {}, addRecoil() {}, getAimDirection: () => new THREE.Vector3(0, 0, -1),
    };
    const mgr = new WeaponManager({
      camera: fakeCam, hitSystem: { fireRay: () => null }, audio: null, hud: null,
      getEyePosition: () => new THREE.Vector3(), getMoveState: () => ({}),
    });
    const startId = mgr.current.def.id;
    const dropped = mgr.swapSlotWeapon('operator');
    check('pickup swaps in the new weapon', mgr.current.def.id === 'operator', `now=${mgr.current.def.id}`);
    check('pickup returns the replaced weapon', dropped === startId, `dropped=${dropped}`);
    const dropped2 = mgr.swapSlotWeapon(startId);
    check('pickup can swap back', mgr.current.def.id === startId && dropped2 === 'operator', `now=${mgr.current.def.id} dropped=${dropped2}`);
  }

  {
    const expected = ['classic','shorty','frenzy','ghost','marker','stinger','spectre',
      'bulldog','guardian','phantom','vantage','bucky','judge','marshal','outlaw','operator','ares','odin'];
    const missing = expected.filter((id) => !Weapons[id]);
    check('all arsenal weapons defined', missing.length === 0, `missing=${missing.join(',') || 'none'}`);
    const bad = expected.filter((id) => Weapons[id] && !(Weapons[id].category && Weapons[id].slot && Weapons[id].price !== undefined));
    check('weapons have category/slot/price', bad.length === 0, `bad=${bad.join(',') || 'none'}`);
    check('shotguns fire multiple pellets', Weapons.bucky.pellets > 1 && Weapons.judge.pellets > 1,
      `bucky=${Weapons.bucky.pellets} judge=${Weapons.judge.pellets}`);
  }

  {
    const dmg = (id) => `${Weapons[id].damage}/${Weapons[id].headshotDamage}`;
    const expect = {
      classic: '26/78', ghost: '30/105', marker: '55/159', frenzy: '26/78', shorty: '12/24',
      stinger: '27/67', spectre: '26/78', bulldog: '35/115', guardian: '65/195',
      phantom: '39/156', vantage: '40/160', bucky: '22/44', judge: '17/34',
      marshal: '101/202', outlaw: '140/238', operator: '150/255', ares: '20/72', odin: '30/95',
    };
    const wrong = Object.keys(expect).filter((id) => dmg(id) !== expect[id]);
    check('configured weapon damage values applied', wrong.length === 0,
      wrong.length ? wrong.map((id) => `${id}:${dmg(id)}≠${expect[id]}`).join(' ') : 'all match');
    check('shotgun pellet counts (Bucky 15, Judge 12)', Weapons.bucky.pellets === 15 && Weapons.judge.pellets === 12,
      `bucky=${Weapons.bucky.pellets} judge=${Weapons.judge.pellets}`);
  }

  {
    const fakeCam = {
      camera: { quaternion: new THREE.Quaternion(), fov: 90, updateProjectionMatrix() {} },
      setAiming() {}, addRecoil() {}, getAimDirection: () => new THREE.Vector3(0, 0, -1),
    };
    const still = { speed: 0, speedFrac: 0, grounded: true, crouching: false, silentWalk: false, airborne: false, justJumped: false, turnPenalty: 0 };
    const mgr = new WeaponManager({
      camera: fakeCam, hitSystem: { fireRay: () => null }, audio: null, hud: null,
      getEyePosition: () => new THREE.Vector3(), getMoveState: () => still,
    });
    const NA = { fireDown: false, altDown: false, reloadPressed: false, slotPrimary: false, slotSecondary: false };
    mgr.swapSlotWeapon('operator');
    for (let i = 0; i < 200; i++) mgr.update(DT, NA);

    for (let i = 0; i < 10; i++) mgr.update(DT, { ...NA, altDown: true });
    const scopedBefore = mgr.scoped;

    mgr.update(DT, { ...NA, altDown: true, fireDown: true });

    for (let i = 0; i < 5; i++) mgr.update(DT, { ...NA, altDown: true });
    const scopedAfter = mgr.scoped;

    mgr.update(DT, NA);
    for (let i = 0; i < 10; i++) mgr.update(DT, { ...NA, altDown: true });
    const scopedReacquired = mgr.scoped;
    check('sniper is scoped before firing', scopedBefore === true, `scoped=${scopedBefore}`);
    check('sniper unscopes after a shot (RMB held)', scopedAfter === false, `scoped=${scopedAfter}`);
    check('sniper re-scopes after releasing RMB', scopedReacquired === true, `scoped=${scopedReacquired}`);
  }

  const passed = results.filter(r => r.pass).length;
  return { passed, total: results.length, results };
}

// This audit waits for the actual Higgs GLB, then tries to push a player at
// speed through every generated blocker from every face and corner. It guards
// against a wall looking solid while its movement volume has a gap.
export async function runArenaCollisionAudit() {
  const map = buildArena(new THREE.Scene());
  const loaded = await map.ready;
  if (!loaded.loaded) return { passed: 0, total: 1, failures: [`Sunline Arena did not load: ${loaded.error || 'unknown error'}`], blockers: 0 };

  const blockers = map.world.boxes.filter((box) => !box.walkable);
  const failures = [];
  const radius = M.radius;
  const eps = 0.025;
  const probe = (box, label, start, velocity, pass) => {
    // Isolate the selected imported blocker. Adjacent walls intentionally
    // overlap at map corners, which is correct in-game but would otherwise
    // make a probe look as if it had missed the wall being measured.
    const testWorld = new CollisionWorld();
    testWorld.addBox({ x: -200, y: -1, z: -200 }, { x: 200, y: 0.06, z: 200 });
    testWorld.addBox(box.min.clone(), box.max.clone(), { walkable: false });
    const mc = new MovementController(testWorld, start);
    mc.velocity.copy(velocity);
    // Deliberately far beyond a normal frame's travel: this verifies that the
    // swept movement code cannot tunnel across the full blocker.
    mc._integrate(0.55);
    if (!pass(mc.position)) failures.push(`${label} ended at ${mc.position.x.toFixed(2)},${mc.position.z.toFixed(2)}`);
  };
  const cornerProbe = (box, label) => {
    const testWorld = new CollisionWorld();
    testWorld.addBox({ x: -200, y: -1, z: -200 }, { x: 200, y: 0.06, z: 200 });
    testWorld.addBox(box.min.clone(), box.max.clone(), { walkable: false });
    const mc = new MovementController(testWorld,
      new THREE.Vector3(box.min.x - radius - eps, 0, box.min.z - radius - eps));
    mc.velocity.set(120, 0, 120);
    for (let frame = 0; frame < 66; frame++) {
      mc._integrate(1 / 120);
      const inside = mc.position.x > box.min.x - radius + eps && mc.position.x < box.max.x + radius - eps
        && mc.position.z > box.min.z - radius + eps && mc.position.z < box.max.z + radius - eps;
      if (inside) {
        failures.push(`${label} entered at ${mc.position.x.toFixed(2)},${mc.position.z.toFixed(2)}`);
        return;
      }
    }
  };

  for (const [i, box] of blockers.entries()) {
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
    const s = 120;
    probe(box, `wall ${i} west face`, new THREE.Vector3(box.min.x - radius - eps, 0, cz), new THREE.Vector3(s, 0, 0),
      (p) => p.x <= box.min.x - radius + eps);
    probe(box, `wall ${i} east face`, new THREE.Vector3(box.max.x + radius + eps, 0, cz), new THREE.Vector3(-s, 0, 0),
      (p) => p.x >= box.max.x + radius - eps);
    probe(box, `wall ${i} north face`, new THREE.Vector3(cx, 0, box.min.z - radius - eps), new THREE.Vector3(0, 0, s),
      (p) => p.z <= box.min.z - radius + eps);
    probe(box, `wall ${i} south face`, new THREE.Vector3(cx, 0, box.max.z + radius + eps), new THREE.Vector3(0, 0, -s),
      (p) => p.z >= box.max.z + radius - eps);
    cornerProbe(box, `wall ${i} corner`);
  }
  return { passed: blockers.length * 5 - failures.length, total: blockers.length * 5, failures, blockers: blockers.length };
}
