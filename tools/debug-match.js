// 定位 startMatch 内部异常
const { chromium } = require('E:/ZCODE/ink-jiangnan/node_modules/playwright');
const { spawn } = require('child_process');
const path = require('path');
(async () => {
  const srv = spawn('node', [path.join(__dirname, 'server.js'), '8125'], { stdio: 'pipe' });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  await page.goto('http://localhost:8125/', { waitUntil: 'networkidle', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 3000));
  const out = await page.evaluate(() => {
    try {
      window.__game.startMatch('tdm', 'normal');
      return { ok: true, state: window.__game.state, hudHidden: document.getElementById('hud').classList.contains('hidden') };
    } catch (e) {
      return { ok: false, err: e.message, stack: (e.stack || '').split('\n').slice(0, 6).join(' | ') };
    }
  });
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
  srv.kill();
  process.exit(0);
})();
