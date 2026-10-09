/**
 * Сводная картинка экранов для README: берёт снимки из .visual/ (их делает npm run test:visual).
 * Запуск: npm run test:visual && npm run screens
 */
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const names = ['splash', 'home', 'sleeping', 'night', 'day', 'why', 'family', 'report'];
const W = 390;
const H = 844;
const GAP = 24;
const COLS = 4;
const rows = Math.ceil(names.length / COLS);

const missing = names.filter((n) => !existsSync(resolve(root, '.visual', `${n}.png`)));
if (missing.length) {
  console.error(`Нет снимков: ${missing.join(', ')}. Сначала запустите npm run test:visual`);
  process.exit(1);
}

const width = COLS * W + (COLS + 1) * GAP;
const height = rows * H + (rows + 1) * GAP;
const layers = await Promise.all(
  names.map(async (n, i) => ({
    input: await sharp(resolve(root, '.visual', `${n}.png`))
      .resize(W, H)
      .composite([{ input: Buffer.from(`<svg width="${W}" height="${H}"><rect width="${W}" height="${H}" rx="36" fill="none" stroke="#fff" stroke-width="0"/></svg>`) }])
      .png()
      .toBuffer(),
    left: GAP + (i % COLS) * (W + GAP),
    top: GAP + Math.floor(i / COLS) * (H + GAP),
  })),
);

mkdirSync(resolve(root, 'docs'), { recursive: true });
await sharp({ create: { width, height, channels: 3, background: '#E9EBF5' } })
  .composite(layers)
  .png({ palette: true, quality: 90, compressionLevel: 9 })
  .toFile(resolve(root, 'docs/screens.png'));
console.log(`docs/screens.png  ${width}×${height}`);
