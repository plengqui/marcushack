import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');

const mime = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
};

const server = http.createServer((req, res) => {
  // Bypass localtunnel splash page
  if (req.url === '/ip') {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim()
      || req.socket.remoteAddress;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<h2>Your IP as seen by this server: <strong>${ip}</strong></h2><p>Enter this on the tunnel splash page.</p>`);
    return;
  }

  let filePath = path.join(distDir, req.url === '/' ? 'index.html' : req.url);
  // Remove query strings
  filePath = filePath.split('?')[0];

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(distDir, 'index.html');
  }

  const ext = path.extname(filePath);
  const contentType = mime[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(3000, '0.0.0.0', () => {
  console.log('Server running on port 3000');
});
