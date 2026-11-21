// Renders the app icon and iPhone splash screens to PNG with the preinstalled Chromium.
// Run: npm run icons
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { mkdirSync } from 'node:fs';

const fonts = `<link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,500&family=Pinyon+Script&display=swap" rel="stylesheet">`;
const chrome = 'linear-gradient(180deg,#FFFFFF 0%,#DDE1E7 40%,#AEB6C2 52%,#E8EBEF 100%)';

const icon = (size, maskable) => `<!doctype html><html><head>${fonts}<style>
html,body{margin:0;width:${size}px;height:${size}px;background:#0F1A2E;overflow:hidden}
.wrap{position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:center;padding-bottom:${size * (maskable ? 0.2 : 0.12)}px}
.stripe{position:absolute;left:0;right:0;top:0;height:${size * 0.06}px;background:repeating-linear-gradient(90deg,#BDB2A0 0 ${size * 0.06}px,#0F1A2E ${size * 0.06}px ${size * 0.12}px)}
.arch{width:${size * (maskable ? 0.5 : 0.62)}px;height:${size * (maskable ? 0.56 : 0.7)}px;border-radius:999px 999px ${size * 0.05}px ${size * 0.05}px;background:${chrome};border:${Math.max(1, size / 128)}px solid #AEB6C2;display:flex;align-items:flex-end;justify-content:center;padding-bottom:${size * 0.08}px;box-sizing:border-box}
.a{font-family:Newsreader,Georgia,serif;font-weight:500;font-size:${size * (maskable ? 0.28 : 0.36)}px;line-height:1;color:#0F1A2E}
</style></head><body>${maskable ? '' : '<div class="stripe"></div>'}<div class="wrap"><div class="arch"><span class="a">A</span></div></div></body></html>`;

const splash = (w, h) => `<!doctype html><html><head>${fonts}<style>
html,body{margin:0;width:${w}px;height:${h}px;background:#D8CFC1;overflow:hidden}
.c{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${w * 0.05}px}
.arch{width:${w * 0.26}px;height:${w * 0.3}px;border-radius:999px 999px ${w * 0.02}px ${w * 0.02}px;background:${chrome};border:2px solid #AEB6C2}
.n{font-family:Newsreader,Georgia,serif;font-size:${w * 0.06}px;color:#0F1A2E;line-height:1}
.s{font-family:'Pinyon Script',cursive;font-size:${w * 0.09}px;color:#1C2A47;line-height:1}
</style></head><body><div class="c"><div class="arch"></div><div class="n">Akosua's</div><div class="s">command center</div></div></body></html>`;

mkdirSync('public/icons', { recursive: true });
mkdirSync('public/splash', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
async function shot(html, w, h, path) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(html, { waitUntil: 'networkidle' }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path, omitBackground: false });
}
await shot(icon(192, false), 192, 192, 'public/icons/icon-192.png');
await shot(icon(512, false), 512, 512, 'public/icons/icon-512.png');
await shot(icon(512, true), 512, 512, 'public/icons/icon-maskable-512.png');
await shot(icon(180, false), 180, 180, 'public/icons/apple-touch-icon.png');
for (const [w, h] of [[1125, 2436], [1170, 2532], [1179, 2556], [1206, 2622], [828, 1792], [1284, 2778], [1290, 2796], [1320, 2868]]) {
  await shot(splash(w, h), w, h, `public/splash/splash-${w}x${h}.png`);
}
await browser.close();
console.log('Icons and splash screens written');
