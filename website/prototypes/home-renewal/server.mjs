import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// 운영 Worker와 분리한 로컬 시안이다. 허용한 공개 자산만 읽는다.
const localFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/preview.js', ['preview.js', 'text/javascript; charset=utf-8']],
]);
const publicAssets = new Map([
  ['/assets/icon.png', ['icon.png', 'image/png']],
  ['/assets/ride-story-hd.webp', ['ride-story-hd.webp', 'image/webp']],
  ['/assets/app-store-badge-ko.svg', ['app-store-badge-ko.svg', 'image/svg+xml']],
  ['/assets/map.webp', ['screens/map.webp', 'image/webp']],
  ['/assets/chat.webp', ['screens/chat.webp', 'image/webp']],
]);
const port = Number(process.env.MOTOMAP_PREVIEW_PORT || 4318);
const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  const local = localFiles.get(pathname);
  const asset = publicAssets.get(pathname);
  const match = local || asset;
  if (!match) {
    response.writeHead(404).end('Not found');
    return;
  }
  try {
    const base = local ? import.meta.url : new URL('../../public/', import.meta.url);
    const bytes = await readFile(fileURLToPath(new URL(match[0], base)));
    response.writeHead(200, { 'Content-Type': match[1], 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch {
    response.writeHead(500).end('Preview asset unavailable');
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}/`));
