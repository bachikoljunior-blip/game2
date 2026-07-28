/** PLACEHOLDER — replaced by the Terrain implementation pass. Keeps the tree buildable. */
export class Terrain {
  constructor(ctx) { this.ctx = ctx; }
  async init() {}
  update() {}
  dispose() {}
  heightAt() { return 0; }
  normalAt(x, z, out) { return out ? out.set(0, 1, 0) : { x: 0, y: 1, z: 0 }; }
  surfaceAt() { return "grass"; }
}
