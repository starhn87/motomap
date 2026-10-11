import { sites } from '@openai/sites-vite-plugin';
import { defineConfig } from 'vite';
import { legalDocsPlugin } from './legalDocsPlugin.js';

export default defineConfig({
  plugins: [legalDocsPlugin, sites()],
  build: {
    lib: {
      entry: 'src/index.js',
      formats: ['es'],
      fileName: () => 'server/index.js',
    },
    outDir: 'dist',
  },
});
