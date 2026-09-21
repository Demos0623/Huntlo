export const Movement = {

  maxGroundSpeed: 6.6,
  walkSpeed: 6.6,
  crouchSpeed: 3.3,
  silentWalkSpeed: 3.4,

  acceleration: 90,
  deceleration: 110,
  friction: 11,
  stopSpeed: 1.6,

  airAcceleration: 16,
  airControl: 0.45,
  gravity: 20,
  jumpVelocity: 6.6,

  radius: 0.4,
  standingHeight: 1.8,
  crouchingHeight: 1.2,
  eyeOffset: 0.2,

  stepHeight: 0.42,
  crouchLerp: 12,

  turnPenaltyGain: 1.0,
  turnPenaltyDecay: 6.0,
};

export const Camera = {

  sensitivity: 0.000391,
  aimSensitivityScale: 1.0,
  pitchLimit: Math.PI / 2 - 0.02,
  recoilRecovery: 9.0,
  fov: 90,
  aimFov: 80,
  fovLerp: 12,
};

export const Accuracy = {
  baseMoveSpeedRef: 6.6,
  movingPenalty: 0.108,
  airPenalty: 0.22,
  jumpPenalty: 0.12,
  crouchBonus: 0.35,
  silentBonus: 0.85,
  turnPenaltyScale: 0.05,
  recoverRate: 14,
};

export const Combat = {
  headshotMultiplier: 2.3,
};

export const HUDConfig = {
  crosshairBaseGap: 5,
  crosshairSpreadPx: 900,
  crosshairLen: 7,
  crosshairThickness: 2,
  hitmarkerMs: 120,
};

export const Audio = {
  masterVolume: 0.5,
  footstepInterval: 0.42,
};
