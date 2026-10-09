/**
 * Сквозные проверки: настоящий браузер, настоящие нажатия. Часы подменены (Playwright clock),
 * чтобы результат не зависел от того, когда запускаем.
 *
 *   npm run test:e2e          (сервер должен быть запущен: npm run dev или npm run preview)
 */
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import assert from 'node:assert/strict';

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

async function fresh(opts: { time?: Date; state?: unknown; speech?: Speech } = {}): Promise<{ ctx: BrowserContext; page: Page; errors: string[] }> {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
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

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\nПройдено ${results.length - failed.length} из ${results.length}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
