import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  root: path.resolve(import.meta.dirname, 'src/reporting/control-page'),
  base: '/',
  build: {
    outDir: path.resolve(import.meta.dirname, '.runner-build/reporting/control-page'),
    emptyOutDir: false,
    cssCodeSplit: false,
    assetsInlineLimit: 40960,
    rollupOptions: {
      input: path.resolve(import.meta.dirname, 'src/reporting/control-page/index.html'),
      output: {
        codeSplitting: false,
        entryFileNames: 'assets/control-page.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'assets/control-page.css';
          }
          return 'assets/control-page.[ext]';
        },
      },
    },
  },
});
