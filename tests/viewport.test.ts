import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KEYBOARD_MIN_PX, isTextField, keyboardOpen, startViewport, viewportBox } from '../src/app/viewport';

describe('viewportBox: размер приложения равен видимой области', () => {
  it('без visualViewport берёт высоту окна', () => {
    expect(viewportBox(844, null)).toEqual({ top: 0, height: 844 });
    expect(viewportBox(843.6, null)).toEqual({ top: 0, height: 844 });
  });

  it('с клавиатурой — высота и сдвиг видимой области', () => {
    expect(viewportBox(844, { height: 500, offsetTop: 0 })).toEqual({ top: 0, height: 500 });
    expect(viewportBox(844, { height: 500.4, offsetTop: 119.6 })).toEqual({ top: 120, height: 500 });
  });

  it('отрицательный сдвиг («резинка» iOS) и отрицательная высота не пропускаются', () => {
    expect(viewportBox(844, { height: 500, offsetTop: -30 })).toEqual({ top: 0, height: 500 });
    expect(viewportBox(844, { height: -5, offsetTop: 0 }).height).toBe(0);
  });
});

describe('keyboardOpen', () => {
  it('закрыта: видимая область равна окну или чуть ниже (адресная строка, «резинка»)', () => {
    expect(keyboardOpen(844, { height: 844, offsetTop: 0 })).toBe(false);
    expect(keyboardOpen(844, { height: 844 - KEYBOARD_MIN_PX, offsetTop: 0 })).toBe(false);
  });

  it('открыта: область ниже окна больше чем на порог', () => {
    expect(keyboardOpen(844, { height: 844 - KEYBOARD_MIN_PX - 1, offsetTop: 0 })).toBe(true);
    expect(keyboardOpen(844, { height: 500, offsetTop: 0 })).toBe(true);
    // небольшая разница (панель подсказок, адресная строка) клавиатурой не считается
    expect(keyboardOpen(1024, { height: 980, offsetTop: 0 })).toBe(false);
  });

  it('без visualViewport клавиатуру определить нельзя — считаем закрытой', () => {
    expect(keyboardOpen(844, null)).toBe(false);
  });
});

// В среде тестов нет DOM: подставляем минимальные классы, чтобы проверить различение полей.
describe('isTextField: у каких полей есть клавиатура', () => {
  class FakeInput {
    constructor(
      public type: string,
      public readOnly = false,
    ) {}
  }
  class FakeTextarea {}

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

function fakeEnv(opts: { layout?: number; vv?: boolean } = {}) {
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

  const vv = { height: layout, offsetTop: 0, addEventListener: (k: string, h: Handler) => reg(vvListeners, k, h), removeEventListener: (k: string, h: Handler) => unreg(vvListeners, k, h) };
  const scrollingElement = { scrollTop: 0 };
  const win = {
    innerHeight: layout,
    scrollX: 0,
    scrollY: 0,
    visualViewport: opts.vv === false ? null : vv,
    scrollTo: vi.fn(function (this: { scrollX: number; scrollY: number }) {
      win.scrollX = 0;
      win.scrollY = 0;
    }),
    requestAnimationFrame: (cb: () => void) => frames.push(cb),
    setTimeout: (cb: () => void) => timers.push(cb),
    addEventListener: (k: string, h: Handler) => reg(listeners, k, h),
    removeEventListener: (k: string, h: Handler) => unreg(listeners, k, h),
  };
  const doc = {
    documentElement: { style: { setProperty: (k: string, v: string) => void (style[k] = v) }, classList: { add: (c: string) => classes.add(c), toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)), contains: (c: string) => classes.has(c) } },
    scrollingElement,
    activeElement: null as unknown,
    addEventListener: (k: string, h: Handler) => reg(listeners, k, h),
    removeEventListener: (k: string, h: Handler) => unreg(listeners, k, h),
  };
  const flush = (): void => {
    while (frames.length) frames.shift()!();
  };
  return { win, doc, vv, vvListeners, listeners, classes, style, scrollingElement, flush, timers, fire };
}

describe('startViewport: привязка к видимой области', () => {
  const start = (e: ReturnType<typeof fakeEnv>) => startViewport(e.win as unknown as Window, e.doc as unknown as Document);

  it('сразу задаёт размер и включает режим привязки', () => {
    const e = fakeEnv();
    start(e);
    expect(e.classes.has('vv')).toBe(true);
    expect(e.style['--vv-h']).toBe('844px');
    expect(e.style['--vv-top']).toBe('0px');
    expect(e.classes.has('kb')).toBe(false);
  });

  it('клавиатура выехала: приложение стало ниже, включён режим kb', () => {
    const e = fakeEnv();
    start(e);
    e.vv.height = 500;
    e.fire(e.vvListeners, 'resize');
    e.flush();
    expect(e.style['--vv-h']).toBe('500px');
    expect(e.classes.has('kb')).toBe(true);
  });

  it('iOS сдвинула видимую область — приложение едет вместе с ней, а не остаётся наверху', () => {
    const e = fakeEnv();
    start(e);
    e.vv.height = 500;
    e.vv.offsetTop = 140;
    e.fire(e.vvListeners, 'scroll');
    e.flush();
    expect(e.style['--vv-top']).toBe('140px');
    expect(e.style['--vv-h']).toBe('500px');
  });

  it('клавиатура убрана — размер возвращается', () => {
    const e = fakeEnv();
    start(e);
    e.vv.height = 500;
    e.fire(e.vvListeners, 'resize');
    e.flush();
    e.vv.height = 844;
    e.fire(e.vvListeners, 'resize');
    e.flush();
    expect(e.style['--vv-h']).toBe('844px');
    expect(e.classes.has('kb')).toBe(false);
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

  it('без visualViewport тоже работает: высота окна, клавиатура не определяется', () => {
    const e = fakeEnv({ vv: false });
    start(e);
    e.win.innerHeight = 600;
    e.fire(e.listeners, 'resize');
    e.flush();
    expect(e.style['--vv-h']).toBe('600px');
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
    e.vv.height = 400;
    e.fire(e.vvListeners, 'resize');
    e.flush();
    expect(e.style['--vv-h']).toBe('844px');
  });
});
