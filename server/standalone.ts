import http from 'http';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { WebSocketServer } from './ws-server';
import { injectSettings, restoreSettings } from './settings-manager';

// __dirname is available in CommonJS (compiled output)
const pkgRoot = path.resolve(__dirname, '..');
const distDir = path.join(pkgRoot, 'dist');

const UI_PORT = parseInt(process.env.CLAUDE_STATUS_UI_PORT ?? '3000', 10);
const WS_PORT = parseInt(process.env.CLAUDE_STATUS_WS_PORT ?? '3001', 10);

const MIME: Record<string, string> = {
  '.html':  'text/html; charset=utf-8',
  '.js':    'application/javascript',
  '.css':   'text/css',
  '.svg':   'image/svg+xml',
  '.png':   'image/png',
  '.ico':   'image/x-icon',
  '.json':  'application/json',
  '.woff2': 'font/woff2',
  '.woff':  'font/woff',
};

function openBrowser(url: string) {
  const platform = process.platform;
  if (platform === 'win32') exec(`start "" "${url}"`);
  else if (platform === 'darwin') exec(`open "${url}"`);
  else exec(`xdg-open "${url}"`);
}

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse) {
  let urlPath = (req.url ?? '/').split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(distDir, urlPath);

  // Prevent path traversal
  if (!filePath.startsWith(distDir + path.sep) && filePath !== distDir) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    // SPA fallback
    const indexPath = path.join(distDir, 'index.html');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(indexPath).pipe(res);
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

function main() {
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    console.error('\x1b[31m[claude-panel] Frontend not built. Run: npm run build\x1b[0m');
    process.exit(1);
  }

  injectSettings(pkgRoot);

  const wsServer = new WebSocketServer(WS_PORT);
  wsServer.start();

  const uiServer = http.createServer(serveStatic);
  uiServer.listen(UI_PORT, () => {
    const url = `http://localhost:${UI_PORT}`;
    console.log(`\x1b[36m[claude-panel] Open: ${url}\x1b[0m`);
    console.log('\x1b[33m[claude-panel] Press Ctrl+C to stop\x1b[0m');
    openBrowser(url);
  });

  function shutdown() {
    wsServer.stop();
    uiServer.close();
    restoreSettings();
    process.exit(0);
  }

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.once(sig, shutdown);
  }
  process.once('exit', () => { restoreSettings(); });
}

main();
