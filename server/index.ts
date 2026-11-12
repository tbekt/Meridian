/**
 * Production server: serves the built app from dist/ and the live feed API.
 *   npm run build && npm start      (PORT defaults to 8080)
 * Runs on Node 22.18+ / 24 directly (built-in TypeScript type stripping).
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { handleApi, warmUp } from './api.ts';

const ROOT = resolve('dist');
const PORT = Number(process.env.PORT) || 8080;
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  if (path.startsWith('/api/')) return handleApi(req, res);

  // static files, with index.html as the fallback
  let file = normalize(join(ROOT, decodeURIComponent(path)));
  if (!file.startsWith(ROOT)) {
    res.statusCode = 403;
    return res.end();
  }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    file = join(ROOT, 'index.html');
  }
  try {
    const body = await readFile(file);
    res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
    if (file.startsWith(join(ROOT, 'assets'))) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
}).listen(PORT, () => {
  console.log(`Meridian on http://localhost:${PORT}`);
  warmUp();
});
