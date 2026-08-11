import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig(({ mode }) => {
  // Load environment variables based on the current mode (development/production)
  const env = loadEnv(mode, process.cwd(), '');
  
  // Get the API URL from environment variables
  const apiUrl = env.VITE_API_URL || 'http://localhost:3000';

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@orders/shared': resolve(__dirname, './shared/src'),
        '@': resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      // In development, we proxy /api to the backend
      // In production, this is ignored because we serve static files
      proxy: mode === 'development' ? {
        '/api': {
          target: apiUrl,
          changeOrigin: true,
        },
      } : undefined,
    },
    preview: {
      port: 4173,
      proxy: {
        '/api': {
          target: apiUrl,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  };
});