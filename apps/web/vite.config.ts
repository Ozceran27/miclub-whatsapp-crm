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
  server: { port: 5173 }
});
