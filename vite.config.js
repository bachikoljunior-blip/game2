import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

/**
 * The revision the F6 floor gate compares against. It must be reachable from the *public*
 * surface, not just from the bundle, because the failure F6 exists to catch is "the deploy
 * job went green but the old revision is still being served" — and that is only detectable
 * by fetching the page and reading what is actually there.
 */
function buildRevision() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

/** Injects the revision as a meta tag so `floor-gate.mjs f6` can read it over HTTP. */
function revisionMeta() {
  const rev = buildRevision();
  return {
    name: 'kagerou-revision-meta',
    transformIndexHtml(html) {
      return html.replace(
        /<head>/i,
        `<head>\n    <meta name="kagerou-build-revision" content="${rev}">`,
      );
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [revisionMeta()],
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
