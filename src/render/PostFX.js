/** PLACEHOLDER — replaced by the PostFX implementation pass. Keeps the tree buildable. */
export class PostFX {
  constructor(ctx) { this.ctx = ctx; }
  async init() {}
  update() {}
  dispose() {}
  setSize(w, h) { this._w = w; this._h = h; }
  render() { this.ctx.renderer.render(this.ctx.scene, this.ctx.camera); }
}
