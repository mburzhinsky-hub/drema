/**
 * Проверка PWA на собранной версии: service worker ставится, после этого приложение открывается без сети.
 * Запуск: npm run build && npm run preview, затем npm run test:offline.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow' });
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));

let failed = 0;
const check = (name: string, ok: boolean, extra = ''): void => {
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failed += 1;
};

await page.goto(BASE, { waitUntil: 'load' });
await page.evaluate(async () => {
  await navigator.serviceWorker.ready;
});
await page.waitForTimeout(1500);
await page.reload({ waitUntil: 'load' });
check('service worker управляет страницей', await page.evaluate(() => !!navigator.serviceWorker.controller));

const manifestHref = await page.evaluate(() => document.querySelector('link[rel=manifest]')?.getAttribute('href'));
check('манифест подключён', !!manifestHref, String(manifestHref));

await ctx.setOffline(true);
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#app *', { timeout: 5000 });
// Название нарисовано по буквам (точки над «ё» — отдельные элементы), поэтому ищем его по подписи.
const hasName = (await page.locator('[aria-label="Дрёма"]').count()) > 0;
const text = await page.evaluate(() => document.body.innerText);
check('без сети открывается заставка', hasName && /Начать/.test(text), text.replace(/\s+/g, ' ').slice(0, 60));

const fonts = await page.evaluate(async () => {
  await document.fonts.ready;
  return [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')))];
});
check('шрифты берутся из кэша', fonts.includes('Yeseva One') && fonts.includes('Nunito'), fonts.join(', '));
check('ошибок страницы нет', errors.length === 0, errors.join('; '));

await browser.close();
if (failed) process.exit(1);
