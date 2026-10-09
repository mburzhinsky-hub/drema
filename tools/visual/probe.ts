/**
 * Диагностика отличий между машинами: какие шрифты реально использованы на экране и где стоят блоки текста.
 * Запуск: npx tsx tools/visual/probe.ts why   (нужен запущенный npm run dev)
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/';
const fixture = process.argv[2] ?? 'why';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--font-render-hinting=none'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce', locale: 'ru-RU', timezoneId: 'Europe/Moscow' });
const page = await ctx.newPage();
await page.goto(`${BASE}?fixture=${fixture}`, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(250);

const cdp = await ctx.newCDPSession(page);
await cdp.send('DOM.enable');
await cdp.send('CSS.enable');
const { root } = await cdp.send('DOM.getDocument', { depth: -1 });

// Шрифты, которыми реально нарисован текст (не те, что указаны в CSS).
const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '#app *' });
const fonts = new Map<string, number>();
for (const nodeId of nodeIds) {
  try {
    const { fonts: f } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    for (const x of f) fonts.set(`${x.familyName}${x.isCustomFont ? ' (свой)' : ' (системный)'}`, (fonts.get(`${x.familyName}${x.isCustomFont ? ' (свой)' : ' (системный)'}`) ?? 0) + x.glyphCount);
  } catch {
    /* у узла нет текста */
  }
}
console.log('ШРИФТЫ');
for (const [k, v] of [...fonts].sort()) console.log(`  ${k}: ${v}`);

// Положение блоков с собственным текстом.
const rects = await page.evaluate(() => {
  const out: string[] = [];
  for (const el of document.querySelectorAll<HTMLElement>('#app *')) {
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent ?? '').join('').trim();
    if (!own) continue;
    const r = el.getBoundingClientRect();
    out.push(`${Math.round(r.top)},${Math.round(r.left)},${Math.round(r.width)}x${Math.round(r.height)} ${own.slice(0, 22)}`);
  }
  return out;
});
console.log('БЛОКИ');
for (const r of rects) console.log(`  ${r}`);
await browser.close();
