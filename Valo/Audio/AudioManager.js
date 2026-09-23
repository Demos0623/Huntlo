import { Audio as Cfg } from '../config.js';

const FIRE_SOUNDS = {
  _default: { tone: [180, 'square', 80, 0.07, 0.42], noise: [3200, 0.08, 0.42] },

  classic:  { tone: [250, 'square', 110, 0.06, 0.38], noise: [3000, 0.07, 0.4] },
  shorty:   { tone: [150, 'square', 70, 0.09, 0.5], sub: [60, 'sine', 0.14, 0.4], noise: [1400, 0.12, 0.5] },
  frenzy:   { tone: [320, 'square', 160, 0.045, 0.32], noise: [3600, 0.05, 0.36] },
  ghost:    { tone: [200, 'sine', 130, 0.06, 0.3], noise: [1900, 0.06, 0.24] },
  marker:   { tone: [180, 'sawtooth', 80, 0.1, 0.5], sub: [70, 'sine', 0.1, 0.3], noise: [2600, 0.12, 0.5] },

  stinger:  { tone: [360, 'square', 200, 0.04, 0.3], noise: [3900, 0.045, 0.34] },
  spectre:  { tone: [320, 'square', 180, 0.05, 0.32], noise: [3300, 0.055, 0.34] },

  bulldog:  { tone: [210, 'square', 95, 0.07, 0.42], noise: [3000, 0.08, 0.4] },
  guardian: { tone: [170, 'sawtooth', 80, 0.09, 0.5], sub: [70, 'sine', 0.1, 0.3], noise: [2600, 0.1, 0.46] },
  phantom:  { tone: [230, 'sine', 120, 0.06, 0.34], noise: [2100, 0.06, 0.3] },
  vantage:  { tone: [185, 'square', 82, 0.07, 0.44], sub: [72, 'sine', 0.09, 0.3], noise: [3300, 0.08, 0.44] },

  bucky:    { tone: [110, 'square', 55, 0.12, 0.55], sub: [52, 'sine', 0.18, 0.42], noise: [1200, 0.16, 0.55] },
  judge:    { tone: [132, 'sawtooth', 66, 0.1, 0.5], sub: [58, 'sine', 0.15, 0.36], noise: [1500, 0.14, 0.5] },

  marshal:  { tone: [195, 'square', 82, 0.12, 0.5], sub: [82, 'sine', 0.2, 0.4], noise: [2600, 0.14, 0.5] },
  outlaw:   { tone: [150, 'sawtooth', 68, 0.16, 0.6], sub: [58, 'sine', 0.3, 0.5], noise: [2000, 0.2, 0.58] },
  operator: { tone: [128, 'sawtooth', 58, 0.2, 0.65], sub: [44, 'sine', 0.42, 0.55], noise: [1800, 0.26, 0.6] },
  requiem:  { tone: [120, 'sawtooth', 54, 0.22, 0.65], sub: [42, 'sine', 0.46, 0.6], noise: [1700, 0.28, 0.6] },

  ares:     { tone: [172, 'square', 90, 0.07, 0.45], sub: [70, 'sine', 0.1, 0.34], noise: [2400, 0.08, 0.45] },
  odin:     { tone: [150, 'square', 78, 0.08, 0.5], sub: [58, 'sine', 0.12, 0.44], noise: [2000, 0.09, 0.5] },
};

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this._footAccum = 0;
  }

  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = Cfg.masterVolume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  _noiseBurst(dur, filterFreq, gain, type = 'lowpass', delay = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = type; filt.frequency.value = filterFreq;
    const g = ctx.createGain();
    const t = ctx.currentTime + delay;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }

  _ping(freq, { dur = 0.14, gain = 0.3, type = 'sine', slideTo = null, attack = 0.006, delay = 0 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    const t = ctx.currentTime + delay;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  _tone(freq, dur, gain, type = 'square', slideTo = null) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    const t = ctx.currentTime;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(); o.stop(t + dur);
  }

  playFire(weaponId) {
    const p = FIRE_SOUNDS[weaponId] || FIRE_SOUNDS._default;
    if (p.tone) this._tone(p.tone[0], p.tone[3], p.tone[4], p.tone[1], p.tone[2]);
    if (p.sub) this._tone(p.sub[0], p.sub[2], p.sub[3], p.sub[1] || 'sine', p.sub[0] * 0.6);
    if (p.noise) this._noiseBurst(p.noise[1], p.noise[0], p.noise[2]);
  }

  playEmpty() { this._tone(1200, 0.04, 0.25, 'square', 700); }

  playDamage(headshot = false, intensity = 1) {
    const amount = Math.max(0.35, Math.min(1.3, intensity));
    this._noiseBurst(headshot ? 0.07 : 0.05, headshot ? 2200 : 1100, 0.16 * amount, 'bandpass');
    this._ping(headshot ? 190 : 110, {
      dur: headshot ? 0.16 : 0.11,
      gain: 0.18 * amount,
      type: 'triangle',
      slideTo: headshot ? 90 : 65,
      attack: 0.003,
    });
  }

  playReload(duration) {

    this._tone(600, 0.05, 0.3, 'square', 300);
    setTimeout(() => this._tone(400, 0.05, 0.28, 'square', 200), duration * 500);
    setTimeout(() => this._tone(800, 0.05, 0.3, 'square', 500), duration * 900);
  }

  playSwitch() { this._tone(500, 0.06, 0.28, 'triangle', 900); }

  // Deep nuke boom: sharp crack + low rumble + sub-bass drop + a rumbling tail.
  playExplosion() {
    if (!this.ctx) return;
    this._noiseBurst(0.16, 2600, 0.5, 'lowpass', 0);   // initial crack
    this._noiseBurst(1.2, 430, 0.6, 'lowpass', 0);     // body rumble
    this._ping(120, { dur: 1.0, gain: 0.6, type: 'sine', slideTo: 30, attack: 0.005 });
    this._ping(72, { dur: 1.3, gain: 0.5, type: 'triangle', slideTo: 26, attack: 0.01 });
    this._noiseBurst(0.9, 250, 0.4, 'lowpass', 0.28);  // secondary rumble
  }

  playHit(killed, headshot = false) {

    if (headshot) {
      this.playHeadshotSpark(killed);
      return;
    }

    if (!killed) {
      this._tone(1400, 0.05, 0.3, 'sine', 1100);
      return;
    }

    this._killChime(false);
  }

  // Short glassy crack paired with the oversized gold spark. This plays for
  // every confirmed headshot, including ones that do not kill the target.
  playHeadshotSpark(killed = false) {
    this._noiseBurst(0.032, 5200, 0.16, 'highpass');
    this._ping(2440, { dur: 0.075, gain: 0.28, type: 'triangle', slideTo: 1760, attack: 0.002 });
    this._ping(3520, { dur: 0.055, gain: 0.14, type: 'sine', slideTo: 2920, attack: 0.002, delay: 0.012 });
    if (killed) this._killChime(true);
  }

  _killChime(headshot) {

    this._noiseBurst(0.045, 3400, 0.28, 'bandpass', 0);
    this._ping(headshot ? 180 : 150, { dur: 0.18, gain: 0.34, type: 'sine', slideTo: headshot ? 80 : 66, attack: 0.004 });

    const notes = headshot ? [1046, 1568, 2093] : [784, 1046, 1568];
    const step = 0.052;
    notes.forEach((f, i) => {
      const last = i === notes.length - 1;
      const dur = last ? 0.34 : 0.13;
      const gain = last ? 0.32 : 0.26;
      this._ping(f, { dur, gain, type: 'triangle', delay: i * step, attack: 0.005 });
      this._ping(f * 2, { dur: dur * 0.8, gain: gain * 0.45, type: 'sine', delay: i * step, attack: 0.004 });
    });

    if (headshot) this._ping(3136, { dur: 0.4, gain: 0.16, type: 'sine', delay: 2 * step + 0.02, attack: 0.004 });
  }

  updateFootsteps(dt, { speed, grounded, silentWalk, crouching }) {
    if (!grounded || speed < 0.6) { this._footAccum = 0; return; }
    const speedRef = 6.6;
    const interval = Cfg.footstepInterval * (speedRef / Math.max(1, speed));
    this._footAccum += dt;
    if (this._footAccum >= interval) {
      this._footAccum = 0;
      let vol = 0.25;
      if (silentWalk) vol = 0.05;
      else if (crouching) vol = 0.12;
      this._noiseBurst(0.06, 900, vol);
    }
  }
}
