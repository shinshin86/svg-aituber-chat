import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/fish-audio': {
        target: 'https://api.fish.audio',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/fish-audio/, ''),
      },
    },
  },
  preview: {
    proxy: {
      '/api/fish-audio': {
        target: 'https://api.fish.audio',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/fish-audio/, ''),
      },
    },
  },
});
