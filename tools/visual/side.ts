/** Склейка «эталон | приложение | разница» для глаз: npx tsx tools/visual/side.ts night */
import sharp from 'sharp';
import { join } from 'node:path';

const name = process.argv[2];
const map: Record<string, string> = {
  splash: 't_V3Splash', home: 't_V3Home', sleeping: 't_V3Sleeping', night: 't_V3Night',
  day: 't_V3Day', why: 't_V3Why', family: 't_V3Family', report: 't_V3Report',
};
const base = join('design', 'baseline', `${map[name]}.png`);
const mine = join('.visual', `${name}.png`);
const diff = join('.visual', `${name}.diff.png`);
const W = 390, H = 844;
await sharp({ create: { width: W * 3 + 20, height: H, channels: 4, background: '#888' } })
  .composite([
    { input: base, left: 0, top: 0 },
    { input: mine, left: W + 10, top: 0 },
    { input: diff, left: W * 2 + 20, top: 0 },
  ])
  .png()
  .toFile(join('.visual', `${name}.side.png`));
