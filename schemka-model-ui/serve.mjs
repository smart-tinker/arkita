import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
// Development-only server. Only UI, core, IO and profiles src are exposed, never workspace files.
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/') { res.writeHead(302, { Location: '/schemka-model-ui/index.html' }); res.end(); return; }
    const relative = pathname.replace(/^\//, '');
    if (!/^(schemka-model-ui\/(index\.html|style\.css|src\/[a-z0-9-]+\.js)|schemka-model-(?:core|io|profiles)\/src\/[a-z0-9-]+\.js|schemka-site-shell\/src\/navigation\.js)$/.test(relative)) { res.writeHead(404); res.end('Not found'); return; }
    const body = await readFile(path.join(root, relative));
    res.writeHead(200, { 'Content-Type': types[path.extname(relative)], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Local preview: http://127.0.0.1:${server.address().port}/schemka-model-ui/index.html`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
