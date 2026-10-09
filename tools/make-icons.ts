/**
 * Иконки приложения из знака макета V3: индиго-плитка, разомкнутое белое кольцо, жёлтая точка.
 * Запуск: npm run icons. Результат лежит в public/ и хранится в репозитории.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = (name: string): string => resolve(root, 'public', name);

const INDIGO = '#3F3CBB';
const YELLOW = '#FFD66B';

/** Кольцо и точка в координатах 64×64, ровно как в logoMark на заставке. */
const MARK = `<circle cx="32" cy="32" r="22" fill="none" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round" stroke-dasharray="104.2 34"/><circle cx="47.6" cy="16.4" r="5.5" fill="${YELLOW}"/>`;

/**
 * Квадрат size×size. radius — скругление плитки (0 — на весь квадрат, как просят iOS и «маскируемые» иконки),
 * markScale — какую долю стороны занимает знак (в макете 0,625).
 */
function svg(size: number, radius: number, markScale: number): string {
  const s = (size * markScale) / 64;
  const off = (size - 64 * s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="${INDIGO}"/><g transform="translate(${off} ${off}) scale(${s})">${MARK}</g></svg>`;
}

async function png(name: string, size: number, radius: number, markScale: number): Promise<void> {
  await sharp(Buffer.from(svg(size, radius, markScale)), { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toFile(out(name));
  console.log(`  ${name}  ${size}×${size}`);
}

mkdirSync(resolve(root, 'public'), { recursive: true });

// Вкладка браузера: векторная иконка с теми же пропорциями, что в макете (плитка 28,57 %, знак 62,5 %).
writeFileSync(out('favicon.svg'), `${svg(112, 32, 0.625)}\n`);
console.log('  favicon.svg');

await png('icon-192.png', 192, Math.round(192 * 0.2857), 0.625);
await png('icon-512.png', 512, Math.round(512 * 0.2857), 0.625);
// Маскируемая: плитка на весь квадрат, знак внутри безопасной зоны (≈ 80 % по центру).
await png('icon-maskable-512.png', 512, 0, 0.5);
// iOS сама скругляет углы, поэтому плитка без скругления.
await png('apple-touch-icon.png', 180, 0, 0.625);
