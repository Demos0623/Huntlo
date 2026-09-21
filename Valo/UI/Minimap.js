// Keep the map legend in lockstep with the floor tints in World/Arena.js.
const ZONE_FILL = { teal: '#2f8178', gray: '#7395a8', mauve: '#9b515d' };

export class Minimap {
  constructor(root, { areas, walls, covers, bounds }) {
    this.areas = areas;
    this.walls = walls || [];
    this.covers = covers || [];
    this.b = bounds;

    this.wrap = document.createElement('div');
    this.wrap.id = 'v-minimap';
    this.canvas = document.createElement('canvas');
    this.canvas.width = 220; this.canvas.height = 240;
    this.wrap.appendChild(this.canvas);
    root.appendChild(this.wrap);
    this.ctx = this.canvas.getContext('2d');

    const pad = 10;
    const wW = this.b.maxX - this.b.minX, wD = this.b.maxZ - this.b.minZ;
    const sx = (this.canvas.width - pad * 2) / wW;
    const sz = (this.canvas.height - pad * 2) / wD;
    this._s = Math.min(sx, sz);
    this._ox = pad - this.b.minX * this._s;
    this._oz = pad - this.b.minZ * this._s;

    this._drawStatic();
  }

  _wx(x) { return this._ox + x * this._s; }
  _wz(z) { return this._oz + z * this._s; }

  _drawStatic() {
    const c = document.createElement('canvas');
    c.width = this.canvas.width; c.height = this.canvas.height;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(14,17,22,0.7)';
    g.fillRect(0, 0, c.width, c.height);

    for (const a of this.areas) {
      g.fillStyle = ZONE_FILL[a.zone] || '#444';
      g.fillRect(this._wx(a.cx - a.w / 2), this._wz(a.cz - a.d / 2),
        Math.ceil(a.w * this._s), Math.ceil(a.d * this._s));
    }

    g.strokeStyle = 'rgba(207,214,226,0.75)';
    g.lineWidth = 1; g.lineCap = 'round';
    g.beginPath();
    for (const w of this.walls) {
      g.moveTo(this._wx(w.x1), this._wz(w.z1));
      g.lineTo(this._wx(w.x2), this._wz(w.z2));
    }
    g.stroke();

    g.fillStyle = 'rgba(196,182,150,0.7)';
    g.strokeStyle = 'rgba(20,24,30,0.8)';
    g.lineWidth = 1;
    for (const cv of this.covers) {
      const x = this._wx(cv.cx - cv.w / 2), y = this._wz(cv.cz - cv.d / 2);
      const w = Math.max(2, cv.w * this._s), h = Math.max(2, cv.d * this._s);
      g.fillRect(x, y, w, h);
      g.strokeRect(x, y, w, h);
    }
    this._static = c;
  }

  update(player, yaw, enemies = [], fovHalf = 0.6, players = []) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this._static, 0, 0);

    for (const e of enemies) {
      const ex = this._wx(e.x), ez = this._wz(e.z);
      ctx.fillStyle = '#ff4655';
      ctx.strokeStyle = '#2a0006'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(ex, ez, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }

    for (const p of players) {
      const px = this._wx(p.x), pz = this._wz(p.z);
      const fx = -Math.sin(p.yaw || 0), fz = -Math.cos(p.yaw || 0);
      ctx.fillStyle = '#ff8a3c';
      ctx.strokeStyle = '#2a1400'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(px, pz, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#ffd0a0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px, pz); ctx.lineTo(px + fx * 9, pz + fz * 9); ctx.stroke();
    }

    const px = this._wx(player.x), pz = this._wz(player.z);

    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);

    const centerAng = Math.atan2(fz, fx);
    const VIEW_RANGE = 34;
    const len = VIEW_RANGE * this._s;
    const grad = ctx.createRadialGradient(px, pz, 2, px, pz, len);
    grad.addColorStop(0, 'rgba(127,224,200,0.34)');
    grad.addColorStop(1, 'rgba(127,224,200,0.0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(px, pz);
    ctx.arc(px, pz, len, centerAng - fovHalf, centerAng + fovHalf);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#7fe0c8';
    ctx.strokeStyle = '#0e1116'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(px, pz, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
}
