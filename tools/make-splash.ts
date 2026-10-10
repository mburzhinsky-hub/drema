/**
 * Заставки запуска для iPhone (apple-touch-startup-image): без них при запуске с экрана «Домой» на секунду вспыхивает белый экран,
 * а для приложения, которым пользуются ночью, это хуже всего. Рисуем фон и знак как на заставке приложения.
 * Запуск: npm run splash. Печатает теги для index.html.
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'public/splash');
mkdirSync(outDir, { recursive: true });

/** Размеры экранов в CSS-пикселях и плотность. Портретная ориентация. */
const DEVICES: Array<[w: number, h: number, dpr: number]> = [
  [440, 956, 3], // iPhone 17 Pro Max, 16 Pro Max
  [430, 932, 3], // 15/14 Pro Max, 15/14 Plus, 16 Plus
  [428, 926, 3], // 14 Plus, 13 Pro Max, 12 Pro Max
  [420, 912, 3], // iPhone Air
  [414, 896, 3], // XS Max, 11 Pro Max
  [414, 896, 2], // XR, 11
  [414, 736, 3], // 8 Plus
  [402, 874, 3], // 17, 17 Pro, 16 Pro
  [393, 852, 3], // 16, 15, 15 Pro, 14 Pro
  [390, 844, 3], // 14, 13, 13 Pro, 12, 12 Pro
  [375, 812, 3], // X, XS, 11 Pro, 13 mini, 12 mini
  [375, 667, 2], // 8, SE 2 и 3
];

const MARK = `<circle cx="32" cy="32" r="22" fill="none" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round" stroke-dasharray="104.2 34"/><circle cx="47.6" cy="16.4" r="5.5" fill="#FFD66B"/>`;

function svg(W: number, H: number, dpr: number): string {
  const tile = 112 * dpr;
  const cx = W / 2;
  const cy = H * 0.37;
  const s = (tile * 0.625) / 64;
  const off = (tile - 64 * s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1A1850"/><stop offset="0.58" stop-color="#221F66"/><stop offset="1" stop-color="#2D2993"/></linearGradient>
      <radialGradient id="r" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${H * 0.42}"><stop offset="0" stop-color="#7B74FF" stop-opacity="0.4"/><stop offset="1" stop-color="#7B74FF" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <rect width="${W}" height="${H}" fill="url(#r)"/>
    <g transform="translate(${cx - tile / 2} ${cy - tile / 2})">
      <rect width="${tile}" height="${tile}" rx="${tile * 0.2857}" fill="#3F3CBB"/>
      <g transform="translate(${off} ${off}) scale(${s})">${MARK}</g>
    </g>
  </svg>`;
}

const tags: string[] = [];
for (const [w, h, dpr] of DEVICES) {
  const W = w * dpr;
  const H = h * dpr;
  const name = `${W}x${H}.png`;
  await sharp(Buffer.from(svg(W, H, dpr)), { density: 72 }).png({ compressionLevel: 9 }).toFile(resolve(outDir, name));
  tags.push(
    `    <link rel="apple-touch-startup-image" href="./splash/${name}" media="(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)" />`,
  );
  console.log(`  splash/${name}`);
}
console.log('\n' + tags.join('\n'));
