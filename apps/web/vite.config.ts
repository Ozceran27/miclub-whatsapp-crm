import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'react-is': fileURLToPath(new URL('./src/vendor/react-is.ts', import.meta.url))
    },
    extensions: ['.tsx', '.ts', '.jsx', '.js', '.json']
  },
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:4000',
      '/api': 'http://localhost:4000',
      '/members': 'http://localhost:4000',
      '/debtors': 'http://localhost:4000',
      '/templates': 'http://localhost:4000',
      '/sync-status': 'http://localhost:4000',
      '/summary': 'http://localhost:4000',
      '/contacted-recent': 'http://localhost:4000',
      '/history': 'http://localhost:4000',
      '/prepare-messages': 'http://localhost:4000'
    }
  }
});
