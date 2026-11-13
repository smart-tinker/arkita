import fs from 'node:fs/promises';
import path from 'node:path';

export const APP_URL = 'schemka://app/schemka-model-ui/index.html';
// Chromium applies worker-src to static module imports in the worker graph too.
export const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; frame-ancestors 'none'; worker-src schemka://app/schemka-model-ui/src/model-analysis-worker.js schemka://app/schemka-model-ui/src/model-search-worker.js schemka://app/schemka-model-core/src/";
export function trustedSender(event, window) {
  return Boolean(window && !window.isDestroyed() && event.sender === window.webContents &&
    event.senderFrame === window.webContents.mainFrame && event.senderFrame?.url === APP_URL);
}

/** Image clipboard writes and fullscreen only from the live bundled main document. */
export function trustedLocalPermission(webContents, permission, details, window) {
  return Boolean((permission === 'clipboard-sanitized-write' || permission === 'fullscreen') && window && !window.isDestroyed()
    && webContents === window.webContents && details?.isMainFrame === true && details.requestingUrl === APP_URL
    && webContents.mainFrame?.url === APP_URL);
}

/** Only actual bundled module/style/document files; never the repository or arbitrary file:// URLs. */
export async function createAssetHandler(root) {
  root = await fs.realpath(root);
  const assets = new Map();
  for (const pkg of ['schemka-model-ui', 'schemka-model-core', 'schemka-model-io', 'schemka-model-profiles']) {
    for (const entry of await fs.readdir(path.join(root, pkg, 'src'), { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.js')) assets.set(`/${pkg}/src/${entry.name}`, path.join(root, pkg, 'src', entry.name));
    }
  }
  for (const name of ['index.html', 'style.css', 'palette.html', 'palette.css', 'catalog.html', 'catalog.css']) assets.set(`/schemka-model-ui/${name}`, path.join(root, 'schemka-model-ui', name));
  const contents = new Map();
  for (const [url, file] of assets) {
    if ((await fs.realpath(file)) !== path.resolve(file)) throw Error(`Bundled asset may not be a symbolic link: ${url}`);
    contents.set(url, await fs.readFile(file));
  }
  return request => {
    let url;
    try { url = new URL(request.url); } catch { return new Response('Forbidden', { status: 403 }); }
    if (request.method !== 'GET' || url.protocol !== 'schemka:' || url.host !== 'app' || url.username || url.password ||
        url.search || url.hash || /%|\\|\/\.\.?\//.test(request.url) || !contents.has(url.pathname)) {
      return new Response('Forbidden', { status: 403 });
    }
    const type = url.pathname.endsWith('.js') ? 'text/javascript' : url.pathname.endsWith('.css') ? 'text/css' : 'text/html';
    return new Response(contents.get(url.pathname), { headers: { 'Content-Type': `${type}; charset=utf-8`,
      'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' } });
  };
}
