import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    minify: 'terser',
    terserOptions: { compress: { passes: 2, drop_console: true }, format: { comments: false } },
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'] },
      },
    },
    chunkSizeWarningLimit: 2000,
  },
  server: { host: '0.0.0.0', port: 5173 },
});
