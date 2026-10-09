import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Snapshot, decodeSnapshot, encodeSnapshot, makeSnapshot, snapshotFromText, snapshotLink, viewFromSnapshot } from '../src/app/share';
import { parseHash, pathOf } from '../src/app/router';
import {
  FEED_C, HOME_C, HOME_R, SLEEP_C, SLEEP_OUTER_C, feedRingDash, homeRing, progressPct, sleepRing,
} from '../src/engine/geometry';
import { MIN } from '../src/engine/time';
import { derive } from '../src/store/select';
import { sanitizeState } from '../src/store/state';
import { at, sleep, feed } from './helpers';

/** Кодирует произвольный объект так же, как приложение, но без его проверок. */
const enc = (o: unknown): string => Buffer.from(JSON.stringify(o), 'utf8').toString('base64url');

const snap = (extra: Partial<Snapshot> = {}): Snapshot => ({ v: 1, n: 'Мила', g: 'f', t: at(0, '14:00'), s: null, w: null, f: null, p: null, r: null, ...extra });

describe('снимок для ссылки', () => {
  it('кодирует и читает обратно, в том числе кириллицу', () => {
    const s = snap({ s: at(0, '13:00'), r: [60, 80], f: at(0, '12:30') });
    expect(decodeSnapshot(encodeSnapshot(s))).toEqual(s);
  });

  it('код состоит только из символов, безопасных для адреса', () => {
    expect(encodeSnapshot(snap({ n: 'Ёжик 🦔 и Ко' }))).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('имя с эмодзи переживает круг', () => {
    expect(decodeSnapshot(encodeSnapshot(snap({ n: 'Ёжик 🦔' })))!.n).toBe('Ёжик 🦔');
  });

  it.each([
    ['пустая строка', ''],
    ['не base64', '!!!'],
    ['не JSON', btoa('привет'.replace(/[^\x00-\x7f]/g, 'x'))],
  ])('мусор не принимается: %s', (_n, code) => {
    expect(decodeSnapshot(code)).toBeNull();
  });

  it('чужая версия и пустые поля не принимаются', () => {
    expect(decodeSnapshot(enc({ ...snap(), v: 2 }))).toBeNull();
    expect(decodeSnapshot(enc({ v: 1, n: 5, t: 1 }))).toBeNull();
    expect(decodeSnapshot(enc({ v: 1, n: 'А' }))).toBeNull();
    expect(decodeSnapshot(enc(null))).toBeNull();
    expect(decodeSnapshot(enc([]))).toBeNull();
  });

  it('чужие значения полей заменяются на null, лишнее отбрасывается', () => {
    const d = decodeSnapshot(enc({ v: 1, n: 'А', g: 'x', t: 5, s: 'вчера', w: null, f: 7, p: {}, r: ['a', 'b'], evil: 1 }))!;
    expect(d).toEqual({ v: 1, n: 'А', g: 'f', t: 5, s: null, w: null, f: 7, p: null, r: null });
  });

  it('диапазон должен быть упорядочен и неотрицателен', () => {
    const encR = (r: unknown) => enc({ ...snap(), r });
    expect(decodeSnapshot(encR([80, 60]))!.r).toBeNull();
    expect(decodeSnapshot(encR([-5, 60]))!.r).toBeNull();
    expect(decodeSnapshot(encR([60, 80]))!.r).toEqual([60, 80]);
  });

  it('очень длинное имя обрезается', () => {
    expect(decodeSnapshot(encodeSnapshot(snap({ n: 'я'.repeat(500) })))!.n).toHaveLength(40);
  });
});

describe('ссылка', () => {
  beforeEach(() => {
    vi.stubGlobal('location', { origin: 'https://example.github.io', pathname: '/drema/' });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ссылка ведёт на страницу просмотра и читается обратно', () => {
    const s = snap({ s: at(0, '13:00') });
    const link = snapshotLink(s);
    expect(link.startsWith('https://example.github.io/drema/#/view/')).toBe(true);
    expect(snapshotFromText(link)).toEqual(s);
  });

  it('читает ссылку, вставленную вместе с текстом, и голый код', () => {
    const s = snap();
    const code = encodeSnapshot(s);
    expect(snapshotFromText(`Смотри: https://x.y/#/view/${code} — вот`)).toEqual(s);
    expect(snapshotFromText(`  ${code} `)).toEqual(s);
    expect(snapshotFromText('просто текст')).toBeNull();
  });
});

describe('снимок из данных приложения', () => {
  const child = { id: 'c1', name: 'Мила', birth: '2026-05-02', gender: 'f', createdAt: 0 };
  const state = (events: unknown[]) => sanitizeState({ v: 1, onboarded: true, children: [child], events })!;
  const withType = <T extends object>(e: T) => ({ ...e });

  it('идущий сон: начало и обычный диапазон', () => {
    const now = at(0, '13:30');
    const d = derive(state([withType(sleep(0, '13:00', null)), withType(feed(0, '12:30'))]), now)!;
    const s = makeSnapshot(d, now);
    expect(s).toMatchObject({ n: 'Мила', g: 'f', t: now, s: at(0, '13:00'), w: null, f: at(0, '12:30'), p: null });
  });

  it('малыш не спит: последнее пробуждение, без начала сна', () => {
    const now = at(0, '10:00');
    const d = derive(state([withType(sleep(0, '08:00', '09:00'))]), now)!;
    const s = makeSnapshot(d, now);
    expect(s.s).toBeNull();
    expect(s.w).toBe(at(0, '09:00'));
  });
});

describe('что видит открывший ссылку', () => {
  it('идёт сон: заголовок, время, шкала от обычной длительности', () => {
    const s = snap({ s: at(0, '13:00'), r: [60, 80] });
    const v = viewFromSnapshot(s, at(0, '13:40'));
    expect(v.model.title).toContain('Мила');
    expect(v.model.sub).toBe('с 13:00 · уже 40 мин');
    expect(v.model.pct).toBe(50);
    expect(v.model.icon).toBe('moon');
  });

  it('шкала не превышает 100 %', () => {
    expect(viewFromSnapshot(snap({ s: at(0, '12:00'), r: [60, 80] }), at(0, '15:00')).model.pct).toBe(100);
  });

  it('без диапазона шкалы нет', () => {
    expect(viewFromSnapshot(snap({ s: at(0, '12:00') }), at(0, '13:00')).model.pct).toBeNull();
  });

  it('бодрствует: от пробуждения до прогноза, плюс строка про следующий сон и кормление', () => {
    const s = snap({ w: at(0, '12:00'), p: at(0, '14:20'), f: at(0, '12:30') });
    const v = viewFromSnapshot(s, at(0, '13:10'));
    expect(v.model.title).toBe('Мила не спит');
    expect(v.model.sub).toBe('с 12:00 · уже 1 ч 10 мин');
    expect(v.model.pct).toBe(Math.round((70 / 140) * 100));
    expect(v.facts).toEqual([
      { label: 'Следующий сон около', value: '14:20' },
      { label: 'Кормили', value: 'в 12:30' },
    ]);
  });

  it('прогноз раньше пробуждения не даёт шкалы', () => {
    expect(viewFromSnapshot(snap({ w: at(0, '12:00'), p: at(0, '11:00') }), at(0, '13:00')).model.pct).toBeNull();
  });

  it('пустой снимок', () => {
    const v = viewFromSnapshot(snap(), at(0, '14:00'));
    expect(v.model.sub).toBe('Свежих записей пока нет');
    expect(v.facts).toEqual([]);
  });

  it('старше шести часов — устарел', () => {
    const s = snap({ t: at(0, '08:00') });
    expect(viewFromSnapshot(s, at(0, '14:00')).stale).toBe(false);
    expect(viewFromSnapshot(s, at(0, '14:01')).stale).toBe(true);
    expect(viewFromSnapshot(s, at(0, '14:01')).takenAt).toBe('08:00');
  });

  it('время из будущего (часы разошлись) не даёт отрицательных значений', () => {
    const v = viewFromSnapshot(snap({ s: at(0, '15:00') }), at(0, '14:00'));
    expect(v.model.sub).toBe('с 15:00 · уже 0 мин');
  });

  it('форма слов зависит от пола', () => {
    expect(viewFromSnapshot(snap({ g: 'm', n: 'Лев', s: at(0, '13:00') }), at(0, '13:10')).model.title).toBe('Лев спит');
    expect(viewFromSnapshot(snap({ g: 'm', f: at(0, '12:00') }), at(0, '13:00')).facts[0].label).toBe('Кормили');
  });
});

describe('маршруты', () => {
  it.each([
    ['', 'home', ''],
    ['#', 'home', ''],
    ['#/', 'home', ''],
    ['#/sleeping', 'sleeping', ''],
    ['#/night', 'night', ''],
    ['#/why', 'why', ''],
    ['#/view/abc_DEF-123', 'view', 'abc_DEF-123'],
    ['#/нет-такого', 'home', ''],
    ['#/settings/x/y', 'settings', 'x/y'],
  ])('%s → %s (%s)', (hash, name, arg) => {
    expect(parseHash(hash)).toEqual({ name, arg });
  });

  it('путь по маршруту', () => {
    expect(pathOf({ name: 'home', arg: '' })).toBe('/');
    expect(pathOf({ name: 'view', arg: 'abc' })).toBe('/view/abc');
    expect(pathOf({ name: 'day', arg: '' })).toBe('/day');
  });
});

describe('геометрия колец', () => {
  const near = (a: number, b: number, d = 0.11) => expect(Math.abs(a - b)).toBeLessThanOrEqual(d);

  it('длина окружностей', () => {
    near(HOME_C, 2 * Math.PI * 108, 1e-9);
    expect(HOME_R).toBe(108);
    near(SLEEP_C, 2 * Math.PI * 128, 1e-9);
    near(SLEEP_OUTER_C, 2 * Math.PI * 142, 1e-9);
    near(FEED_C, 2 * Math.PI * 32, 1e-9);
  });

  it('главное кольцо: начало — ручка вверху', () => {
    const r = homeRing(0, 100, 130, 200);
    expect(r.elapsed).toBe(0);
    expect(r.knobX).toBe(130);
    expect(r.knobY).toBe(22);
  });

  it('четверть круга — ручка справа, половина — внизу', () => {
    const q = homeRing(50, 100, 130, 200);
    near(q.knobX, 238);
    near(q.knobY, 130);
    const h = homeRing(100, 100, 130, 200);
    near(h.knobX, 130);
    near(h.knobY, 238);
  });

  it('окно сна: длина и сдвиг дуги пропорциональны шкале', () => {
    const r = homeRing(60, 100, 130, 200);
    near(r.windowOff, 0.5 * HOME_C);
    near(r.windowLen, 0.15 * HOME_C);
  });

  it('значения вне шкалы зажимаются, а не уходят за круг', () => {
    const r = homeRing(999, -50, 999, 200);
    near(r.elapsed, HOME_C);
    near(r.windowOff, 0);
    near(r.windowLen, HOME_C);
  });

  it('кольцо сна: заливка и внешняя дуга диапазона', () => {
    const r = sleepRing(40, [60, 80], 120);
    near(r.elapsed, (40 / 120) * SLEEP_C);
    near(r.rangeOff, 0.5 * SLEEP_OUTER_C);
    near(r.rangeLen, (20 / 120) * SLEEP_OUTER_C);
    expect(Number.isInteger(r.knobX) && Number.isInteger(r.knobY)).toBe(true);
  });

  it('кольцо сна без диапазона — дуги нет', () => {
    const r = sleepRing(40, null, 120);
    expect(r.rangeLen).toBe(0);
    expect(r.rangeOff).toBe(0);
  });

  it('кольцо кормления: доля от обычного промежутка, не больше полного круга', () => {
    near(feedRingDash(90, 180), FEED_C / 2);
    near(feedRingDash(500, 180), FEED_C);
    expect(feedRingDash(0, 180)).toBe(0);
  });

  it('процент прогресса', () => {
    expect(progressPct(30, 60)).toBe(50);
    expect(progressPct(90, 60)).toBe(100);
    expect(progressPct(-5, 60)).toBe(0);
  });

  it('минута в миллисекундах', () => {
    expect(MIN).toBe(60000);
  });
});
