import { sites } from '@openai/sites-vite-plugin';
import { defineConfig } from 'vite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const LEGAL_DOCS_ID = '\0motomap-legal-docs';
const LEGAL_DOCS_PATH = fileURLToPath(new URL('../constants/legal.ts', import.meta.url));

const legalDocs = {
  name: 'motomap-legal-docs',
  enforce: 'pre',
  resolveId(source) {
    if (source === '../../constants/legal.ts') {
      return LEGAL_DOCS_ID;
    }
  },
  async load(id) {
    if (id !== LEGAL_DOCS_ID) {
      return;
    }

    const source = await readFile(LEGAL_DOCS_PATH, 'utf8');
    return source
      .replace("export type LegalDocType = 'terms' | 'privacy' | 'location';", '')
      .replace(
        'export const LEGAL_DOCS: Record<LegalDocType, { title: string; content: string }> =',
        'export const LEGAL_DOCS =',
      );
  },
};

export default defineConfig({
  plugins: [legalDocs, sites()],
  build: {
    lib: {
      entry: 'src/index.js',
      formats: ['es'],
      fileName: () => 'server/index.js',
    },
    outDir: 'dist',
  },
});
