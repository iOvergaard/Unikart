import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/Unikart/',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    target: 'es2020',
    sourcemap: true,
  },
});
