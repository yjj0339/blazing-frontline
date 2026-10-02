// 本地预览服务器：node tools/server.js [端口]
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = parseInt(process.argv[2] || '8123', 10);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript',
  '.mjs': 'application/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.ico': 'image/x-icon', '.md': 'text/markdown', '.wasm': 'application/wasm',
};
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.resolve(ROOT, '.' + p);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => {
  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const n of list) {
      if (n.family === 'IPv4' && !n.internal) {
        console.log(`  LAN: http://${n.address}:${PORT}/`);
      }
    }
  }
  console.log(`  local: http://localhost:${PORT}/`);
});
