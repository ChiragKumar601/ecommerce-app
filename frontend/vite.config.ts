/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API_TARGET = process.env['API_TARGET'] ?? 'http://localhost:4000';

// The dev and preview servers proxy /api to the Express backend so the browser sees a
// single origin: same-origin session cookies, no CORS (plan §7.1, PR-07).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: true, proxy: { '/api': { target: API_TARGET, changeOrigin: false } } },
  preview: { port: 4173, strictPort: true, proxy: { '/api': { target: API_TARGET, changeOrigin: false } } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/unit/**/*.test.{ts,tsx}'],
  },
});
