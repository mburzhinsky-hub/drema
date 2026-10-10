/**
 * Сквозные проверки: настоящий браузер, настоящие нажатия. Часы подменены (Playwright clock),
 * чтобы результат не зависел от того, когда запускаем.
 *
 *   npm run test:e2e          (сервер должен быть запущен: npm run dev или npm run preview)
 */
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/';
const START = new Date('2026-10-10T14:00:00+03:00');

let browser: Browser;
const results: Array<{ name: string; ok: boolean; err?: string }> = [];

/** Какое распознавание речи видит страница: нет совсем, исправное (подставной распознаватель) или без доступа к микрофону. */
type Speech = 'none' | 'fake' | 'denied';

const SPEECH_SCRIPT: Record<Speech, string> = {
  none: `for (const k of ['SpeechRecognition', 'webkitSpeechRecognition']) Object.defineProperty(window, k, { value: undefined, configurable: true, writable: true });`,
  fake: `
    class FakeSR {
      start() { setTimeout(() => this.onresult && this.onresult({ results: [Object.assign([{ transcript: window.__phrase || 'покормила 90 мл' }], { isFinal: true })] }), 60); }
      stop() { setTimeout(() => this.onend && this.onend(), 0); }
      abort() {}
    }
    window.webkitSpeechRecognition = FakeSR; window.SpeechRecognition = FakeSR;`,
  denied: `
    class DeniedSR {
      start() { setTimeout(() => this.onerror && this.onerror({ error: 'not-allowed' }), 60); }
      stop() {}
      abort() {}
    }
    window.webkitSpeechRecognition = DeniedSR; window.SpeechRecognition = DeniedSR;`,
};

/**
 * Настоящая клавиатура в Chromium не открывается, поэтому видимую область подменяем так, как её ведёт iOS:
 * при клавиатуре visualViewport становится ниже окна, а при «подкрутке» страницы получает сдвиг offsetTop.
 * window.__vv(высота, сдвиг) — «клавиатура выехала / ушла».
 */
const FAKE_VISUAL_VIEWPORT = (idleHeight: number | null): string => `
  (() => {
    const vv = new EventTarget();
    Object.assign(vv, { width: innerWidth, height: ${idleHeight ?? 'innerHeight'}, offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1 });
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    window.__vv = (height, offsetTop = 0) => {
      vv.height = height; vv.offsetTop = offsetTop; vv.pageTop = offsetTop;
      vv.dispatchEvent(new Event('resize')); vv.dispatchEvent(new Event('scroll'));
    };
  })();`;

async function fresh(opts: { time?: Date; state?: unknown; speech?: Speech; keyboard?: boolean; vvIdle?: number; viewport?: { width: number; height: number } } = {}): Promise<{ ctx: BrowserContext; page: Page; errors: string[] }> {
  const ctx = await browser.newContext({
    viewport: opts.viewport ?? { width: 390, height: 844 },
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    reducedMotion: 'reduce',
    acceptDownloads: true,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  // Без явного указания речи нет: так сценарии не зависят от версии Chromium (в новых она есть, в старых нет).
  await page.addInitScript(SPEECH_SCRIPT[opts.speech ?? 'none']);
  // esbuild оборачивает именованные функции в __name(): внутри page.evaluate такого помощника нет.
  await page.addInitScript('window.__name = window.__name || ((f) => f);');
  if (opts.keyboard) await page.addInitScript(FAKE_VISUAL_VIEWPORT(opts.vvIdle ?? null));
  await page.clock.install({ time: opts.time ?? START });
  return { ctx, page, errors };
}

async function onboard(page: Page, name = 'Мила', birth = '2026-05-10'): Promise<void> {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.getByRole('button', { name: /Начать/ }).click();
  await page.getByLabel('Имя').fill(name);
  await page.getByLabel('Дата рождения').fill(birth);
  await page.getByRole('button', { name: 'Начать' }).click();
  await page.waitForFunction(() => ['', '#/', '#/night'].includes(location.hash));
}

const hash = (page: Page): Promise<string> => page.evaluate(() => location.hash);

/** Переход происходит на ближайшем кадре, поэтому адрес ждём, а не читаем сразу (на медленной машине кадр приходит позже). */
async function expectHash(page: Page, want: string, timeout = 4000): Promise<void> {
  try {
    await page.waitForFunction((h) => location.hash === h, want, { timeout });
  } catch {
    assert.fail(`ожидали адрес ${want}, а сейчас ${await hash(page)}`);
  }
}
const text = (page: Page): Promise<string> => page.evaluate(() => document.body.innerText);

/** Экран перерисовывается на ближайшем кадре, поэтому ждём, а не читаем сразу. */
async function has(page: Page, re: RegExp, timeout = 4000): Promise<void> {
  try {
    await page.waitForFunction(({ src, flags }) => new RegExp(src, flags).test(document.body.innerText), { src: re.source, flags: re.flags }, { timeout });
  } catch {
    assert.fail(`на экране нет ${re}. Сейчас там:\n${(await text(page)).slice(0, 500)}`);
  }
}
async function lacks(page: Page, re: RegExp): Promise<void> {
  await page.waitForTimeout(150);
  assert.doesNotMatch(await text(page), re);
}
const home = (page: Page): Promise<unknown> => page.waitForFunction(() => location.hash === '#/' || location.hash === '');

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`OK    ${name}`);
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    results.push({ name, ok: false, err });
    console.log(`FAIL  ${name}\n      ${err.split('\n').slice(0, 6).join('\n      ')}`);
  }
}

async function main(): Promise<void> {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

  await test('первый запуск: заставка → знакомство → главный экран', async () => {
    const { ctx, page, errors } = await fresh();
    await page.goto(BASE, { waitUntil: 'load' });
    await expectHash(page, '#/welcome');
    await page.getByRole('button', { name: /Начать/ }).click();
    await expectHash(page, '#/onboarding');
    // пустая форма — понятная ошибка, а не молчание
    await page.getByRole('button', { name: 'Начать' }).click();
    await has(page, /Напишите имя малыша/);
    await page.getByLabel('Имя').fill('Мила');
    await page.getByRole('button', { name: 'Начать' }).click();
    await has(page, /Укажите дату рождения/);
    await page.getByLabel('Дата рождения').fill('2027-01-01');
    await page.getByRole('button', { name: 'Начать' }).click();
    await has(page, /ещё не наступила/);
    await page.getByLabel('Дата рождения').fill('2026-05-10');
    await page.getByRole('button', { name: 'Начать' }).click();
    await home(page);
    await has(page, /Мила/);
    await has(page, /5 месяцев/);
    await has(page, /Прогноз появится после первого сна/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await test('сон: уснула → экран сна → отмена возвращает назад', async () => {
    const { ctx, page, errors } = await fresh();
    await onboard(page);
    await page.getByRole('button', { name: 'Уснула' }).click();
    await expectHash(page, '#/sleeping');
    await has(page, /Мила спит/);
    await has(page, /Уснула в 14:00/);
    await page.getByRole('button', { name: 'Отменить' }).click();
    await home(page);
    await has(page, /Отменено/);
    await has(page, /Прогноз появится после первого сна/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await test('сон: таймер идёт, «Проснулась» даёт прогноз следующего сна', async () => {
    const { ctx, page, errors } = await fresh();
    await onboard(page);
    await page.getByRole('button', { name: 'Уснула' }).click();
    await page.clock.fastForward('40:00');
    await page.waitForTimeout(100);
    await page.locator('[aria-label^="0:40:0"]').first().waitFor();
    await page.getByRole('button', { name: 'Проснулась' }).first().click();
    await home(page);
    await has(page, /Проснулась\. Сон 40 мин/);
    await has(page, /ПРОГНОЗ СНА/);
    await has(page, /Следующий сон/);
    await has(page, /Окно сна/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await test('кормление: быстрый объём, запись, правка, удаление и возврат', async () => {
    const { ctx, page, errors } = await fresh();
    await onboard(page);
    await page.getByRole('button', { name: 'Еда' }).click();
    await page.getByRole('dialog').waitFor();
    await page.getByRole('button', { name: '150', exact: true }).click();
    await page.getByRole('button', { name: 'Записать', exact: true }).click();
    await has(page, /Записано: кормление/);
    await has(page, /Бутылочка · 150 мл/);
    // правка
    await page.getByRole('button', { name: /Кормление/ }).first().click();
    await page.locator('#e-ml').fill('90');
    await page.getByRole('button', { name: 'Сохранить' }).click();
    await has(page, /Бутылочка · 90 мл/);
    // удаление и возврат
    await page.getByRole('button', { name: /Кормление/ }).first().click();
    await page.getByRole('button', { name: 'Удалить запись' }).click();
    await has(page, /Запись удалена/);
    await lacks(page, /Бутылочка · 90 мл/);
    await page.getByRole('button', { name: 'Вернуть' }).click();
    await has(page, /Бутылочка · 90 мл/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await test('кормление: неверный объём не записывается', async () => {
    const { ctx, page } = await fresh();
    await onboard(page);
    await page.getByRole('button', { name: 'Еда' }).click();
    await page.locator('#e-ml').fill('900');
    await page.getByRole('button', { name: 'Записать', exact: true }).click();
    await has(page, /Объём — от 1 до 500 мл/);
    await page.getByRole('dialog').waitFor();
    await ctx.close();
  });

  await test('подгузник: одно нажатие', async () => {
    const { ctx, page } = await fresh();
    await onboard(page);
    await page.getByRole('button', { name: 'Подгузник' }).first().click();
    await page.getByRole('button', { name: 'Грязный' }).click();
    await has(page, /Записано: подгузник/);
    await has(page, /Грязный/);
    await ctx.close();
  });

  await test('«Ещё»: температура, лекарство, заметка попадают в журнал', async () => {
    const { ctx, page, errors } = await fresh();
    await onboard(page);
    const more = async (label: string): Promise<void> => {
      await page.getByRole('button', { name: 'Записать другое' }).click();
      await page.getByRole('button', { name: new RegExp(label) }).click();
    };
    await more('Температура');
    await page.getByRole('button', { name: 'Больше на 0,1' }).click();
    await page.getByRole('button', { name: 'Записать', exact: true }).click();
    await more('Лекарство');
    await page.getByLabel('Что дали').fill('Витамин D');
    await page.getByLabel('Доза').fill('1 капля');
    await page.getByRole('button', { name: 'Записать', exact: true }).click();
    await more('Заметка');
    await page.locator('#e-text').fill('Первый зуб');
    await page.getByRole('button', { name: 'Записать', exact: true }).click();
    await page.getByRole('link', { name: 'Журнал' }).click();
    await has(page, /36,7 °C/);
    await has(page, /Витамин D · 1 капля/);
    await has(page, /Первый зуб/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await test('журнал: вчера, неделя, возврат', async () => {
    const { ctx, page, errors } = await fresh();
    await onboard(page);
    await page.getByRole('button', { name: 'Подгузник' }).first().click();
    await page.getByRole('button', { name: 'Мокрый' }).click();
    await page.getByRole('link', { name: 'Журнал' }).click();
    await has(page, /Сегодня/);
    await page.getByRole('button', { name: 'Предыдущий день' }).click();
    await has(page, /Вчера/);
    await has(page, /В этот день записей нет/);
    await page.getByRole('button', { name: 'Неделя', exact: true }).click();
    await has(page, /СОН ЗА СУТКИ, В СРЕДНЕМ/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await test('голос (набранная фраза): несколько действий сразу и отмена пачкой', async () => {
    const { ctx, page, errors } = await fresh();
    await onboard(page);
    await page.getByRole('button', { name: 'Записать другое' }).click();
    await page.getByRole('button', { name: 'Сказать вслух' }).click();
    const area = page.getByLabel('Фраза');
    await area.waitFor();
    await area.fill('покормила 120 мл и поменяла подгузник');
    await page.getByRole('button', { name: 'Разобрать' }).click();
    await has(page, /Записать всё \(2\)/);
    await page.getByRole('button', { name: /Записать всё/ }).click();
    await has(page, /Бутылочка · 120 мл/);
    await has(page, /Мокрый/);
    await page.getByRole('button', { name: 'Отменить' }).click();
    await lacks(page, /Бутылочка · 120 мл/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await test('голос: непонятная фраза честно говорит, что не поняла', async () => {
    const { ctx, page } = await fresh();
    await onboard(page);
    await page.getByRole('button', { name: 'Записать другое' }).click();
    await page.getByRole('button', { name: 'Сказать вслух' }).click();
    await page.getByLabel('Фраза').fill('сегодня хорошая погода');
    await page.getByRole('button', { name: 'Разобрать' }).click();
    await has(page, /Не поняли/);
    await ctx.close();
  });

  await test('голос (распознавание есть): говорим, видим текст, подтверждаем, запись в журнале', async () => {
    const { ctx, page, errors } = await fresh({ speech: 'fake' });
    await onboard(page);
    await page.getByRole('button', { name: 'Записать другое' }).click();
    await page.getByRole('button', { name: 'Сказать вслух' }).click();
    await has(page, /Говорите/);
    await has(page, /покормила 90 мл/);
    await page.getByRole('button', { name: 'Готово' }).click();
    await has(page, /Записать\?/);
    await has(page, /Кормление · 90 мл/);
    await page.getByRole('button', { name: 'Записать', exact: true }).click();
    await has(page, /Бутылочка · 90 мл/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await test('голос (распознавание есть): можно отказаться от голоса и набрать фразу', async () => {
    const { ctx, page } = await fresh({ speech: 'fake' });
    await onboard(page);
    await page.getByRole('button', { name: 'Записать другое' }).click();
    await page.getByRole('button', { name: 'Сказать вслух' }).click();
    await page.getByRole('button', { name: 'Набрать вместо голоса' }).click();
    await page.getByLabel('Фраза').fill('поменяла подгузник');
    await page.getByRole('button', { name: 'Разобрать' }).click();
    await has(page, /Подгузник · мокрый/);
    await ctx.close();
  });

  await test('голос: нет доступа к микрофону — понятное сообщение и поле для набора', async () => {
    const { ctx, page } = await fresh({ speech: 'denied' });
    await onboard(page);
    await page.getByRole('button', { name: 'Записать другое' }).click();
    await page.getByRole('button', { name: 'Сказать вслух' }).click();
    await has(page, /Нет доступа к микрофону/);
    await page.getByLabel('Фраза').waitFor({ timeout: 4000 });
    await ctx.close();
  });

  await test('несколько детей: добавить, переключить, удалить с подтверждением', async () => {
    const { ctx, page, errors } = await fresh();
    await onboard(page);
    await page.getByRole('button', { name: 'Выбрать ребёнка' }).click();
    await page.getByRole('button', { name: 'Добавить малыша' }).click();
    await page.getByLabel('Имя').fill('Тимур');
    await page.getByLabel('Дата рождения').fill('2025-09-01');
    await page.getByRole('radio', { name: 'Мальчик' }).click();
    await page.getByRole('button', { name: 'Добавить' }).click();
    await has(page, /Тимур/);
    await has(page, /13 месяцев/);
    await page.getByRole('button', { name: 'Выбрать ребёнка' }).click();
    await has(page, /Мила/);
    await page.getByRole('button', { name: /Мила/ }).first().click();
    await has(page, /5 месяцев/);
    // удаление
    await page.getByRole('button', { name: 'Выбрать ребёнка' }).click();
    await page.getByRole('button', { name: 'Изменить: Тимур' }).click();
    await page.getByRole('button', { name: 'Удалить малыша' }).click();
    await has(page, /Удалить Тимур\?/);
    await page.getByRole('button', { name: 'Удалить', exact: true }).click();
    await page.getByRole('button', { name: 'Выбрать ребёнка' }).click();
    await lacks(page, /Тимур/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await test('данные переживают перезагрузку', async () => {
    const { ctx, page, errors } = await fresh();
    await onboard(page);
    await page.getByRole('button', { name: 'Подгузник' }).first().click();
    await page.getByRole('button', { name: 'Грязный' }).click();
    await page.waitForTimeout(400);
    await page.reload({ waitUntil: 'load' });
    await has(page, /Мила/);
    await has(page, /Грязный/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await test('напоминания: переключатели сохраняются', async () => {
    const { ctx, page, errors } = await fresh();
    await onboard(page);
    await page.getByRole('button', { name: 'Напоминания' }).click();
    const feed = page.getByRole('switch', { name: /Пора кормить/ });
    assert.equal(await feed.isChecked(), false);
    await feed.check({ force: true });
    await page.getByRole('button', { name: 'Закрыть' }).click();
    await page.waitForTimeout(400);
    await page.reload({ waitUntil: 'load' });
    await page.getByRole('button', { name: 'Напоминания' }).click();
    assert.equal(await page.getByRole('switch', { name: /Пора кормить/ }).isChecked(), true);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await test('автоночь: ночью открывается тёмный экран, выход держится до утра', async () => {
    const { ctx, page, errors } = await fresh({ time: new Date('2026-10-10T23:30:00+03:00') });
    await onboard(page);
    await expectHash(page, '#/night');
    await has(page, /Ночной режим/);
    await page.getByRole('button', { name: 'Подгузник' }).click();
    await page.locator('.sheet.dark').waitFor({ timeout: 3000 });
    await page.getByRole('button', { name: 'Мокрый' }).click();
    await page.getByRole('button', { name: /Выйти из ночного режима/ }).click();
    await home(page);
    await page.waitForTimeout(1200);
    assert.equal(await hash(page), '#/', 'после выхода не возвращаемся в ночной режим');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await test('ночью «Уснула» остаётся на ночном экране', async () => {
    const { ctx, page } = await fresh({ time: new Date('2026-10-10T23:30:00+03:00') });
    await onboard(page);
    await page.getByRole('button', { name: 'Уснула' }).click();
    await expectHash(page, '#/night');
    await has(page, /Спит с 23:30/);
    await page.getByRole('button', { name: 'Проснулась' }).click();
    await expectHash(page, '#/night');
    await ctx.close();
  });

  await test('выписка: текст, отправка и копирование', async () => {
    const { ctx, page, errors } = await fresh();
    await page.goto(BASE, { waitUntil: 'load' });
    await page.getByRole('button', { name: /Начать/ }).click();
    await page.getByRole('button', { name: 'Сначала посмотреть на примере' }).click();
    await page.getByRole('link', { name: 'Отчёты' }).click();
    await has(page, /Выписка/);
    await page.getByLabel('Вопрос врачу').fill('Нормальный ли ночной сон?');
    await page.getByRole('button', { name: 'Отправить врачу' }).click();
    await has(page, /Выписка для педиатра/);
    await has(page, /Нормальный ли ночной сон\?/);
    await page.getByRole('button', { name: 'Скопировать текст' }).click();
    await has(page, /Выписка скопирована|Не удалось скопировать/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await test('приглашение: ссылка открывается без регистрации и показывает малыша', async () => {
    const { ctx, page, errors } = await fresh();
    await onboard(page);
    await page.getByRole('link', { name: 'Семья' }).click();
    await page.getByRole('button', { name: 'Пригласить по ссылке' }).click();
    const link = await page.getByLabel('Ссылка').inputValue();
    assert.match(link, /#\/view\//);
    const other = await fresh();
    await other.page.goto(link, { waitUntil: 'load' });
    await has(other.page, /Как сейчас Мила/);
    await has(other.page, /ТОЛЬКО СМОТРИТЕ/);
    assert.deepEqual(other.errors, []);
    await other.ctx.close();
    // повреждённая ссылка
    const bad = await fresh();
    await bad.page.goto(`${BASE}#/view/xxxx`, { waitUntil: 'load' });
    await has(bad.page, /Ссылка не открылась/);
    await bad.ctx.close();
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await test('копия: сохранить файл и загрузить в чистое приложение', async () => {
    const { ctx, page } = await fresh();
    await onboard(page);
    await page.getByRole('button', { name: 'Подгузник' }).first().click();
    await page.getByRole('button', { name: 'Грязный' }).click();
    await page.getByRole('button', { name: 'Выбрать ребёнка' }).click();
    await page.getByRole('button', { name: 'Настройки' }).click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Сохранить копию/ }).click()]);
    const path = await dl.path();
    assert.ok(path);
    const other = await fresh();
    await other.page.goto(BASE, { waitUntil: 'load' });
    await other.page.getByRole('button', { name: /Войти/ }).click();
    await other.page.locator('input[type=file]').setInputFiles(path!);
    await home(other.page);
    await has(other.page, /Мила/);
    await has(other.page, /Грязный/);
    await other.ctx.close();
    await ctx.close();
  });

  await test('битый файл копии не ломает приложение', async () => {
    const { ctx, page, errors } = await fresh();
    await page.goto(BASE, { waitUntil: 'load' });
    await page.getByRole('button', { name: /Войти/ }).click();
    await page.getByLabel('Ссылка или содержимое копии').fill('{"v":1,"children":"нет"}');
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await has(page, /не похож на резервную копию/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await test('пример: данные Милы, прогноз, «Почему», затем удаление примера', async () => {
    const { ctx, page, errors } = await fresh({ time: new Date('2026-10-10T13:42:00+03:00') });
    await page.goto(BASE, { waitUntil: 'load' });
    await page.getByRole('button', { name: /Начать/ }).click();
    await page.getByRole('button', { name: 'Сначала посмотреть на примере' }).click();
    await home(page);
    await has(page, /Мила/);
    await has(page, /ПРОГНОЗ СНА/);
    await page.getByRole('link', { name: /Почему так/ }).click();
    await expectHash(page, '#/why');
    await has(page, /Почему/);
    await page.getByRole('link', { name: 'Назад' }).click();
    await page.getByRole('button', { name: 'Выбрать ребёнка' }).click();
    await page.getByRole('button', { name: 'Настройки' }).click();
    await page.getByRole('button', { name: /Убрать примерные данные/ }).click();
    await page.getByRole('button', { name: 'Убрать', exact: true }).click();
    await page.waitForFunction(() => location.hash === '#/welcome');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await test('доступность: у всех кнопок и ссылок есть имя, у картинок — подпись', async () => {
    const { ctx, page } = await fresh({ time: new Date('2026-10-10T13:42:00+03:00') });
    await page.goto(BASE, { waitUntil: 'load' });
    await page.getByRole('button', { name: /Начать/ }).click();
    await page.getByRole('button', { name: 'Сначала посмотреть на примере' }).click();
    const routes = ['#/', '#/day', '#/report', '#/family', '#/why', '#/settings'];
    for (const r of routes) {
      await page.evaluate((h) => { location.hash = h; }, r);
      await page.waitForTimeout(120);
      const bad = await page.evaluate(() =>
        [...document.querySelectorAll('button, a[href], input, textarea')]
          .filter((el) => {
            const e = el as HTMLElement;
            if (e.closest('[inert]')) return false;
            const label = (e.getAttribute('aria-label') || e.innerText || '').trim();
            const labelled = e.id && document.querySelector(`label[for="${e.id}"]`);
            const wrapped = e.closest('label');
            return !label && !labelled && !wrapped && e.getAttribute('type') !== 'hidden';
          })
          .map((el) => (el as HTMLElement).outerHTML.slice(0, 120)),
      );
      assert.deepEqual(bad, [], `маршрут ${r}`);
    }
    await ctx.close();
  });


  // ───────────── iPhone: приложение «с экрана Домой» ─────────────

  /** Размеры нужных мест на странице: по ним видно, что приложение стоит ровно в видимой области. */
  const geometry = (page: Page): Promise<{
    app: { top: number; bottom: number; height: number };
    sheet: { top: number; bottom: number } | null;
    field: { top: number; bottom: number } | null;
    kb: boolean;
    navHidden: boolean | null;
    scrollY: number;
    pageScrollable: boolean;
  }> =>
    page.evaluate(() => {
      const box = (el: Element | null): { top: number; bottom: number; height: number } | null => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) };
      };
      const nav = document.querySelector('nav[aria-label="Основная навигация"]');
      const de = document.documentElement;
      return {
        app: box(document.getElementById('app'))!,
        sheet: box(document.querySelector('.sheet')),
        field: box(document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName) ? document.activeElement : null),
        kb: de.classList.contains('kb'),
        navHidden: nav ? getComputedStyle(nav).display === 'none' : null,
        scrollY: window.scrollY,
        pageScrollable: de.scrollHeight > de.clientHeight || document.body.scrollHeight > document.body.clientHeight,
      };
    });

  await test('iPhone: клавиатура — приложение равно видимой области, страница не едет и не прокручивается', async () => {
    const { ctx, page, errors } = await fresh({ keyboard: true });
    await onboard(page);
    await page.getByRole('button', { name: 'Записать другое' }).click();
    await page.getByRole('button', { name: 'Сказать вслух' }).click();
    const area = page.getByLabel('Фраза');
    await area.focus();

    const before = await geometry(page);
    assert.equal(before.app.top, 0);
    assert.equal(before.app.height, 844);
    assert.equal(before.kb, false);
    assert.equal(before.pageScrollable, false, 'страница не должна прокручиваться');

    // Два вида поведения iOS: видимая область просто стала ниже / iOS ещё и подкрутила страницу к полю.
    for (const [height, top] of [[500, 0], [500, 160]] as const) {
      await page.evaluate(([h, t]) => (window as unknown as { __vv(h: number, t: number): void }).__vv(h, t), [height, top]);
      await page.waitForFunction((h) => document.getElementById('app')!.getBoundingClientRect().height === h, height);
      await page.waitForTimeout(450); // после выезда клавиатуры поле прокручивается в видимую часть шторки
      const g = await geometry(page);
      const tag = `видимая область ${height} px, сдвиг ${top}`;
      assert.equal(g.app.top, top, `верх приложения (${tag})`);
      assert.equal(g.app.height, height, `высота приложения (${tag})`);
      assert.equal(g.kb, true, `режим клавиатуры (${tag})`);
      assert.equal(g.navHidden, true, `нижняя навигация убрана (${tag})`);
      assert.ok(g.sheet, 'шторка на месте');
      assert.ok(Math.abs(g.sheet.bottom - (top + height)) <= 1, `шторка стоит прямо над клавиатурой (${tag}): низ ${g.sheet.bottom}, ждали ${top + height}`);
      assert.ok(g.sheet.top >= top - 1, `шторка не уходит за верх видимой области (${tag}): верх ${g.sheet.top}`);
      assert.ok(g.field && g.field.top >= g.sheet.top - 1 && g.field.bottom <= g.sheet.bottom + 1, `поле ввода видно целиком (${tag}): ${JSON.stringify(g.field)} в ${JSON.stringify(g.sheet)}`);
      assert.equal(g.pageScrollable, false);
    }

    // iOS пытается подкрутить страницу — она остаётся на месте.
    await page.evaluate(() => { window.scrollTo(0, 300); document.documentElement.scrollTop = 300; document.body.scrollTop = 300; });
    await page.waitForTimeout(100);
    assert.equal((await geometry(page)).scrollY, 0);

    // Набор текста работает как обычно.
    await area.fill('покормила 120 мл');
    assert.equal(await area.inputValue(), 'покормила 120 мл');

    // Клавиатура ушла — всё возвращается.
    await page.evaluate(() => (window as unknown as { __vv(h: number, t: number): void }).__vv(844, 0));
    await page.waitForFunction(() => document.getElementById('app')!.getBoundingClientRect().height === 844);
    const after = await geometry(page);
    assert.equal(after.app.top, 0);
    assert.equal(after.kb, false);
    assert.equal(after.navHidden, false);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await test('iPhone: экран знакомства при клавиатуре — кнопка «Начать» остаётся достижимой', async () => {
    const { ctx, page, errors } = await fresh({ keyboard: true });
    await page.goto(BASE, { waitUntil: 'load' });
    await page.getByRole('button', { name: /Начать/ }).click();
    await page.getByLabel('Имя').focus();
    await page.evaluate(() => (window as unknown as { __vv(h: number, t: number): void }).__vv(480, 0));
    await page.waitForFunction(() => document.getElementById('app')!.getBoundingClientRect().height === 480);
    await page.waitForTimeout(450);
    const g = await geometry(page);
    assert.ok(g.field && g.field.top >= 0 && g.field.bottom <= 480, `поле «Имя» в видимой части: ${JSON.stringify(g.field)}`);
    assert.equal(g.pageScrollable, false);
    // кнопку можно достичь прокруткой внутри экрана и нажать
    await page.getByRole('button', { name: 'Начать', exact: true }).scrollIntoViewIfNeeded();
    const btn = await page.getByRole('button', { name: 'Начать', exact: true }).boundingBox();
    assert.ok(btn && btn.y >= 0 && btn.y + btn.height <= 480 + 1, `кнопка «Начать» в видимой части: ${JSON.stringify(btn)}`);
    assert.equal((await geometry(page)).scrollY, 0);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await test('iPhone: поля ввода не мельче 16 px — иначе iOS увеличивает страницу при фокусе', async () => {
    const { ctx, page, errors } = await fresh({ time: new Date('2026-10-10T13:42:00+03:00') });
    const small = (): Promise<string[]> =>
      page.evaluate(() =>
        [...document.querySelectorAll('input, textarea, select')]
          .filter((el) => !['checkbox', 'radio', 'file', 'range', 'hidden'].includes((el as HTMLInputElement).type))
          .filter((el) => (el as HTMLElement).offsetParent !== null || getComputedStyle(el).position === 'fixed')
          .map((el) => ({ el, px: parseFloat(getComputedStyle(el).fontSize) }))
          .filter((x) => x.px < 16)
          .map((x) => `${(x.el as HTMLElement).outerHTML.slice(0, 90)} → ${x.px}px`),
      );
    let audited = 0;
    const audit = async (where: string): Promise<void> => {
      await page.waitForTimeout(150); // экран перерисовывается на ближайшем кадре
      const n = await page.evaluate(() => document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea').length);
      audited += n;
      assert.deepEqual(await small(), [], `поля мельче 16 px: ${where}`);
    };

    const meta = await (async () => { await page.goto(BASE, { waitUntil: 'load' }); return page.locator('meta[name=viewport]').getAttribute('content'); })();
    assert.match(meta ?? '', /maximum-scale=1/);
    assert.match(meta ?? '', /user-scalable=no/);
    assert.match(meta ?? '', /viewport-fit=cover/);

    await page.getByRole('button', { name: /Начать/ }).click();
    await audit('знакомство');
    await page.getByRole('button', { name: 'Сначала посмотреть на примере' }).click();
    await page.waitForFunction(() => ['', '#/'].includes(location.hash));

    await page.getByRole('button', { name: 'Еда' }).click();
    await audit('кормление');
    await page.keyboard.press('Escape');

    for (const label of ['Температура', 'Лекарство', 'Заметка']) {
      await page.getByRole('button', { name: 'Записать другое' }).click();
      await page.getByRole('button', { name: new RegExp(label) }).click();
      await audit(`«Ещё» → ${label}`);
      await page.keyboard.press('Escape');
    }
    await page.getByRole('button', { name: 'Записать другое' }).click();
    await page.getByRole('button', { name: 'Сказать вслух' }).click();
    await audit('голос');
    await page.keyboard.press('Escape');

    await page.getByRole('link', { name: 'Отчёты' }).click();
    await audit('отчёты');
    await page.getByRole('link', { name: 'Семья' }).click();
    await page.getByRole('button', { name: 'Пригласить по ссылке' }).click();
    await audit('приглашение');
    await page.keyboard.press('Escape');

    await page.evaluate(() => { location.hash = '#/'; });
    await page.getByRole('button', { name: 'Выбрать ребёнка' }).click();
    await page.getByRole('button', { name: 'Добавить малыша' }).click();
    await audit('новый малыш');
    await page.keyboard.press('Escape');

    assert.ok(audited >= 8, `проверено слишком мало полей: ${audited}`);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await test('iPhone: безопасные зоны — вырез и индикатор «Домой» не закрывают содержимое, полоса сверху в цвет экрана', async () => {
    // Вырез и индикатор подставляем вручную: в Chromium безопасные зоны всегда нулевые.
    const SAFE = ':root{--sat:47px !important;--sab:34px !important}';
    const tones: Array<[string, string, [number, number, number]]> = [
      ['home', 'главный', [0x22, 0x1f, 0x66]],
      ['sleeping', 'сон идёт', [0x1a, 0x18, 0x50]],
      ['night', 'ночной', [0x0b, 0x0d, 0x1c]],
      ['report', 'отчёты', [0x22, 0x1f, 0x66]],
    ];
    const { ctx, page, errors } = await fresh({ time: new Date('2026-10-10T13:42:00+03:00') });
    for (const [fx, name, rgb] of tones) {
      await page.goto(`${BASE}?fixture=${fx}`, { waitUntil: 'load' });
      await page.addStyleTag({ content: SAFE });
      await page.waitForTimeout(250);
      const shot = PNG.sync.read(await page.screenshot({ clip: { x: 0, y: 0, width: 390, height: 60 } }));
      for (const x of [8, 195, 380]) {
        const i = (20 * shot.width + x) * 4;
        assert.deepEqual([shot.data[i], shot.data[i + 1], shot.data[i + 2]], rgb, `${name}: цвет полосы под строкой состояния в точке x=${x}`);
      }
      const m = await page.evaluate(() => {
        const r = (el: Element | null) => (el ? el.getBoundingClientRect() : null);
        const app = r(document.getElementById('app'))!;
        const nav = r(document.querySelector('nav[aria-label="Основная навигация"]'));
        const first = [...document.querySelectorAll('#app button, #app a')].map((b) => b.getBoundingClientRect()).filter((b) => b.width > 0).sort((a, b) => a.top - b.top)[0];
        return { app: { top: app.top, bottom: app.bottom }, nav: nav && { top: nav.top, bottom: nav.bottom, height: nav.height }, firstTop: first?.top ?? null };
      });
      assert.ok(m.firstTop === null || m.firstTop >= 47, `${name}: верхний элемент не выше выреза (${m.firstTop})`);
      if (m.nav) {
        assert.ok(Math.abs(m.nav.bottom - m.app.bottom) <= 1, `${name}: навигация стоит у нижнего края`);
        assert.ok(m.nav.height >= 64 + 30 - 1, `${name}: навигация выше индикатора «Домой» (высота ${m.nav.height})`);
      }
    }
    assert.deepEqual(errors, []);
    await ctx.close();
  });


  await test('iPhone: iOS занижает видимую область на строку состояния — пустой полосы снизу нет, клавиатура считается точно', async () => {
    // Скриншот с телефона: без клавиатуры видимая область на 47 px ниже окна, а приложение повторяло её высоту.
    const { ctx, page, errors } = await fresh({ keyboard: true, vvIdle: 797 });
    await onboard(page);
    const idle = await geometry(page);
    assert.equal(idle.app.top, 0);
    assert.equal(idle.app.bottom, 844, `приложение доходит до низа окна: ${JSON.stringify(idle.app)}`);
    assert.equal(idle.kb, false);

    await page.getByRole('button', { name: 'Записать другое' }).click();
    await page.getByRole('button', { name: 'Сказать вслух' }).click();
    await page.getByLabel('Фраза').focus();
    // клавиатура 336 px: видимая область 844 − 47 − 336 = 461
    await page.evaluate(() => (window as unknown as { __vv(h: number, t: number): void }).__vv(461, 0));
    await page.waitForFunction(() => document.documentElement.classList.contains('kb'));
    await page.waitForTimeout(450);
    const g = await geometry(page);
    assert.ok(g.sheet && Math.abs(g.sheet.bottom - (844 - 336)) <= 1, `шторка стоит над клавиатурой: ${JSON.stringify(g.sheet)}`);
    await page.evaluate(() => (window as unknown as { __vv(h: number, t: number): void }).__vv(797, 0));
    await page.waitForFunction(() => !document.documentElement.classList.contains('kb'));
    await page.getByRole('button', { name: 'Закрыть' }).click();
    await page.waitForTimeout(500);
    assert.equal((await geometry(page)).app.bottom, 844);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await test('iPhone: окно шире 390 (масштаб страницы 85 %) — приложение на всё окно, без полос по краям', async () => {
    // 390 pt при масштабе 85 % — это 459 × 994 css-пикселей; раньше приложение упиралось в 430 и по бокам оставались полосы.
    for (const vp of [{ width: 459, height: 994 }, { width: 430, height: 932 }, { width: 360, height: 740 }, { width: 559, height: 900 }]) {
      const { ctx, page, errors } = await fresh({ viewport: vp, time: new Date('2026-10-10T13:42:00+03:00') });
      for (const fx of ['splash', 'home', 'night']) {
        await page.goto(`${BASE}?fixture=${fx}`, { waitUntil: 'load' });
        await page.waitForTimeout(200);
        const m = await page.evaluate(() => {
          const r = document.getElementById('app')!.getBoundingClientRect();
          return { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), over: document.documentElement.scrollWidth > innerWidth };
        });
        const tag = `${vp.width}×${vp.height}, ${fx}`;
        assert.deepEqual([m.left, m.top, m.right, m.bottom], [0, 0, vp.width, vp.height], `приложение на всё окно (${tag}): ${JSON.stringify(m)}`);
        assert.equal(m.over, false, `ничего не вылезает по ширине (${tag})`);
      }
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  });

  await test('iPhone: сведения об экране — шторка в настройках показывает размеры окна и масштаб', async () => {
    const { ctx, page, errors } = await fresh({ time: new Date('2026-10-10T13:42:00+03:00') });
    await page.goto(BASE, { waitUntil: 'load' });
    await page.getByRole('button', { name: /Начать/ }).click();
    await page.getByRole('button', { name: 'Сначала посмотреть на примере' }).click();
    await page.getByRole('button', { name: 'Выбрать ребёнка' }).click();
    await page.getByRole('button', { name: 'Настройки' }).click();
    await page.getByRole('button', { name: /Сведения об экране/ }).click();
    await has(page, /ОКНО СТРАНИЦЫ/);
    await has(page, /390 × 844/);
    await has(page, /Масштаб страницы\n?.*|МАСШТАБ СТРАНИЦЫ/);
    const t = await text(page);
    assert.match(t, /БЕЗОПАСНЫЕ ЗОНЫ/);
    assert.match(t, /VIEWPORT/);
    await page.getByRole('button', { name: 'Скопировать' }).click();
    await has(page, /Сведения скопированы/);
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(copied, /Окно страницы: 390 × 844/);
    assert.match(copied, /Масштаб страницы: 100 %/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\nПройдено ${results.length - failed.length} из ${results.length}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
