import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LISTEN_MAX_MS, NOTHING_HEARD, speechErrorMessage, speechSupported, startSpeech } from '../src/app/speech';

/** Подставной распознаватель: считает, сколько раз его запускали и отпускали. */
class FakeRecognizer {
  static all: FakeRecognizer[] = [];
  static throwOnStart = false;
  lang = '';
  interimResults = false;
  continuous = true;
  maxAlternatives = 0;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  aborted = 0;
  stopped = 0;
  constructor() {
    FakeRecognizer.all.push(this);
  }
  start(): void {
    if (FakeRecognizer.throwOnStart) throw new Error('InvalidStateError');
    this.started = true;
  }
  stop(): void {
    this.stopped++;
  }
  abort(): void {
    this.aborted++;
  }
  /** Нажатие на микрофон «горит», пока распознаватель запущен и не отпущен. */
  get live(): boolean {
    return this.started && this.aborted === 0 && this.stopped === 0;
  }
  say(...parts: string[]): void {
    this.onresult?.({ results: parts.map((p) => Object.assign([{ transcript: p }], { isFinal: false })) });
  }
}

const win = (extra: Record<string, unknown> = {}): Window => ({ webkitSpeechRecognition: FakeRecognizer, ...extra }) as unknown as Window;
const last = (): FakeRecognizer => FakeRecognizer.all[FakeRecognizer.all.length - 1];

function handlers() {
  const log: string[] = [];
  return {
    log,
    h: {
      text: (t: string) => log.push(`text:${t}`),
      end: () => log.push('end'),
      error: (c: string) => log.push(`error:${c}`),
    },
  };
}

beforeEach(() => {
  FakeRecognizer.all = [];
  FakeRecognizer.throwOnStart = false;
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('speechSupported', () => {
  it('есть распознавание — да, нет — нет', () => {
    expect(speechSupported(win())).toBe(true);
    expect(speechSupported({ SpeechRecognition: FakeRecognizer } as unknown as Window)).toBe(true);
    expect(speechSupported({} as Window)).toBe(false);
  });
});

describe('startSpeech', () => {
  it('без распознавания возвращает null и ничего не запускает', () => {
    const { h } = handlers();
    expect(startSpeech(h, {} as Window)).toBeNull();
    expect(FakeRecognizer.all).toHaveLength(0);
  });

  it('настраивает русский язык, промежуточные результаты и одну фразу за сеанс', () => {
    const { h } = handlers();
    startSpeech(h, win());
    const r = last();
    expect(r.live).toBe(true);
    expect(r.lang).toBe('ru-RU');
    expect(r.interimResults).toBe(true);
    expect(r.continuous).toBe(false);
  });

  it('склеивает всё услышанное с начала сеанса', () => {
    const { h, log } = handlers();
    startSpeech(h, win());
    last().say('покормила', '120 мл');
    expect(log).toEqual(['text:покормила 120 мл']);
  });

  it('конец распознавания: сообщает один раз и отпускает микрофон', () => {
    const { h, log } = handlers();
    startSpeech(h, win());
    const r = last();
    r.onend?.();
    expect(log).toEqual(['end']);
    expect(r.aborted).toBe(1);
    expect(r.live).toBe(false);
    // запоздавшие события игнорируются
    r.onend?.();
    r.say('ещё');
    expect(log).toEqual(['end']);
  });

  it('ошибка: сообщает код один раз и отпускает микрофон', () => {
    const { h, log } = handlers();
    startSpeech(h, win());
    const r = last();
    r.onerror?.({ error: 'not-allowed' });
    expect(log).toEqual(['error:not-allowed']);
    expect(r.aborted).toBe(1);
    r.onend?.();
    expect(log).toEqual(['error:not-allowed']);
  });

  it('cancel выключает микрофон, снимает обработчики и больше ничего не сообщает', () => {
    const { h, log } = handlers();
    const s = startSpeech(h, win())!;
    const r = last();
    s.cancel();
    expect(r.aborted).toBe(1);
    expect(r.onresult).toBeNull();
    expect(r.onerror).toBeNull();
    expect(r.onend).toBeNull();
    // abort в реальном браузере присылает onerror('aborted') и onend — обработчиков уже нет
    expect(log).toEqual([]);
    s.cancel();
    expect(r.aborted).toBe(1);
  });

  it('тишина дольше предела: слушание заканчивается само, микрофон выключается', () => {
    const { h, log } = handlers();
    startSpeech(h, win());
    const r = last();
    vi.advanceTimersByTime(LISTEN_MAX_MS - 1);
    expect(r.live).toBe(true);
    vi.advanceTimersByTime(2);
    expect(log).toEqual(['end']);
    expect(r.live).toBe(false);
  });

  it('предел не срабатывает после отмены или конца', () => {
    const { h, log } = handlers();
    const s = startSpeech(h, win())!;
    s.cancel();
    vi.advanceTimersByTime(LISTEN_MAX_MS * 2);
    expect(log).toEqual([]);

    const { h: h2, log: log2 } = handlers();
    startSpeech(h2, win());
    last().onend?.();
    vi.advanceTimersByTime(LISTEN_MAX_MS * 2);
    expect(log2).toEqual(['end']);
  });

  it('не запустился (браузер бросил исключение): null, микрофон не остаётся включённым', () => {
    FakeRecognizer.throwOnStart = true;
    const { h, log } = handlers();
    expect(startSpeech(h, win())).toBeNull();
    expect(last().live).toBe(false);
    vi.advanceTimersByTime(LISTEN_MAX_MS * 2);
    expect(log).toEqual([]);
  });

  it('два сеанса подряд не мешают друг другу: события старого не доходят до нового', () => {
    const a = handlers();
    const b = handlers();
    const s1 = startSpeech(a.h, win())!;
    const r1 = last();
    s1.cancel();
    startSpeech(b.h, win());
    const r2 = last();
    r1.say('старое');
    r1.onend?.();
    r2.say('новое');
    expect(a.log).toEqual([]);
    expect(b.log).toEqual(['text:новое']);
    expect(r2.live).toBe(true);
  });
});

describe('speechErrorMessage', () => {
  it('у каждой частой ошибки своё понятное сообщение', () => {
    const codes = ['not-allowed', 'no-speech', 'audio-capture', 'network', 'language-not-supported', 'что-то-новое'];
    const msgs = codes.map(speechErrorMessage);
    expect(new Set(msgs).size).toBe(codes.length);
    for (const m of msgs) expect(m.length).toBeGreaterThan(20);
    expect(speechErrorMessage('service-not-allowed')).toBe(speechErrorMessage('not-allowed'));
    expect(speechErrorMessage('not-allowed')).toMatch(/Нет доступа к микрофону/);
    expect(NOTHING_HEARD).toMatch(/Ничего не услышали/);
  });
});
