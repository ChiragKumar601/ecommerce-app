/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API_TARGET = process.env['API_TARGET'] ?? 'http://localhost:4000';

// The dev and preview servers proxy /api to the Express backend so the browser sees a
// single origin: same-origin session cookies, no CORS (plan §7.1, PR-07). /media serves catalogue images.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: true, proxy: { '/api': API_TARGET, '/media': API_TARGET } },
  // mapbox-gl is one large chunk, but it loads only on the address map step (FE-006).
  build: { chunkSizeWarningLimit: 2000 },
  preview: { port: 4173, strictPort: true, proxy: { '/api': API_TARGET, '/media': API_TARGET } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/unit/**/*.test.{ts,tsx}'],
  },
});
