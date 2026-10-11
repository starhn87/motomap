import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { transformWithOxc } from 'vite';

const LEGAL_DOCS_PATH = fileURLToPath(new URL('../constants/legal.ts', import.meta.url));

// 실제 파일 ID를 유지해 공통 법률 문서의 상대 import도 올바르게 해석한다.
export const legalDocsPlugin = {
  name: 'motomap-legal-docs', enforce: 'pre',
  resolveId(source) {
    if (source === '../../constants/legal.ts') return LEGAL_DOCS_PATH;
  },
  async load(id) {
    if (id !== LEGAL_DOCS_PATH) return;
    return transformWithOxc(await readFile(LEGAL_DOCS_PATH, 'utf8'), LEGAL_DOCS_PATH);
  },
};
