import { defineConfig } from 'vite';

/**
 * A one-file build for hosting somewhere that serves a single HTML document.
 *
 * The game already fetches nothing at runtime — every texture, mesh, animation and
 * sound is synthesised at boot — so the only thing standing between the normal build
 * and a self-contained page is code splitting. Turning that off and inlining the
 * result gives a page that works under a strict CSP with no external origins at all.
 */
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist-single',
    target: 'es2020',
    minify: 'terser',
    terserOptions: { compress: { passes: 2, drop_console: true }, format: { comments: false } },
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: {
      output: { inlineDynamicImports: true, manualChunks: undefined },
    },
  },
});
