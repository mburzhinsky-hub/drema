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
/** Допуск грубой сверки: доля отличающихся блоков 4×4. */
const COARSE_TOLERANCE = 0.005;

/**
 * Грубая сверка: оба снимка усредняются блоками k×k и сравниваются заново.
 * Края букв в разных сборках Chromium сглаживаются чуть иначе — это исчезает при усреднении,
 * а сдвинутый блок, другой цвет или потерянный элемент остаются заметны.
 */
function coarseRatio(a: PNG, b: PNG, k = 4, threshold = 0.1): number {
  const w = Math.floor(a.width / k);
  const h = Math.floor(a.height / k);
  const shrink = (img: PNG): PNG => {
    const out = new PNG({ width: w, height: h });
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const sum = [0, 0, 0, 0];
        for (let dy = 0; dy < k; dy++) {
          for (let dx = 0; dx < k; dx++) {
            const i = ((y * k + dy) * img.width + (x * k + dx)) * 4;
            for (let c = 0; c < 4; c++) sum[c] += img.data[i + c];
          }
        }
        const o = (y * w + x) * 4;
        for (let c = 0; c < 4; c++) out.data[o + c] = Math.round(sum[c] / (k * k));
      }
    }
    return out;
  };
  const n = pixelmatch(shrink(a).data, shrink(b).data, undefined, w, h, { threshold, includeAA: true });
  return n / (w * h);
}

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
    const coarse = coarseRatio(a, b);
    // На машине, где сняты эталоны, действует строгая сверка; на другой сборке Chromium — грубая (см. VISUAL_MODE).
    const strict = ratio <= t.tolerance;
    const loose = coarse <= COARSE_TOLERANCE;
    const ok = (process.env.VISUAL_MODE === 'coarse' ? loose : strict) && errors.length === 0;
    if (!ok) failed++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${t.fixture.padEnd(9)} отличий ${(ratio * 100).toFixed(3)}% (${n} px, допуск ${(t.tolerance * 100).toFixed(1)}%), грубо ${(coarse * 100).toFixed(3)}%${errors.length ? ' ошибки: ' + errors.join('; ') : ''}`);
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
