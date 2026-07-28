// Diagnostic: what WebGL capabilities does the headless capture browser actually expose?
// SwiftShader is software rendering, so treat any fps it reports as meaningless — validate
// performance against the draw-call/triangle budget in ARCHITECTURE.md §7 instead.
import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--enable-webgl','--disable-dev-shm-usage'] });
const p = await b.newPage({ viewport: { width: 400, height: 300 } });
await p.setContent(`<canvas id=c width=400 height=300></canvas><script>
const gl = document.getElementById('c').getContext('webgl2');
window.__r = gl ? {
  ok: true,
  ver: gl.getParameter(gl.VERSION),
  renderer: gl.getParameter(gl.RENDERER),
  halfFloatLinear: !!gl.getExtension('OES_texture_half_float_linear'),
  colorBufferFloat: !!gl.getExtension('EXT_color_buffer_float'),
  floatLinear: !!gl.getExtension('OES_texture_float_linear'),
  maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE),
  drawBuffers: gl.getParameter(gl.MAX_DRAW_BUFFERS),
} : { ok: false };
if (gl) { gl.clearColor(0.9,0.3,0.1,1); gl.clear(gl.COLOR_BUFFER_BIT); }
<\/script>`);
console.log(JSON.stringify(await p.evaluate(() => window.__r), null, 1));
await b.close();
