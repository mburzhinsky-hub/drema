/**
 * Аудит интерфейса: обходит все экраны и шторки на разных размерах окна (и с клавиатурой) и ищет то, что «плывёт»:
 * выход за край, обрезанный текст, наложение кнопок и текста, кнопки меньше 44 px, конец экрана под навигацией,
 * шторки, не помещающиеся в приложение.
 *
 *   npm run test:audit                  — все размеры
 *   AUDIT_ONLY=320 npm run test:audit   — только размеры, в названии которых есть 320
 *   AUDIT_SHOTS=1 …                     — сохранять снимки проблемных состояний в .visual/audit
 *
 * Сервер должен быть запущен (npm run dev или npm run preview, адрес в BASE_URL).
 * Сами проверки лежат в tools/audit/inpage.js — они выполняются внутри страницы.
 */
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FAKE_VISUAL_VIEWPORT } from '../shared/fake';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/';
const OUT = join(process.cwd(), '.visual', 'audit');
const ONLY = process.env.AUDIT_ONLY;
const SHOTS = !!process.env.AUDIT_SHOTS;
/** Кнопка следующего шага «Говорите» не принимает нажатие первые 350 мс (защита от двойного тапа): ждём чуть дольше. */
const TAP_GUARD = 420;

interface Vp {
  name: string;
  width: number;
  height: number;
  /** Экран устройства, если окно страницы отличается (масштаб страницы 85 %). */
  screen?: { width: number; height: number };
  /** Телефон: сенсорный экран, проверяем и с клавиатурой. */
  phone: boolean;
}

const VIEWPORTS: Vp[] = [
  { name: '320×568', width: 320, height: 568, phone: true },
  { name: '360×640', width: 360, height: 640, phone: true },
  { name: '375×667', width: 375, height: 667, phone: true },
  { name: '390×844', width: 390, height: 844, phone: true },
  { name: '430×932', width: 430, height: 932, phone: true },
  { name: '459×993 (масштаб 85 %)', width: 459, height: 993, screen: { width: 390, height: 844 }, phone: true },
  { name: '768×1024', width: 768, height: 1024, phone: false },
  { name: '1280×720', width: 1280, height: 720, phone: false },
];

interface Finding {
  vp: string;
  state: string;
  kind: 'error' | 'warning';
  msg: string;
}
const findings: Finding[] = [];

interface AuditResult {
  errors: string[];
  warnings: string[];
  info: Record<string, unknown>;
}

let browser: Browser;
let shotCount = 0;

async function newContext(vp: Vp, time = new Date('2026-10-10T13:42:00+03:00')): Promise<{ ctx: BrowserContext; page: Page; pageErrors: string[] }> {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    ...(vp.screen ? { screen: vp.screen } : {}),
    ...(vp.phone ? { isMobile: true, hasTouch: true } : {}),
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    reducedMotion: 'reduce',
  });
  ctx.setDefaultTimeout(6000);
  const page = await ctx.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(`pageerror: ${e}`));
  page.on('console', (m) => m.type() === 'error' && pageErrors.push(`console: ${m.text()}`));
  await page.addInitScript({ path: join(process.cwd(), 'tools/audit/inpage.js') });
  await page.addInitScript('window.__name = window.__name || ((f) => f);');
  await page.addInitScript(FAKE_VISUAL_VIEWPORT(null));
  // Распознавание речи есть (подставное): шторка «Говорите» открывается и её тоже можно проверить.
  await page.addInitScript(`
    class AuditSR { start() {} stop() {} abort() {} }
    window.webkitSpeechRecognition = AuditSR; window.SpeechRecognition = AuditSR;`);
  await page.clock.install({ time });
  return { ctx, page, pageErrors };
}

/** Ждём, пока закончатся анимации (шторка выезжает снизу): иначе измерим её на полпути. */
async function settle(page: Page, ms = 130): Promise<void> {
  await page.waitForTimeout(ms);
  // Шрифты доехали: на медленной машине замер иначе придёт на запасном шрифте с другой шириной букв.
  await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))])).catch(() => undefined);
  await page.evaluate(() => Promise.race([Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined))), new Promise((r) => setTimeout(r, 1500))])).catch(() => undefined);
}

async function audit(page: Page, vp: Vp, state: string, opts: { keyboardField?: string } = {}): Promise<void> {
  await settle(page);
  const res = (await page.evaluate((o) => (window as unknown as { __audit(o: unknown): AuditResult }).__audit(o), opts)) as AuditResult;
  const seen = new Set<string>();
  for (const [kind, list] of [['error', res.errors], ['warning', res.warnings]] as const) {
    for (const msg of list) {
      if (seen.has(msg)) continue;
      seen.add(msg);
      findings.push({ vp: vp.name, state, kind, msg });
    }
  }
  if (SHOTS && res.errors.length) {
    mkdirSync(OUT, { recursive: true });
    const file = `${vp.name.replace(/[^0-9a-zа-я]+/gi, '_')}__${state.replace(/[^0-9a-zа-я]+/gi, '_')}${opts.keyboardField ? '__kb' : ''}.png`;
    await page.screenshot({ path: join(OUT, file) });
    shotCount++;
  }
}

/** Сценарий не сработал (кнопки нет, шторка не открылась) — это тоже находка: значит, изменились подписи или логика. */
function broken(vp: Vp, state: string, e: unknown): void {
  findings.push({ vp: vp.name, state, kind: 'error', msg: `сценарий не выполнился: ${String(e instanceof Error ? e.message : e).split('\n')[0].slice(0, 160)}` });
}

async function closeAll(page: Page): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const open = await page.locator('.sheet').count();
    if (!open) break;
    await page.keyboard.press('Escape');
    await settle(page, 120);
  }
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
}

async function toRoute(page: Page, hash: string): Promise<void> {
  await closeAll(page);
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForFunction((h) => location.hash === h || (h === '#/' && (location.hash === '' || location.hash === '#/')), hash);
}

/** Заходит в состояние (экран или шторку), проверяет его и, если есть поля ввода, — ещё и с клавиатурой. */
async function state(page: Page, vp: Vp, name: string, open: () => Promise<void>, fields: string[] = []): Promise<void> {
  try {
    await open();
    await audit(page, vp, name);
    if (vp.phone) {
      for (const spec of fields) {
        // «?» перед селектором — поле может быть, а может не быть (зависит от того, какая запись первая)
        const optional = spec.startsWith('?');
        const f = optional ? spec.slice(1) : spec;
        const loc = page.locator(f).first();
        if (!(await loc.count())) {
          if (!optional) broken(vp, `${name} / клавиатура`, `нет поля ${f}`);
          continue;
        }
        await loc.focus();
        await page.waitForFunction(() => document.documentElement.classList.contains('kb'), null, { timeout: 3000 }).catch(() => undefined);
        await settle(page, 420);
        await audit(page, vp, `${name} / клавиатура: ${f}`, { keyboardField: f });
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
        await page.waitForFunction(() => !document.documentElement.classList.contains('kb'), null, { timeout: 3000 }).catch(() => undefined);
        await settle(page, 120);
      }
    }
  } catch (e) {
    broken(vp, name, e);
  } finally {
    await closeAll(page).catch(() => undefined);
  }
}

const btn = (page: Page, name: string | RegExp, exact = false) => page.getByRole('button', typeof name === 'string' ? { name, exact } : { name });

async function runViewport(vp: Vp): Promise<void> {
  const { ctx, page, pageErrors } = await newContext(vp);

  // ───── первый запуск ─────
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => location.hash === '#/welcome');
  await audit(page, vp, 'заставка');
  await state(page, vp, 'шторка: вход по ссылке', async () => {
    await btn(page, /Войти/).click();
    await page.locator('.sheet').waitFor();
  }, ['textarea']);
  await btn(page, /Начать/).click();
  await page.waitForFunction(() => location.hash === '#/onboarding');
  await audit(page, vp, 'знакомство');
  await btn(page, 'Начать', true).click();
  await audit(page, vp, 'знакомство: ошибка в форме');
  if (vp.phone) {
    await page.locator('#o-name').focus();
    await page.waitForFunction(() => document.documentElement.classList.contains('kb'), null, { timeout: 3000 }).catch(() => undefined);
    await settle(page, 500);
    await audit(page, vp, 'знакомство: клавиатура', { keyboardField: '#o-name' });
    await page.evaluate(() => (document.activeElement as HTMLElement).blur());
    await settle(page, 600);
  }
  await btn(page, 'Сначала посмотреть на примере').click();
  await page.waitForFunction(() => ['', '#/'].includes(location.hash));

  // ───── экраны ─────
  const routes: Array<[string, string]> = [
    ['#/', 'главный'],
    ['#/day', 'день'],
    ['#/why', 'почему такой прогноз'],
    ['#/family', 'семья'],
    ['#/report', 'отчёт'],
    ['#/settings', 'настройки'],
  ];
  for (const [hash, name] of routes) await state(page, vp, `экран: ${name}`, () => toRoute(page, hash));
  await state(page, vp, 'экран: день, неделя', async () => {
    await toRoute(page, '#/day');
    await page.getByRole('button', { name: 'Неделя' }).click();
  });
  await state(page, vp, 'экран: отчёт, месяц', async () => {
    await toRoute(page, '#/report');
    await page.getByRole('button', { name: /Месяц/ }).click();
  }, ['#q']);

  // ───── шторки на главном ─────
  const home = (): Promise<void> => toRoute(page, '#/');
  await state(page, vp, 'шторка: кормление, бутылочка', async () => { await home(); await btn(page, 'Еда').click(); await page.locator('.sheet').waitFor(); }, ['#e-ml']);
  await state(page, vp, 'шторка: кормление, грудь', async () => { await home(); await btn(page, 'Еда').click(); await page.getByRole('radio', { name: 'Грудь' }).click(); }, ['#e-left']);
  await state(page, vp, 'шторка: кормление, прикорм', async () => { await home(); await btn(page, 'Еда').click(); await page.getByRole('radio', { name: 'Прикорм' }).click(); }, ['#e-food']);
  await state(page, vp, 'шторка: подгузник', async () => { await home(); await btn(page, 'Подгузник', true).click(); await page.locator('.sheet').waitFor(); });
  await state(page, vp, 'шторка: записать другое', async () => { await home(); await btn(page, 'Записать другое').click(); await page.locator('.sheet').waitFor(); });
  const more: Array<[string, string[]]> = [
    ['Температура', ['#e-temp']],
    ['Лекарство', ['#e-med', '#e-dose']],
    ['Купание', []],
    ['Прогулка', ['#e-min']],
    ['Рост и вес', ['#e-kg', '#e-cm']],
    ['Заметка', ['#e-text']],
  ];
  for (const [label, fields] of more) {
    await state(page, vp, `шторка: ${label.toLowerCase()}`, async () => {
      await home();
      await btn(page, 'Записать другое').click();
      await btn(page, new RegExp(label)).click();
      await page.locator('.sheet').waitFor();
    }, fields);
  }
  await state(page, vp, 'шторка: голос, слушаем', async () => {
    await home();
    await btn(page, 'Записать другое').click();
    await btn(page, 'Сказать вслух').click();
    await page.getByText('Говорите').waitFor();
  });
  await state(page, vp, 'шторка: голос, набор фразы', async () => {
    await home();
    await btn(page, 'Записать другое').click();
    await btn(page, 'Сказать вслух').click();
    await page.waitForTimeout(TAP_GUARD);
    await btn(page, 'Набрать вместо голоса').click();
    await page.getByLabel('Фраза').waitFor();
  }, ['#v-text']);
  await state(page, vp, 'шторка: голос, проверка записи', async () => {
    await home();
    await btn(page, 'Записать другое').click();
    await btn(page, 'Сказать вслух').click();
    await page.waitForTimeout(TAP_GUARD);
    await btn(page, 'Набрать вместо голоса').click();
    await page.getByLabel('Фраза').fill('покормила 120 мл, потом уснула 20 минут назад, подгузник мокрый, температура 37,2');
    await page.waitForTimeout(TAP_GUARD);
    await btn(page, 'Разобрать').click();
    await page.getByText('Записать?').waitFor();
  });
  await state(page, vp, 'шторка: голос, не поняли', async () => {
    await home();
    await btn(page, 'Записать другое').click();
    await btn(page, 'Сказать вслух').click();
    await page.waitForTimeout(TAP_GUARD);
    await btn(page, 'Набрать вместо голоса').click();
    await page.getByLabel('Фраза').fill('сегодня хорошая погода');
    await page.waitForTimeout(TAP_GUARD);
    await btn(page, 'Разобрать').click();
    await page.getByText('Не поняли').first().waitFor();
  });
  await state(page, vp, 'шторка: напоминания', async () => { await home(); await btn(page, 'Напоминания').click(); await page.locator('.sheet').waitFor(); });

  // ───── дети ─────
  await state(page, vp, 'шторка: малыши', async () => { await home(); await btn(page, 'Выбрать ребёнка').click(); await page.locator('.sheet').waitFor(); });
  await state(page, vp, 'шторка: новый малыш', async () => {
    await home();
    await btn(page, 'Выбрать ребёнка').click();
    await btn(page, 'Добавить малыша').click();
    await page.getByLabel('Имя').waitFor();
  }, ['#c-name']);
  await state(page, vp, 'шторка: правка малыша', async () => {
    await home();
    await btn(page, 'Выбрать ребёнка').click();
    await btn(page, /Изменить:/).first().click();
    await page.getByLabel('Имя').waitFor();
  }, ['#c-name']);
  await state(page, vp, 'шторка: подтверждение удаления малыша', async () => {
    await home();
    await btn(page, 'Выбрать ребёнка').click();
    await btn(page, /Изменить:/).first().click();
    await btn(page, 'Удалить малыша').click();
    await page.getByRole('dialog').waitFor();
  });

  // ───── настройки, семья, отчёт, журнал ─────
  await state(page, vp, 'шторка: как вас подписывать', async () => { await toRoute(page, '#/settings'); await btn(page, /Как вас подписывать/).click(); await page.locator('#p-name').waitFor(); }, ['#p-name']);
  await state(page, vp, 'шторка: сведения об экране', async () => { await toRoute(page, '#/settings'); await btn(page, /Сведения об экране/).click(); await page.locator('.sheet').waitFor(); });
  await state(page, vp, 'шторка: приглашение', async () => { await toRoute(page, '#/family'); await btn(page, /Пригласить по ссылке/).click(); await page.locator('#i-name').waitFor(); }, ['#i-name']);
  await state(page, vp, 'шторка: участник семьи', async () => {
    await toRoute(page, '#/family');
    await page.getByRole('button', { name: /Бабушка/ }).first().click();
    await page.locator('#m-name').waitFor({ timeout: 2500 });
  }, ['#m-name']);
  await state(page, vp, 'шторка: отправить врачу', async () => { await toRoute(page, '#/report'); await btn(page, /Отправить врачу/).click(); await page.locator('.sheet').waitFor(); });
  await state(page, vp, 'шторка: правка записи из журнала', async () => {
    await toRoute(page, '#/day');
    await btn(page, /Кормление/).first().click();
    await page.locator('.sheet').waitFor();
  }, ['#e-ml']);
  await state(page, vp, 'шторка: правка сна из журнала', async () => {
    await toRoute(page, '#/day');
    await page.getByRole('button', { name: /сон/i }).first().click();
    await page.locator('.sheet').waitFor();
  });

  // ───── тёмные экраны и уведомление ─────
  await state(page, vp, 'экран: сон (заставка с таймером)', async () => { await page.goto(`${BASE}?fixture=sleeping`, { waitUntil: 'load' }); });
  await state(page, vp, 'шторка: время сна', async () => {
    await page.goto(`${BASE}?fixture=sleeping`, { waitUntil: 'load' });
    await btn(page, 'Изменить время').click();
    await page.locator('.sheet').waitFor({ timeout: 2000 });
  });
  await state(page, vp, 'экран: ночной режим', async () => { await page.goto(`${BASE}?fixture=night`, { waitUntil: 'load' }); });
  await state(page, vp, 'шторка: подгузник ночью', async () => {
    await page.goto(`${BASE}?fixture=night`, { waitUntil: 'load' });
    await btn(page, 'Подгузник', true).click();
    await page.locator('.sheet.dark').waitFor();
  });
  await state(page, vp, 'шторка: кормление ночью', async () => {
    await page.goto(`${BASE}?fixture=night`, { waitUntil: 'load' });
    await btn(page, /Корм|Еда/).first().click();
    await page.locator('.sheet.dark').waitFor();
  }, ['#e-ml']);

  // Главный экран, пока идёт сон: вместо «Уснула» большая кнопка «Проснулась», и сетка из трёх плиток тесна.
  await state(page, vp, 'экран: главный, пока идёт сон', async () => {
    await page.goto(`${BASE}?fixture=sleeping`, { waitUntil: 'load' });
    await page.getByRole('link', { name: 'Назад' }).click();
    await page.waitForFunction(() => ['', '#/'].includes(location.hash));
  });

  // ───── длинные имена и тексты (как будет у настоящих людей) ─────
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => ['', '#/'].includes(location.hash));
  try {
    const longName = 'Александра-Виктория Мельникова'.slice(0, 30);
    const longWord = 'Ааааааааааааааааааааааааааааааа'.slice(0, 30);
    // самые широкие буквы подряд: реальные имена короче, но запас должен быть
    const wideWord = 'ЫЩШЖЮФЫЩШЖЮФЫЩШЖЮФЫЩШЖЮФЫЩШЖЮФ'.slice(0, 30);
    // члены семьи с длинными именами без пробелов (в приложении их добавляет приглашение; здесь пишем прямо в хранилище)
    await page.evaluate(({ a, b }) => {
      const st = JSON.parse(localStorage.getItem('drema:v1') || '{}');
      st.members = [...(st.members || []).filter((m: { id: string }) => !m.id.startsWith('audit')), { id: 'audit1', name: a, role: 'editor' }, { id: 'audit2', name: b, role: 'viewer' }];
      localStorage.setItem('drema:v1', JSON.stringify(st));
    }, { a: longWord, b: wideWord });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => ['', '#/'].includes(location.hash));
    // имя малыша — одно длинное слово без пробелов
    await btn(page, 'Выбрать ребёнка').click();
    await btn(page, /Изменить:/).first().click();
    await page.locator('#c-name').fill(wideWord);
    await btn(page, 'Сохранить', true).click();
    await settle(page, 300);
    await closeAll(page);
    // длинная заметка и лекарство
    await btn(page, 'Записать другое').click();
    await btn(page, /Заметка/).click();
    await page.locator('#e-text').fill(`${longWord}${longWord}${longWord} и ещё очень длинная заметка про всё на свете, чтобы проверить перенос строк в журнале и отчёте`);
    await btn(page, 'Записать', true).click();
    await settle(page, 300);
    await btn(page, 'Записать другое').click();
    await btn(page, /Лекарство/).click();
    await page.locator('#e-med').fill('Ааааааааааааааааааааааааааааааааааааааааааааааааааааааааааа');
    await page.locator('#e-dose').fill('Бббббббббббббббббббббббббббббббббббббб');
    await btn(page, 'Записать', true).click();
    await settle(page, 300);
    // длинное имя в профиле
    await toRoute(page, '#/settings');
    await btn(page, /Как вас подписывать/).click();
    await page.locator('#p-name').fill(longName);
    await btn(page, 'Сохранить', true).click();
    await settle(page, 300);
    await closeAll(page);
  } catch (e) {
    broken(vp, 'длинные имена: подготовка', e);
  }
  for (const [hash, name] of routes) await state(page, vp, `длинные данные, экран: ${name}`, () => toRoute(page, hash));
  await state(page, vp, 'длинные данные, экран: сон', async () => {
    await toRoute(page, '#/');
    await btn(page, /Уснул/).first().click();
    await page.waitForFunction(() => location.hash === '#/sleeping');
  });
  await state(page, vp, 'длинные данные, экран: ночной режим', async () => { await toRoute(page, '#/night'); });
  await state(page, vp, 'длинные данные, шторка: малыши', async () => { await toRoute(page, '#/'); await btn(page, 'Выбрать ребёнка').click(); await page.locator('.sheet').waitFor(); });
  await state(page, vp, 'длинные данные, шторка: правка записи', async () => {
    await toRoute(page, '#/day');
    await btn(page, /Заметка|Лекарство/).first().click();
    await page.locator('.sheet').waitFor();
  }, ['?#e-text', '?#e-med']);

  if (pageErrors.length) findings.push({ vp: vp.name, state: 'консоль', kind: 'error', msg: pageErrors.slice(0, 3).join(' | ') });
  await ctx.close();
}

async function main(): Promise<void> {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const list = VIEWPORTS.filter((v) => !ONLY || v.name.includes(ONLY));
  const t0 = Date.now();
  // Размеры независимы друг от друга, поэтому идут по несколько сразу.
  const queue = [...list];
  const workers = Array.from({ length: Math.min(Number(process.env.AUDIT_JOBS ?? 4), list.length) }, async () => {
    for (let vp = queue.shift(); vp; vp = queue.shift()) {
      await runViewport(vp);
      console.log(`готово: ${vp.name}`);
    }
  });
  await Promise.all(workers);
  await browser.close();

  // Одинаковые находки на разных размерах склеиваем в одну строку.
  const group = (kind: Finding['kind']): Map<string, string[]> => {
    const m = new Map<string, string[]>();
    for (const f of findings.filter((x) => x.kind === kind)) {
      const key = `${f.state} — ${f.msg}`;
      m.set(key, [...(m.get(key) ?? []), f.vp.split(' ')[0]]);
    }
    return m;
  };
  const errors = group('error');
  // Замечания (кнопки 36–43 px, шрифт мельче 11 px) одинаковы на всех экранах, где есть тот же элемент: склеиваем по тексту.
  const warnings = new Map<string, string[]>();
  for (const f of findings.filter((x) => x.kind === 'warning')) {
    const states = warnings.get(f.msg) ?? [];
    if (!states.includes(f.state.split(' / ')[0])) states.push(f.state.split(' / ')[0]);
    warnings.set(f.msg, states);
  }
  if (errors.size) {
    console.log(`\nОШИБКИ (${errors.size}):`);
    for (const [k, vps] of errors) console.log(`  ✗ ${k}\n      размеры: ${vps.join(', ')}`);
  }
  if (warnings.size && process.env.AUDIT_WARN !== '0') {
    console.log(`\nЗАМЕЧАНИЯ (${warnings.size}):`);
    for (const [k, where] of warnings) console.log(`  · ${k}\n      где: ${where.slice(0, 3).join('; ')}${where.length > 3 ? ` и ещё ${where.length - 3}` : ''}`);
  }
  if (SHOTS && shotCount) console.log(`\nСнимки проблемных состояний: ${OUT}`);
  mkdirSync(join(process.cwd(), '.visual'), { recursive: true });
  writeFileSync(join(process.cwd(), '.visual', 'audit.json'), JSON.stringify(findings, null, 1), { flag: 'w' });
  console.log(`\nАудит интерфейса: ${errors.size ? 'есть ошибки' : 'ошибок нет'} (${((Date.now() - t0) / 1000).toFixed(0)} с)`);
  process.exit(errors.size ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
