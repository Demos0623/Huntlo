import * as THREE from 'three';

export class ESP {
  constructor(container, camera) {
    this.camera = camera;
    this.enabled = false;

    this.canvas = document.createElement('canvas');
    this.canvas.id = 'v-esp';
    this.canvas.style.cssText =
      'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:15;';
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    this._v = new THREE.Vector3();
    this._camPos = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._w = 0; this._h = 0;
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this._w = window.innerWidth; this._h = window.innerHeight;
    this.canvas.width = this._w * dpr;
    this.canvas.height = this._h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  setEnabled(v) {
    this.enabled = v;
    if (!v) this.ctx.clearRect(0, 0, this._w, this._h);
  }

  render(entities) {
    const ctx = this.ctx, W = this._w, H = this._h;
    ctx.clearRect(0, 0, W, H);
    if (!this.enabled) return;

    const cam = this.camera;
    cam.updateMatrixWorld();
    this._camPos.setFromMatrixPosition(cam.matrixWorld);
    this._fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);

    for (const e of entities) {
      const hw = e.halfW || 0.42, hd = e.halfW || 0.42, fy = e.feet.y, cx = e.feet.x, cz = e.feet.z;

      const toCX = cx - this._camPos.x, toCY = (fy + e.height * 0.5) - this._camPos.y, toCZ = cz - this._camPos.z;
      if (toCX * this._fwd.x + toCY * this._fwd.y + toCZ * this._fwd.z <= 0.1) continue;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let ix = -1; ix <= 1; ix += 2)
        for (let iz = -1; iz <= 1; iz += 2)
          for (let iy = 0; iy <= 1; iy++) {
            this._v.set(cx + ix * hw, fy + iy * e.height, cz + iz * hd).project(cam);
            const sx = (this._v.x * 0.5 + 0.5) * W;
            const sy = (-this._v.y * 0.5 + 0.5) * H;
            if (sx < minX) minX = sx; if (sx > maxX) maxX = sx;
            if (sy < minY) minY = sy; if (sy > maxY) maxY = sy;
          }

      const bw = maxX - minX, bh = maxY - minY;
      const col = e.color || '#ff3b3b';

      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.strokeRect(minX - 0.5, minY - 0.5, bw + 1, bh + 1);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = col;
      ctx.strokeRect(minX, minY, bw, bh);

      if (e.name) {
        ctx.font = '600 12px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.strokeText(e.name, (minX + maxX) / 2, minY - 5);
        ctx.fillStyle = col;
        ctx.fillText(e.name, (minX + maxX) / 2, minY - 5);
      }
    }
  }
}
