import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    minify: 'terser',
    // `drop_console: true` used to be here, and it cost round 17 most of a round.
    //
    // It strips EVERY `console.*` call from the bundle, including `main.js`'s
    // `console.error('[boot] system "<key>" failed', err)`. The capture rig judges the
    // production build, so the one diagnostic that says a subsystem failed to boot was
    // being deleted before the rig could ever observe it. Round 17 shipped a foliage
    // commit whose init threw; the whole foliage system vanished from all five frames —
    // 140,820 triangles and 14 draw calls to zero — and `report-r17v1.json` still came
    // back with `booted: true`, zero dead shader programs and "no non-warning console
    // errors". The failure was found by noticing the triangle counts had moved a long way
    // in a direction nobody predicted, which is luck, not method.
    //
    // So: keep `error` and `warn`, which is what the rig reads and what a human debugging
    // a boot failure needs. Drop the chatty levels, which is all `drop_console` was
    // actually wanted for. `pure_funcs` is used rather than terser's newer
    // `drop_console: { exclude: [...] }` because it works across terser versions.
    terserOptions: {
      compress: {
        passes: 2,
        drop_console: false,
        pure_funcs: ['console.log', 'console.debug', 'console.info', 'console.trace'],
      },
      format: { comments: false },
    },
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'] },
      },
    },
    chunkSizeWarningLimit: 2000,
  },
  server: { host: '0.0.0.0', port: 5173 },
});
