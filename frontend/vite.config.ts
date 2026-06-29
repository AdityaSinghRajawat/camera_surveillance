import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev proxy: forward REST (/api) and WebSocket (/ws) to the backend so the dev
// server works same-origin without CORS. In prod, nginx performs the same proxy.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/ws': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
