import * as THREE from 'three';

const EPS = 1e-3;

export class Box {
  constructor(min, max, { walkable = true } = {}) {
    this.min = min; this.max = max;
    // Floors, ramps and props may be landed on.  A wall must still collide,
    // but can never become a step/ground surface.
    this.walkable = walkable;
  }
}

export class Ramp {
  constructor(minX, maxX, minZ, maxZ, yLow, yHigh, axis ) {
    this.minX = minX; this.maxX = maxX;
    this.minZ = minZ; this.maxZ = maxZ;
    this.yLow = yLow; this.yHigh = yHigh;
    this.axis = axis;
  }
  contains(x, z) {
    return x >= this.minX - EPS && x <= this.maxX + EPS &&
           z >= this.minZ - EPS && z <= this.maxZ + EPS;
  }
  heightAt(x, z) {
    const t = this.axis === 'x'
      ? (x - this.minX) / (this.maxX - this.minX)
      : (z - this.minZ) / (this.maxZ - this.minZ);
    const tc = Math.max(0, Math.min(1, t));
    return this.yLow + (this.yHigh - this.yLow) * tc;
  }
}

export class CollisionWorld {
  constructor() {
    this.boxes = [];
    this.ramps = [];
  }
  addBox(min, max, options) { this.boxes.push(new Box(min, max, options)); return this; }
  addRamp(r) { this.ramps.push(r); return this; }

  groundHeight(x, z, feetY, stepHeight) {
    let best = null;
    for (const b of this.boxes) {
      if (!b.walkable) continue;
      if (x < b.min.x - EPS || x > b.max.x + EPS) continue;
      if (z < b.min.z - EPS || z > b.max.z + EPS) continue;
      const top = b.max.y;
      if (top <= feetY + stepHeight + EPS) {
        if (best === null || top > best) best = top;
      }
    }
    for (const r of this.ramps) {
      if (!r.contains(x, z)) continue;
      const top = r.heightAt(x, z);
      if (top <= feetY + stepHeight + 0.6) {
        if (best === null || top > best) best = top;
      }
    }
    return best;
  }

  resolveHorizontal(pos, radius, feetY, height, stepHeight, velocity = null) {
    const headY = feetY + height;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const b of this.boxes) {

        // A low *walkable* prop is a step. A wall stays solid at every height.
        if (b.walkable && b.max.y <= feetY + stepHeight + EPS) continue;

        if (b.min.y >= headY - EPS) continue;
        if (b.max.y <= feetY + EPS) continue;

        const minX = b.min.x - radius, maxX = b.max.x + radius;
        const minZ = b.min.z - radius, maxZ = b.max.z + radius;
        if (pos.x <= minX || pos.x >= maxX || pos.z <= minZ || pos.z >= maxZ) continue;

        const penXpos = maxX - pos.x;
        const penXneg = pos.x - minX;
        const penZpos = maxZ - pos.z;
        const penZneg = pos.z - minZ;
        const minPenX = Math.min(penXpos, penXneg);
        const minPenZ = Math.min(penZpos, penZneg);
        let nx = 0, nz = 0;
        if (minPenX <= minPenZ) {
          if (penXpos < penXneg) { pos.x += penXpos; nx = 1; }
          else { pos.x -= penXneg; nx = -1; }
        } else {
          if (penZpos < penZneg) { pos.z += penZpos; nz = 1; }
          else { pos.z -= penZneg; nz = -1; }
        }
        // Remove only the component driving into the surface. Tangential
        // speed remains, so players slide cleanly along walls instead of
        // repeatedly forcing themselves into collision every physics tick.
        if (velocity) {
          const into = velocity.x * nx + velocity.z * nz;
          if (into < 0) {
            velocity.x -= nx * into;
            velocity.z -= nz * into;
          }
        }
        moved = true;
      }
      if (!moved) break;
    }
  }

  hasCeilingObstruction(x, z, fromY, toY, radius) {
    for (const b of this.boxes) {
      if (x < b.min.x - radius || x > b.max.x + radius) continue;
      if (z < b.min.z - radius || z > b.max.z + radius) continue;
      if (b.min.y < toY - EPS && b.max.y > fromY + EPS) return true;
    }
    return false;
  }
}

export { THREE };
