/**
 * Снимки «как на iPhone с вырезом»: безопасные зоны и клавиатура подставлены вручную (в Chromium их нет).
 * Нужны, чтобы глазами проверить то, что не попадает в сверку с макетом (там вырез нулевой).
 *
 *   npm run test:ios-shots      →  .visual/ios/*.png
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/';
const OUT = join(process.cwd(), '.visual', 'ios');
mkdirSync(OUT, { recursive: true });

const SAFE = ':root{--sat:47px !important;--sab:34px !important}';
const FAKE_VV = `
  (() => {
    const vv = new EventTarget();
    Object.assign(vv, { width: innerWidth, height: innerHeight, offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1 });
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    window.__vv = (h, t = 0) => { vv.height = h; vv.offsetTop = t; vv.dispatchEvent(new Event('resize')); vv.dispatchEvent(new Event('scroll')); };
  })();`;
/** Условная «клавиатура» поверх нижней части снимка, чтобы было видно, что осталось над ней. */
const KEYBOARD = (h: number): string => `
  const k = document.createElement('div');
  k.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:${h}px;background:#CFD3D9;z-index:9999;display:flex;align-items:center;justify-content:center;font:600 15px system-ui;color:#555';
  k.textContent = 'клавиатура'; document.body.appendChild(k);`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ru-RU', timezoneId: 'Europe/Moscow', reducedMotion: 'reduce' });
const page = await ctx.newPage();
await page.addInitScript('window.__name = window.__name || ((f) => f);');
await page.addInitScript(FAKE_VV);
await page.clock.install({ time: new Date('2026-10-10T13:42:00+03:00') });

async function shot(name: string): Promise<void> {
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`снимок ${name}`);
}

for (const fx of ['home', 'sleeping', 'night', 'day', 'report', 'family', 'welcome']) {
  await page.goto(`${BASE}?fixture=${fx === 'welcome' ? 'splash' : fx}`, { waitUntil: 'load' });
  await page.addStyleTag({ content: SAFE });
  await shot(`safe-${fx}`);
}

// Клавиатура: шторка «голос» и знакомство.
const KB = 336;
await page.goto(`${BASE}?fixture=home`, { waitUntil: 'load' });
await page.addStyleTag({ content: SAFE });
await page.getByRole('button', { name: 'Записать другое' }).click();
await page.getByRole('button', { name: 'Сказать вслух' }).click();
await page.getByLabel('Фраза').focus();
await page.evaluate((h) => (window as unknown as { __vv(h: number): void }).__vv(844 - h), KB);
await page.evaluate(KEYBOARD(KB));
await shot('keyboard-voice');

await page.goto(`${BASE}?fixture=splash`, { waitUntil: 'load' });
await page.addStyleTag({ content: SAFE });
await page.getByRole('button', { name: /Начать/ }).click();
await page.getByLabel('Имя').focus();
await page.evaluate((h) => (window as unknown as { __vv(h: number): void }).__vv(844 - h), KB);
await page.evaluate(KEYBOARD(KB));
await shot('keyboard-onboarding');

// Страница в масштабе 85 % (в Safari «аА» → «Масштаб страницы»): 390 pt = 459 css-пикселей. Приложение должно занять весь экран.
const zoomed = await browser.newContext({ viewport: { width: 459, height: 994 }, deviceScaleFactor: 2.55, locale: 'ru-RU', timezoneId: 'Europe/Moscow', reducedMotion: 'reduce' });
const zp = await zoomed.newPage();
await zp.clock.install({ time: new Date('2026-10-10T13:42:00+03:00') });
for (const fx of ['splash', 'home', 'night']) {
  await zp.goto(`${BASE}?fixture=${fx}`, { waitUntil: 'load' });
  await zp.addStyleTag({ content: SAFE });
  await zp.waitForTimeout(500);
  await zp.screenshot({ path: join(OUT, `zoom85-${fx}.png`) });
  console.log(`снимок zoom85-${fx}`);
}

// iOS молчит о клавиатуре: размеры не меняются, она просто накрывает низ. Высота оценивается по доле экрана.
const silent = await browser.newContext({ viewport: { width: 459, height: 994 }, deviceScaleFactor: 2.55, isMobile: true, hasTouch: true, locale: 'ru-RU', timezoneId: 'Europe/Moscow', reducedMotion: 'reduce' });
const sp = await silent.newPage();
await sp.addInitScript('window.__name = window.__name || ((f) => f);');
await sp.clock.install({ time: new Date('2026-10-10T13:42:00+03:00') });
await sp.goto(`${BASE}?fixture=home`, { waitUntil: 'load' });
await sp.addStyleTag({ content: SAFE });
await sp.getByRole('button', { name: 'Еда' }).click();
await sp.locator('#e-ml').focus();
await sp.waitForTimeout(700);
await sp.evaluate(KEYBOARD(Math.round(994 * 0.46)));
await sp.screenshot({ path: join(OUT, 'silent-feed.png') });
console.log('снимок silent-feed');

await browser.close();
