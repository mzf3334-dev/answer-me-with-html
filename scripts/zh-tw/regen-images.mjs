// Regenerate the four Traditional-Chinese doc images from the converted
// example drafts, so the pictures match the zh-tw text:
//   docs/images/tcp.png                <- examples/tcp.md (blueprint, light)
//   docs/images/architecture-dark.png  <- examples/architecture.md (shadcn, dark)
//   docs/images/video-zh.png           <- examples/video-tcp.md (title + 3 scene stills, 2x2)
//   docs/images/text-vs-page-zh.png    <- scripts/zh-tw/composite.html + the new tcp.png
// Needs a Chrome/Chromium binary: AM_CHROME=/path/to/chrome node scripts/zh-tw/regen-images.mjs
// (chrome-headless-shell or @sparticuz/chromium both work; no npm deps.)
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const HERE = dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.AM_CHROME;
if (!CHROME) { console.error('Set AM_CHROME to a Chrome/Chromium binary.'); process.exit(1); }
const TMP = mkdtempSync(join(tmpdir(), 'am-img-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. Render the example pages with the CLI itself.
const env = { ...process.env, AM_HOME: join(TMP, 'home'), AM_NO_OPEN: '1', AM_NO_UPDATE_CHECK: '1' };
const am = (args) => execFileSync('node', [join(ROOT, 'bin/am.js'), ...args], { env, stdio: 'pipe' });
am(['render', join(ROOT, 'examples/tcp.md'), '-o', join(TMP, 'tcp.html'), '--no-open']);
am(['render', join(ROOT, 'examples/architecture.md'), '-o', join(TMP, 'arch.html'), '--no-open']);
am(['video', join(ROOT, 'examples/video-tcp.md'), '-o', join(TMP, 'video.html'), '--no-open']);

// 2. Minimal CDP client (one browser, one target per page).
const proc = spawn(CHROME, ['--remote-debugging-port=0', `--user-data-dir=${join(TMP, 'profile')}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--force-device-scale-factor=1', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await new Promise((res, rej) => { let b = ''; proc.stderr.on('data', (d) => { b += d; const m = b.match(/DevTools listening on (ws:\/\/\S+)/); if (m) res(m[1]); }); setTimeout(() => rej(new Error('no DevTools URL')), 20000); });
const port = new URL(wsUrl).port;

async function openPage(file, { width, height = 1000, scheme = 'light' }) {
  const t = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(pathToFileURL(file).href)}`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map(); const events = [];
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else if (m.method) events.push(m.method); });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result?.result?.value; };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Page.navigate', { url: pathToFileURL(file).href });
  for (let i = 0; i < 100 && !events.includes('Page.loadEventFired'); i++) await sleep(100);
  await ev('document.fonts.ready.then(() => 1)');
  await sleep(900);
  const shotFull = async (out) => {
    const lm = await send('Page.getLayoutMetrics');
    const h = Math.ceil(lm.result.cssContentSize.height);
    const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: h, scale: 1 } });
    writeFileSync(out, Buffer.from(s.result.data, 'base64'));
  };
  const shotClip = async (out, clip) => {
    const s = await send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 } });
    writeFileSync(out, Buffer.from(s.result.data, 'base64'));
  };
  const shotViewport = async (out) => {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(out, Buffer.from(s.result.data, 'base64'));
  };
  return { ev, shotFull, shotClip, shotViewport, close: () => ws.close() };
}

const IMG = join(ROOT, 'docs/images');
// 3. Page screenshots.
let p = await openPage(join(TMP, 'tcp.html'), { width: 1680 });
await p.shotFull(join(IMG, 'tcp.png')); p.close();
p = await openPage(join(TMP, 'arch.html'), { width: 1680, scheme: 'dark' });
await p.shotFull(join(IMG, 'architecture-dark.png')); p.close();

// 4. Video stills: title card + each scene near its end (paused), tiled 2x2.
p = await openPage(join(TMP, 'video.html'), { width: 1600 });
const rect = await p.ev(`(() => { const r = document.querySelector('.amv-sheet').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`);
await p.ev(`(() => { const st = document.createElement('style'); st.textContent = '.amv-bigplay{display:none !important}'; document.head.appendChild(st); return 1; })()`);
await sleep(400);
await p.shotClip(join(TMP, 'f0.png'), rect);
const starts = [];
for (let i = 0; i < 3; i++) starts.push(Number(await p.ev(`(() => { document.querySelectorAll('.amv-chap')[${i}].click(); return new Promise(r => setTimeout(() => r(document.querySelector('.amv-seek').value), 350)); })()`)));
const dur = Number(await p.ev(`document.querySelector('.amv-seek').max`));
for (let i = 0; i < 3; i++) {
  const end = (i < 2 ? starts[i + 1] : dur) - 1.6;
  await p.ev(`(() => { document.querySelectorAll('.amv-chap')[${i}].click(); return 1; })()`);
  await sleep(250);
  await p.ev(`(() => { const seek = document.querySelector('.amv-seek'); const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; const setSeek = (v) => { setter.call(seek, String(v)); seek.dispatchEvent(new Event('input', { bubbles: true })); seek.dispatchEvent(new Event('change', { bubbles: true })); }; setSeek(${end}); const toggle = document.querySelector('.amv-btn'); if (toggle.textContent.includes('❚❚')) toggle.click(); setSeek(${end}); return 1; })()`);
  await sleep(1300);
  await p.shotClip(join(TMP, `f${i + 1}.png`), rect);
}
p.close();
const tile = `<!DOCTYPE html><html><body style="margin:0;background:#d2d2d2;width:1600px;height:902px;display:grid;grid-template-columns:798px 798px;gap:4px;">
${[0, 1, 2, 3].map((i) => `<img src="${pathToFileURL(join(TMP, `f${i}.png`)).href}" style="width:798px;height:449px;">`).join('')}</body></html>`;
writeFileSync(join(TMP, 'tile.html'), tile);
p = await openPage(join(TMP, 'tile.html'), { width: 1600, height: 902 });
await p.shotViewport(join(IMG, 'video-zh.png')); p.close();

// 5. Composite: reuse the fresh tcp.png inside the hand-built layout.
const comp = readFileSync(join(HERE, 'composite.html'), 'utf8').replace('__TCP_IMG__', pathToFileURL(join(IMG, 'tcp.png')).href);
writeFileSync(join(TMP, 'composite.html'), comp);
p = await openPage(join(TMP, 'composite.html'), { width: 2400, height: 1533 });
await p.shotViewport(join(IMG, 'text-vs-page-zh.png')); p.close();

// 6. Share images: crop the two composites to Facebook's 1200x630 and export JPEG.
const ogPage = `<!DOCTYPE html><html><body>
<img id="en" src="${pathToFileURL(join(IMG, 'text-vs-page.png')).href}">
<img id="zh" src="${pathToFileURL(join(IMG, 'text-vs-page-zh.png')).href}">
</body></html>`;
writeFileSync(join(TMP, 'og.html'), ogPage);
p = await openPage(join(TMP, 'og.html'), { width: 800 });
for (const [id, y0, out] of [['en', 40, 'og-en.jpg'], ['zh', 70, 'og-zh.jpg']]) {
  const data = await p.ev(`(() => new Promise((res) => { const img = document.getElementById('${id}'); const c = document.createElement('canvas'); c.width = 1200; c.height = 630; const ctx = c.getContext('2d'); ctx.drawImage(img, 0, ${y0}, img.naturalWidth, Math.round(img.naturalWidth * 630 / 1200), 0, 0, 1200, 630); res(c.toDataURL('image/jpeg', 0.87)); }))()`);
  writeFileSync(join(IMG, out), Buffer.from(data.split(',')[1], 'base64'));
}
p.close();

proc.kill();
console.log('regenerated: tcp.png, architecture-dark.png, video-zh.png, text-vs-page-zh.png, og-en.jpg, og-zh.jpg');
