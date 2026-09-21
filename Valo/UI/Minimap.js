// Sunline's imported arena uses stone floors, plaster walls and wood cover.
// Keep the tactical view in that same neutral palette rather than retaining
// the old teal/mauve blockout colors.
const ZONE_FILL = { teal: '#667772', gray: '#77817f', mauve: '#726c68' };

export class Minimap {
  constructor(root, { areas, walls, covers, bounds }) {
    this.areas = areas;
    this.walls = walls || [];
    this.covers = covers || [];
    this.b = bounds;

    this.wrap = document.createElement('div');
    this.wrap.id = 'v-minimap';
    this.canvas = document.createElement('canvas');
    // Match the canvas aspect ratio to the *current* arena bounds. The old
    // fixed 220×240 canvas was too wide for Sunline's 50×66 play space, so
    // the map stopped short of the right edge of its black HUD frame.
    const pad = 10;
    const wW = this.b.maxX - this.b.minX, wD = this.b.maxZ - this.b.minZ;
    this.canvas.width = 220;
    this.canvas.height = Math.ceil((this.canvas.width - pad * 2) * (wD / wW) + pad * 2);
    this.wrap.appendChild(this.canvas);
    root.appendChild(this.wrap);
    this.ctx = this.canvas.getContext('2d');

    const sx = (this.canvas.width - pad * 2) / wW;
    const sz = (this.canvas.height - pad * 2) / wD;
    this._s = Math.min(sx, sz);
    // Centre the exact playable footprint in the available space. This also
    // keeps future non-square map revisions visually balanced.
    this._ox = pad + (this.canvas.width - pad * 2 - wW * this._s) / 2 - this.b.minX * this._s;
    this._oz = pad + (this.canvas.height - pad * 2 - wD * this._s) / 2 - this.b.minZ * this._s;

    this._drawStatic();
  }

  _wx(x) { return this._ox + x * this._s; }
  _wz(z) { return this._oz + z * this._s; }

  _drawStatic() {
    const c = document.createElement('canvas');
    c.width = this.canvas.width; c.height = this.canvas.height;
    const g = c.getContext('2d');
    g.fillStyle = '#11171a';
    g.fillRect(0, 0, c.width, c.height);

    for (const a of this.areas) {
      g.fillStyle = ZONE_FILL[a.zone] || '#444';
      g.fillRect(this._wx(a.cx - a.w / 2), this._wz(a.cz - a.d / 2),
        Math.ceil(a.w * this._s), Math.ceil(a.d * this._s));
    }

    // The two-pass wall treatment mirrors the actual plaster walls: a dark
    // structural outline with a subtle edge highlight, so routes read cleanly
    // without reverting to the old abstract line drawing.
    g.strokeStyle = '#20292d';
    g.lineWidth = Math.max(3, this._s * 0.48); g.lineCap = 'square';
    g.beginPath();
    for (const w of this.walls) {
      g.moveTo(this._wx(w.x1), this._wz(w.z1));
      g.lineTo(this._wx(w.x2), this._wz(w.z2));
    }
    g.stroke();

    g.strokeStyle = 'rgba(205, 215, 211, 0.48)';
    g.lineWidth = 1;
    g.beginPath();
    for (const w of this.walls) {
      g.moveTo(this._wx(w.x1), this._wz(w.z1));
      g.lineTo(this._wx(w.x2), this._wz(w.z2));
    }
    g.stroke();

    g.fillStyle = '#806a4c';
    g.strokeStyle = '#2b251f';
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
