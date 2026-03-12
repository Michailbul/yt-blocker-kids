import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
  },
  resolve: {
    dedupe: ['convex', 'react', 'react-dom'],
  },
});
