/**
 * Сверка приложения с макетом: снимаем каждый экран в проверочном режиме (?fixture=…)
 * при 390×844, кладём рядом с эталоном из design/baseline и считаем долю отличающихся пикселей.
 *
 *   npm run test:visual            — все экраны
 *   npm run test:visual -- home    — один экран
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

interface Target {
  fixture: string;
  baseline: string;
  /** Области, которые в макете «живые» и не должны совпадать (x, y, w, h). */
  masks?: Array<[number, number, number, number]>;
  /** Допустимая доля отличий. */
  tolerance: number;
}

const TARGETS: Target[] = [
  { fixture: 'splash', baseline: 't_V3Splash.png', tolerance: 0.0005 },
  { fixture: 'home', baseline: 't_V3Home.png', tolerance: 0.0005 },
  { fixture: 'sleeping', baseline: 't_V3Sleeping.png', tolerance: 0.0005 },
  { fixture: 'night', baseline: 't_V3Night.png', tolerance: 0.0005 },
  { fixture: 'day', baseline: 't_V3Day.png', masks: [[0, 684, 390, 76]], tolerance: 0.0005 },
  { fixture: 'why', baseline: 't_V3Why.png', tolerance: 0.0005 },
  { fixture: 'family', baseline: 't_V3Family.png', tolerance: 0.0005 },
  { fixture: 'report', baseline: 't_V3Report.png', tolerance: 0.0005 },
];

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/';
const OUT = join(process.cwd(), '.visual');
const only = process.argv[2];

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
  });
  let failed = 0;
  for (const t of TARGETS) {
    if (only && t.fixture !== only) continue;
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(`${BASE}?fixture=${t.fixture}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);
    const shot = await page.screenshot({ type: 'png' });
    await page.close();
    writeFileSync(join(OUT, `${t.fixture}.png`), shot);

    const basePath = join(process.cwd(), 'design', 'baseline', t.baseline);
    if (!existsSync(basePath)) {
      console.log(`${t.fixture}: нет эталона`);
      continue;
    }
    const a = PNG.sync.read(readFileSync(basePath));
    const b = PNG.sync.read(shot);
    if (a.width !== b.width || a.height !== b.height) {
      console.log(`${t.fixture}: размеры ${a.width}×${a.height} и ${b.width}×${b.height} не совпали`);
      failed++;
      continue;
    }
    for (const [x, y, w, h] of t.masks ?? []) {
      for (const img of [a, b]) {
        for (let yy = y; yy < y + h; yy++) {
          for (let xx = x; xx < x + w; xx++) {
            const i = (yy * img.width + xx) * 4;
            img.data[i] = 255; img.data[i + 1] = 0; img.data[i + 2] = 255; img.data[i + 3] = 255;
          }
        }
      }
    }
    const diff = new PNG({ width: a.width, height: a.height });
    const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1, includeAA: false });
    const ratio = n / (a.width * a.height);
    writeFileSync(join(OUT, `${t.fixture}.diff.png`), PNG.sync.write(diff));
    const ok = ratio <= t.tolerance && errors.length === 0;
    if (!ok) failed++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${t.fixture.padEnd(9)} отличий ${(ratio * 100).toFixed(3)}% (${n} px, допуск ${(t.tolerance * 100).toFixed(1)}%)${errors.length ? ' ошибки: ' + errors.join('; ') : ''}`);
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
