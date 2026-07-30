// three.js 렌더 페이지를 서빙하고, 렌더된 PNG(dataURL)를 받아 저장하는 초소형 서버
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const SHOT = new URL('../../docs/screenshots/02-preview.png', import.meta.url).pathname;
const OUT = join(dir, '..', 'assets', 'hero-phone.png');

http
  .createServer(async (req, res) => {
    try {
      if (req.method === 'POST' && req.url === '/save') {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', async () => {
          const b64 = body.replace(/^data:image\/png;base64,/, '');
          await writeFile(OUT, Buffer.from(b64, 'base64'));
          res.end('saved');
          console.log('SAVED', OUT, b64.length);
        });
        return;
      }
      if (req.url === '/shot.png') {
        res.setHeader('content-type', 'image/png');
        res.end(await readFile(SHOT));
        return;
      }
      res.setHeader('content-type', 'text/html');
      res.end(await readFile(join(dir, 'render.html')));
    } catch (e) {
      res.statusCode = 500;
      res.end(String(e));
    }
  })
  .listen(8123, () => console.log('ready :8123'));
