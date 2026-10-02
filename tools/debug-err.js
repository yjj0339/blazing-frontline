// 快速错误捕获：只打印 console/pageerror
const { chromium } = require('E:/ZCODE/ink-jiangnan/node_modules/playwright');
const { spawn } = require('child_process');
const path = require('path');
(async () => {
  const srv = spawn('node', [path.join(__dirname, 'server.js'), '8124'], { stdio: 'pipe' });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  page.on('console', (m) => console.log('[' + m.type() + ']', m.text().slice(0, 500)));
  await page.goto('http://localhost:8124/', { waitUntil: 'networkidle', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 4000));
  console.log('game =', await page.evaluate(() => typeof window.__game));
  await browser.close();
  srv.kill();
  process.exit(0);
})();
