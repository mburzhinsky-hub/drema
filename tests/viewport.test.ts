import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Baseline, KEYBOARD_MIN_PX, KEYBOARD_SHARE, appInsets, baselineOf, canEstimate, estimatedInsets, isTextField, layoutScale, startViewport } from '../src/app/viewport';

const NONE = { top: 0, bottom: 0, keyboard: false };

describe('baselineOf: как выглядит экран без клавиатуры', () => {
  it('без visualViewport — всё окно', () => {
    expect(baselineOf(844, null)).toEqual({ height: 844, top: 0, gap: 0 });
  });

  it('обычный экран: видимая область равна окну', () => {
    expect(baselineOf(844, { height: 844, offsetTop: 0 })).toEqual({ height: 844, top: 0, gap: 0 });
  });

  it('iOS в режиме приложения: видимая область ниже окна на строку состояния — это запоминается как норма', () => {
    expect(baselineOf(844, { height: 797, offsetTop: 0 })).toEqual({ height: 797, top: 0, gap: 47 });
  });

  it('отрицательной щели не бывает', () => {
    expect(baselineOf(800, { height: 844, offsetTop: 0 }).gap).toBe(0);
  });
});

describe('appInsets: где стоит приложение', () => {
  const plain: Baseline = { height: 844, top: 0, gap: 0 };
  const statusBar: Baseline = { height: 797, top: 0, gap: 47 };

  it('без клавиатуры приложение на всё окно, даже если видимая область занижена (пустая полоса снизу)', () => {
    expect(appInsets(844, { height: 844, offsetTop: 0 }, plain)).toEqual(NONE);
    expect(appInsets(844, { height: 797, offsetTop: 0 }, statusBar)).toEqual(NONE);
  });

  it('без visualViewport отступов нет', () => {
    expect(appInsets(844, null, plain)).toEqual(NONE);
  });

  it('клавиатура: приложение заканчивается над ней', () => {
    expect(appInsets(844, { height: 500, offsetTop: 0 }, plain)).toEqual({ top: 0, bottom: 344, keyboard: true });
  });

  it('клавиатура + iOS подкрутила страницу: приложение едет вместе с видимой областью', () => {
    expect(appInsets(844, { height: 500, offsetTop: 160 }, plain)).toEqual({ top: 160, bottom: 184, keyboard: true });
  });

  it('строка состояния занижает область, а клавиатура открыта: щель не прибавляется к клавиатуре', () => {
    // клавиатура 336 px: видимая область 844 − 47 − 336 = 461
    expect(appInsets(844, { height: 461, offsetTop: 0 }, statusBar)).toEqual({ top: 0, bottom: 336, keyboard: true });
    expect(appInsets(844, { height: 461, offsetTop: 100 }, statusBar)).toEqual({ top: 100, bottom: 236, keyboard: true });
  });

  it('клавиатура определяется по высоте области, а не по сдвигу: при сильной подкрутке тоже открыта', () => {
    expect(appInsets(844, { height: 508, offsetTop: 300 }, plain).keyboard).toBe(true);
  });

  it('небольшое уменьшение (панель подсказок, адресная строка) клавиатурой не считается', () => {
    expect(appInsets(844, { height: 844 - KEYBOARD_MIN_PX, offsetTop: 0 }, plain)).toEqual(NONE);
    expect(appInsets(844, { height: 844 - KEYBOARD_MIN_PX - 1, offsetTop: 0 }, plain).keyboard).toBe(true);
  });

  it('страница увеличена щипком: приложение не трогаем', () => {
    expect(appInsets(844, { height: 300, offsetTop: 50, scale: 2.2 }, plain)).toEqual(NONE);
    expect(appInsets(844, { height: 500, offsetTop: 0, scale: 1 }, plain).keyboard).toBe(true);
  });

  it('отрицательные значения (резинка iOS) отсекаются', () => {
    const r = appInsets(844, { height: 500, offsetTop: -30 }, plain);
    expect(r.top).toBe(0);
    expect(r.bottom).toBeGreaterThanOrEqual(0);
  });
});

describe('layoutScale: масштаб страницы, при котором приложение выглядит не так, как нарисовано', () => {
  const phone = { screenWidth: 390, screenHeight: 844 };

  it('всё как задумано: окно 390 px — выравнивать нечего', () => {
    expect(layoutScale({ ...phone, innerWidth: 390, innerHeight: 844 })).toBe(1);
    expect(layoutScale({ ...phone, innerWidth: 390, innerHeight: 760 })).toBe(1); // Safari с панелями
  });

  it('страница показана в масштабе 85 %: окно 459 px — приложение увеличивается в 1,177 раза', () => {
    expect(layoutScale({ ...phone, innerWidth: 459, innerHeight: 993 })).toBe(1.177);
  });

  it('страница увеличена до 125 %: окно 312 px — приложение уменьшается до задуманного размера', () => {
    expect(layoutScale({ ...phone, innerWidth: 312, innerHeight: 675 })).toBe(0.8);
  });

  it('небольшие отличия (безопасные зоны, полоса прокрутки) — не масштаб', () => {
    expect(layoutScale({ ...phone, innerWidth: 375, innerHeight: 800 })).toBe(1);
    expect(layoutScale({ ...phone, innerWidth: 414, innerHeight: 800 })).toBe(1);
  });

  it('альбомная ориентация: iOS отдаёт экран портретным, ширину сравниваем с длинной стороной', () => {
    expect(layoutScale({ ...phone, innerWidth: 844, innerHeight: 390 })).toBe(1);
    expect(layoutScale({ ...phone, innerWidth: 993, innerHeight: 459 })).toBe(1.177);
  });

  it('планшеты и компьютеры не трогаем', () => {
    expect(layoutScale({ screenWidth: 820, screenHeight: 1180, innerWidth: 964, innerHeight: 1388 })).toBe(1);
    expect(layoutScale({ screenWidth: 1920, screenHeight: 1080, innerWidth: 1200, innerHeight: 700 })).toBe(1);
  });

  it('мусорные значения не ломают', () => {
    expect(layoutScale({ screenWidth: 0, screenHeight: 0, innerWidth: 0, innerHeight: 0 })).toBe(1);
    expect(layoutScale({ ...phone, innerWidth: NaN, innerHeight: 800 })).toBe(1);
  });

  it('крайние значения ограничены', () => {
    expect(layoutScale({ screenWidth: 100, screenHeight: 200, innerWidth: 900, innerHeight: 1800 })).toBe(2);
    expect(layoutScale({ screenWidth: 400, screenHeight: 800, innerWidth: 100, innerHeight: 300 })).toBe(0.5);
  });
});

describe('оценка клавиатуры, когда браузер о ней молчит', () => {
  it('доля экрана: на 844 px клавиатура с полосой «готово» занимает около 388', () => {
    expect(estimatedInsets(844)).toEqual({ top: 0, bottom: Math.round(844 * KEYBOARD_SHARE), keyboard: true });
    expect(Math.round(844 * KEYBOARD_SHARE)).toBeGreaterThanOrEqual(380);
    expect(Math.round(844 * KEYBOARD_SHARE)).toBeLessThanOrEqual(395);
  });

  it('в масштабе страницы 85 % (окно 994 px) оценка растёт вместе с окном', () => {
    expect(estimatedInsets(994).bottom).toBe(457);
  });

  const media = (matches: Record<string, boolean>): Window => ({ matchMedia: (q: string) => ({ matches: matches[q] ?? false }) }) as unknown as Window;

  it('оценка только на телефоне с сенсорным экраном', () => {
    expect(canEstimate(media({ '(pointer: coarse)': true, '(max-width: 559px)': true }))).toBe(true);
    expect(canEstimate(media({ '(pointer: coarse)': false, '(max-width: 559px)': true }))).toBe(false);
    expect(canEstimate(media({ '(pointer: coarse)': true, '(max-width: 559px)': false }))).toBe(false);
    expect(canEstimate({} as Window)).toBe(false);
  });
});

// В среде тестов нет DOM: подставляем минимальные классы, чтобы проверить различение полей.
class FakeInput {
  constructor(
    public type: string,
    public readOnly = false,
  ) {}
  scrollIntoView(): void {}
}
class FakeTextarea {}

describe('isTextField: у каких полей есть клавиатура', () => {
  beforeEach(() => {
    vi.stubGlobal('HTMLInputElement', FakeInput);
    vi.stubGlobal('HTMLTextAreaElement', FakeTextarea);
  });
  afterEach(() => vi.unstubAllGlobals());

  const input = (type: string, readOnly = false): Element => new FakeInput(type, readOnly) as unknown as Element;

  it('текст, число, дата, время и многострочное поле — да', () => {
    for (const t of ['text', 'number', 'date', 'time', 'search', 'tel', 'email', 'url', 'password', 'datetime-local', '']) {
      expect(isTextField(input(t)), t).toBe(true);
    }
    expect(isTextField(new FakeTextarea() as unknown as Element)).toBe(true);
  });

  it('флажок, переключатель, файл, кнопка, поле «только чтение» — нет', () => {
    for (const t of ['checkbox', 'radio', 'file', 'button', 'submit', 'range', 'color']) {
      expect(isTextField(input(t)), t).toBe(false);
    }
    expect(isTextField(input('text', true))).toBe(false);
  });

  it('не поле и пусто — нет', () => {
    expect(isTextField(null)).toBe(false);
    expect(isTextField({} as Element)).toBe(false);
  });
});

// ───────────── подставные окно и документ ─────────────

type Handler = (e?: unknown) => void;

function fakeEnv(opts: { layout?: number; idleHeight?: number; vv?: boolean; phone?: boolean; innerWidth?: number } = {}) {
  const layout = opts.layout ?? 844;
  const classes = new Set<string>();
  const style: Record<string, string> = {};
  const frames: Array<() => void> = [];
  const timers: Array<() => void> = [];
  const listeners = new Map<string, Set<Handler>>();
  const vvListeners = new Map<string, Set<Handler>>();
  const reg = (m: Map<string, Set<Handler>>, k: string, h: Handler): void => void (m.get(k) ?? m.set(k, new Set()).get(k)!).add(h);
  const unreg = (m: Map<string, Set<Handler>>, k: string, h: Handler): void => void m.get(k)?.delete(h);
  const fire = (m: Map<string, Set<Handler>>, k: string, e?: unknown): void => m.get(k)?.forEach((h) => h(e));

  const vv = { height: opts.idleHeight ?? layout, offsetTop: 0, scale: 1, addEventListener: (k: string, h: Handler) => reg(vvListeners, k, h), removeEventListener: (k: string, h: Handler) => unreg(vvListeners, k, h) };
  const scrollingElement = { scrollTop: 0 };
  const win = {
    innerHeight: layout,
    innerWidth: opts.innerWidth ?? 390,
    screen: { width: 390, height: 844 },
    scrollX: 0,
    scrollY: 0,
    visualViewport: opts.vv === false ? null : vv,
    scrollTo: vi.fn(() => {
      win.scrollX = 0;
      win.scrollY = 0;
    }),
    matchMedia: (q: string) => ({ matches: opts.phone === true && (q === '(pointer: coarse)' || q === '(max-width: 559px)') }),
    requestAnimationFrame: (cb: () => void) => frames.push(cb),
    setTimeout: (cb: () => void) => timers.push(cb),
    addEventListener: (k: string, h: Handler) => reg(listeners, k, h),
    removeEventListener: (k: string, h: Handler) => unreg(listeners, k, h),
  };
  const doc = {
    documentElement: {
      clientHeight: layout,
      style: { setProperty: (k: string, v: string) => void (style[k] = v), removeProperty: (k: string) => void delete style[k] },
      classList: { add: (c: string) => classes.add(c), toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)), contains: (c: string) => classes.has(c) },
    },
    scrollingElement,
    activeElement: null as unknown,
    addEventListener: (k: string, h: Handler) => reg(listeners, k, h),
    removeEventListener: (k: string, h: Handler) => unreg(listeners, k, h),
  };
  const flush = (): void => {
    while (frames.length) frames.shift()!();
  };
  /** Прошла пауза после фокуса (setTimeout): запускаем отложенное. */
  const runTimers = (): void => {
    while (timers.length) timers.shift()!();
    flush();
  };
  /** Браузер сообщил новую видимую область. */
  const resize = (height: number, offsetTop = 0): void => {
    vv.height = height;
    vv.offsetTop = offsetTop;
    fire(vvListeners, 'resize');
    flush();
  };
  return { win, doc, vv, vvListeners, listeners, classes, style, scrollingElement, flush, timers, fire, resize, runTimers };
}

describe('startViewport: привязка к видимой области', () => {
  beforeEach(() => {
    vi.stubGlobal('HTMLInputElement', FakeInput);
    vi.stubGlobal('HTMLTextAreaElement', FakeTextarea);
  });
  afterEach(() => vi.unstubAllGlobals());

  const start = (e: ReturnType<typeof fakeEnv>) => startViewport(e.win as unknown as Window, e.doc as unknown as Document);
  const focusField = (e: ReturnType<typeof fakeEnv>): void => {
    e.doc.activeElement = new FakeInput('text');
    e.fire(e.listeners, 'focusin', { target: e.doc.activeElement });
    e.flush();
  };
  const blur = (e: ReturnType<typeof fakeEnv>): void => {
    e.doc.activeElement = null;
    e.fire(e.listeners, 'focusout');
    e.flush();
  };

  it('сразу включает режим привязки; без клавиатуры отступов нет', () => {
    const e = fakeEnv();
    start(e);
    expect(e.classes.has('vv')).toBe(true);
    expect(e.style['--app-top']).toBe('0px');
    expect(e.style['--app-bottom']).toBe('0px');
    expect(e.classes.has('kb')).toBe(false);
  });

  it('видимая область занижена на строку состояния: приложение всё равно на всё окно (пустой полосы снизу нет)', () => {
    const e = fakeEnv({ idleHeight: 797 });
    start(e);
    expect(e.style['--app-bottom']).toBe('0px');
    expect(e.classes.has('kb')).toBe(false);
    e.resize(797);
    expect(e.style['--app-bottom']).toBe('0px');
  });

  it('клавиатура выехала: приложение заканчивается над ней, включён режим kb', () => {
    const e = fakeEnv();
    start(e);
    focusField(e);
    e.resize(500);
    expect(e.style['--app-top']).toBe('0px');
    expect(e.style['--app-bottom']).toBe('344px');
    expect(e.classes.has('kb')).toBe(true);
  });

  it('клавиатура + заниженная область: клавиатура считается без щели', () => {
    const e = fakeEnv({ idleHeight: 797 });
    start(e);
    focusField(e);
    e.resize(461);
    expect(e.style['--app-bottom']).toBe('336px');
  });

  it('iOS подкрутила страницу: приложение едет вместе с видимой областью', () => {
    const e = fakeEnv();
    start(e);
    focusField(e);
    e.resize(500, 140);
    expect(e.style['--app-top']).toBe('140px');
    expect(e.style['--app-bottom']).toBe('204px');
  });

  it('клавиатура выезжает постепенно: «обычный» вид экрана не подменяется на полпути', () => {
    const e = fakeEnv();
    start(e);
    focusField(e);
    for (const h of [790, 700, 600, 520, 500]) e.resize(h);
    expect(e.classes.has('kb')).toBe(true);
    expect(e.style['--app-bottom']).toBe('344px');
  });

  it('клавиатура убрана — отступы возвращаются, а при следующем показе всё считается заново', () => {
    const e = fakeEnv();
    start(e);
    focusField(e);
    e.resize(500);
    blur(e);
    e.resize(844);
    expect(e.style['--app-bottom']).toBe('0px');
    expect(e.classes.has('kb')).toBe(false);
    focusField(e);
    e.resize(480);
    expect(e.style['--app-bottom']).toBe('364px');
  });

  it('клавиатура уезжает постепенно: после неё приложение снова на всё окно', () => {
    const e = fakeEnv();
    start(e);
    focusField(e);
    e.resize(500);
    blur(e);
    for (const h of [560, 640, 760, 844]) e.resize(h);
    expect(e.style['--app-bottom']).toBe('0px');
    expect(e.classes.has('kb')).toBe(false);
  });

  it('поворот экрана без клавиатуры: норма перемеряется', () => {
    const e = fakeEnv();
    start(e);
    e.win.innerHeight = 390;
    e.doc.documentElement.clientHeight = 390;
    e.resize(390);
    expect(e.classes.has('kb')).toBe(false);
    expect(e.style['--app-bottom']).toBe('0px');
  });

  it('iOS молчит о клавиатуре (приложение «с экрана Домой»): после паузы высота оценивается, шторка выше клавиатуры', () => {
    const e = fakeEnv({ phone: true });
    start(e);
    focusField(e);
    expect(e.style['--app-bottom']).toBe('0px'); // пока рано: вдруг браузер сообщит сам
    e.runTimers();
    expect(e.classes.has('kb')).toBe(true);
    expect(e.style['--app-bottom']).toBe(`${Math.round(844 * KEYBOARD_SHARE)}px`);
  });

  it('оценка не включается без сенсорного экрана (на компьютере поле в фокусе — не клавиатура)', () => {
    const e = fakeEnv({ phone: false });
    start(e);
    focusField(e);
    e.runTimers();
    expect(e.classes.has('kb')).toBe(false);
    expect(e.style['--app-bottom']).toBe('0px');
  });

  it('если браузер потом сообщил реальную высоту — берётся она, а не оценка', () => {
    const e = fakeEnv({ phone: true });
    start(e);
    focusField(e);
    e.runTimers();
    e.resize(500);
    expect(e.style['--app-bottom']).toBe('344px');
  });

  it('поле потеряло фокус — оценка снимается, приложение снова на всё окно', () => {
    const e = fakeEnv({ phone: true });
    start(e);
    focusField(e);
    e.runTimers();
    blur(e);
    e.runTimers();
    expect(e.classes.has('kb')).toBe(false);
    expect(e.style['--app-bottom']).toBe('0px');
  });

  it('переход между полями («вперёд» на панели клавиатуры) оценку не сбрасывает', () => {
    const e = fakeEnv({ phone: true });
    start(e);
    focusField(e);
    e.runTimers();
    e.fire(e.listeners, 'focusout');
    focusField(e); // фокус сразу перешёл на другое поле
    e.runTimers();
    expect(e.classes.has('kb')).toBe(true);
  });

  it('прокрутка поля в видимую часть делается после оценки, а не до неё', () => {
    const e = fakeEnv({ phone: true });
    start(e);
    const order: string[] = [];
    const field = Object.assign(new FakeInput('text'), { scrollIntoView: () => order.push(`scroll(bottom=${e.style['--app-bottom']})`) });
    e.doc.activeElement = field;
    e.fire(e.listeners, 'focusin', { target: field });
    e.runTimers();
    expect(order).toEqual([`scroll(bottom=${Math.round(844 * KEYBOARD_SHARE)}px)`]);
  });

  it('страница показана в масштабе 85 %: на <html> ставится --z, при возврате к 100 % убирается', () => {
    const e = fakeEnv({ innerWidth: 459, layout: 993 });
    start(e);
    expect(e.style['--z']).toBe('1.177');
    e.win.innerWidth = 390;
    e.win.innerHeight = 844;
    e.doc.documentElement.clientHeight = 844;
    e.resize(844);
    expect(e.style['--z']).toBeUndefined();
  });

  it('обычный экран: --z не ставится вовсе (вёрстка не меняется)', () => {
    const e = fakeEnv();
    start(e);
    expect(e.style['--z']).toBeUndefined();
  });

  it('страницу, подкрученную браузером, возвращает на место', () => {
    const e = fakeEnv();
    start(e);
    e.win.scrollY = 260;
    e.scrollingElement.scrollTop = 260;
    e.fire(e.listeners, 'scroll');
    e.flush();
    expect(e.win.scrollTo).toHaveBeenCalledWith(0, 0);
    expect(e.scrollingElement.scrollTop).toBe(0);
  });

  it('страница увеличена щипком: приложение не сжимается', () => {
    const e = fakeEnv();
    start(e);
    e.vv.scale = 2;
    e.resize(300, 40);
    expect(e.classes.has('kb')).toBe(false);
    expect(e.style['--app-bottom']).toBe('0px');
  });

  it('без visualViewport тоже работает: отступов нет', () => {
    const e = fakeEnv({ vv: false });
    start(e);
    e.win.innerHeight = 600;
    e.doc.documentElement.clientHeight = 600;
    e.fire(e.listeners, 'resize');
    e.flush();
    expect(e.style['--app-bottom']).toBe('0px');
    expect(e.classes.has('kb')).toBe(false);
  });

  it('несколько событий подряд — один пересчёт на кадр', () => {
    const e = fakeEnv();
    start(e);
    const raf = vi.spyOn(e.win, 'requestAnimationFrame');
    for (let i = 0; i < 10; i++) e.fire(e.vvListeners, 'resize');
    expect(raf).toHaveBeenCalledTimes(1);
    e.flush();
    e.fire(e.vvListeners, 'resize');
    expect(raf).toHaveBeenCalledTimes(2);
  });

  it('снятие обработчиков: после остановки события ничего не меняют', () => {
    const e = fakeEnv();
    const stop = start(e);
    stop();
    focusField(e);
    e.resize(400);
    expect(e.style['--app-bottom']).toBe('0px');
  });
});
