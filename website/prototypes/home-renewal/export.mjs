import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// 서버 없이도 다시 볼 수 있도록 시안과 공개 자산을 하나의 HTML로 내보낸다.
const assets = [
  ['icon.png', 'icon.png', 'image/png'],
  ['ride-story-hd.webp', 'ride-story-hd.webp', 'image/webp'],
  ['app-store-badge-ko.svg', 'app-store-badge-ko.svg', 'image/svg+xml'],
  ['map.webp', 'screens/map.webp', 'image/webp'],
  ['chat.webp', 'screens/chat.webp', 'image/webp'],
];
let html = await readFile(new URL('index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('styles.css', import.meta.url), 'utf8');
const js = await readFile(new URL('preview.js', import.meta.url), 'utf8');
html = html.replace('<link rel="stylesheet" href="/styles.css" />', `<style>${css}</style>`);
html = html.replace('<script src="/preview.js" defer></script>', '');
html = html.replace('</body>', `<script>${js}</script></body>`);
for (const [alias, file, mime] of assets) {
  const bytes = await readFile(new URL(`../../public/${file}`, import.meta.url));
  html = html.replaceAll(`/assets/${alias}`, `data:${mime};base64,${bytes.toString('base64')}`);
}
const directory = new URL('file:///tmp/motomap-home-renewal/');
await mkdir(directory, { recursive: true });
await writeFile(new URL('index.html', directory), html);
console.log(fileURLToPath(new URL('index.html', directory)));
