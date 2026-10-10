import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEY, emptyState } from '../src/store/state';
import { UNREADABLE_KEY, disablePersistence, getState, loadFromStorage, setState, subscribe, update } from '../src/store/store';

/** Хранилище браузера в памяти. */
function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: vi.fn((k: string, v: string) => void data.set(k, v)),
    removeItem: (k: string) => void data.delete(k),
  };
}

const saved = () => ({ ...emptyState(), onboarded: true, children: [{ id: 'c1', name: 'Мила', birth: '2026-05-02', gender: 'f' as const, createdAt: 0 }], activeChildId: 'c1' });

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('сохранение в браузере', () => {
  it('запись откладывается на 200 мс и склеивает частые изменения в одну', () => {
    const ls = fakeStorage();
    vi.stubGlobal('localStorage', ls);
    update((s) => ({ ...s, demo: true }));
    update((s) => ({ ...s, demo: false }));
    update((s) => ({ ...s, onboarded: true }));
    expect(ls.setItem).not.toHaveBeenCalled();
    vi.advanceTimersByTime(199);
    expect(ls.setItem).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(ls.setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(ls.data.get(STORAGE_KEY)!).onboarded).toBe(true);
  });

  it('подписчики узнают об изменении сразу, без задержки записи', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    const spy = vi.fn();
    const off = subscribe(spy);
    update((s) => ({ ...s, demo: true }));
    expect(spy).toHaveBeenCalledTimes(1);
    off();
    update((s) => ({ ...s, demo: false }));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('при запуске читает сохранённое', () => {
    vi.stubGlobal('localStorage', fakeStorage({ [STORAGE_KEY]: JSON.stringify(saved()) }));
    loadFromStorage();
    expect(getState().children[0].name).toBe('Мила');
    expect(getState().onboarded).toBe(true);
  });

  it('повреждённое хранилище не ломает запуск: остаётся предыдущее состояние', () => {
    setState(emptyState());
    vi.stubGlobal('localStorage', fakeStorage({ [STORAGE_KEY]: '{не json' }));
    expect(() => loadFromStorage()).not.toThrow();
    expect(getState().children).toEqual([]);
  });

  it('чужая версия данных не принимается', () => {
    setState(emptyState());
    vi.stubGlobal('localStorage', fakeStorage({ [STORAGE_KEY]: JSON.stringify({ ...saved(), v: 99 }) }));
    loadFromStorage();
    expect(getState().children).toEqual([]);
  });

  it('непрочитанное не пропадает: копия остаётся рядом, даже когда приложение пишет новые данные', () => {
    setState(emptyState());
    const ls = fakeStorage({ [STORAGE_KEY]: '{не json' });
    vi.stubGlobal('localStorage', ls);
    loadFromStorage();
    expect(ls.data.get(UNREADABLE_KEY)).toBe('{не json');
    update((s) => ({ ...s, demo: true }));
    vi.advanceTimersByTime(300);
    expect(JSON.parse(ls.data.get(STORAGE_KEY)!).demo).toBe(true);
    expect(ls.data.get(UNREADABLE_KEY)).toBe('{не json');
  });

  it('данные новой версии приложения тоже откладываются, а не затираются', () => {
    setState(emptyState());
    const future = JSON.stringify({ ...saved(), v: 2 });
    const ls = fakeStorage({ [STORAGE_KEY]: future });
    vi.stubGlobal('localStorage', ls);
    loadFromStorage();
    expect(ls.data.get(UNREADABLE_KEY)).toBe(future);
  });

  it('нормальные данные и пустое хранилище копий не создают', () => {
    const ls = fakeStorage({ [STORAGE_KEY]: JSON.stringify(saved()) });
    vi.stubGlobal('localStorage', ls);
    loadFromStorage();
    expect(ls.data.has(UNREADABLE_KEY)).toBe(false);
    const empty = fakeStorage();
    vi.stubGlobal('localStorage', empty);
    loadFromStorage();
    expect(empty.data.has(UNREADABLE_KEY)).toBe(false);
  });

  it('данные с мусорными записями читаются без мусора', () => {
    const dirty = { ...saved(), events: [{ id: 'a', childId: 'c1', type: 'sleep', t: 1 }, { id: 'b', childId: 'c1', type: 'bath', t: 2, updatedAt: 0 }] };
    vi.stubGlobal('localStorage', fakeStorage({ [STORAGE_KEY]: JSON.stringify(dirty) }));
    loadFromStorage();
    expect(getState().events.map((e) => e.id)).toEqual(['b']);
  });

  it('недоступное хранилище (приватный режим, переполнение) не роняет приложение', () => {
    const ls = fakeStorage();
    ls.setItem.mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    vi.stubGlobal('localStorage', ls);
    update((s) => ({ ...s, demo: true }));
    expect(() => vi.advanceTimersByTime(300)).not.toThrow();
    expect(getState().demo).toBe(true);
  });

  it('если хранилища нет совсем, чтение тоже не падает', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(() => loadFromStorage()).not.toThrow();
  });
});

describe('режим без сохранения (макеты и тесты)', () => {
  it('после disablePersistence ничего не пишется', () => {
    const ls = fakeStorage();
    vi.stubGlobal('localStorage', ls);
    disablePersistence();
    update((s) => ({ ...s, demo: true }));
    vi.advanceTimersByTime(1000);
    expect(ls.setItem).not.toHaveBeenCalled();
  });
});
