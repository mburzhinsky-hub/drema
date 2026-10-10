import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, atMinutes, hm, isoDate, latestAtOrBefore, startOfDay } from '../src/engine/time';
import { extractTime, parseVoice } from '../src/engine/voice';

/**
 * Перевод часов: в Европе сутки 26 октября 2026 длятся 25 часов, 29 марта — 23. Приложение русскоязычное, им пользуются
 * и там, где часы переводят (Германия, Испания, США…). Все «вчера» и «в 23:50» должны считаться по календарю, а не «минус 24 часа».
 */
const ZONE = 'Europe/Berlin';
let previous: string | undefined;
beforeAll(() => {
  previous = process.env.TZ;
  process.env.TZ = ZONE;
});
afterAll(() => {
  process.env.TZ = previous;
});

const local = (iso: string): number => new Date(iso).getTime();
const stamp = (t: number): string => `${isoDate(t)} ${hm(t)}`;

describe('часовой пояс подменился (проверка самих тестов)', () => {
  it('в Берлине 29 марта 2026 сутки на час короче, 25 октября — на час длиннее', () => {
    const hours = (d: string): number => (startOfDay(addDays(local(`${d}T12:00:00`), 1)) - startOfDay(local(`${d}T12:00:00`))) / 3_600_000;
    expect(hours('2026-03-29')).toBe(23);
    expect(hours('2026-10-25')).toBe(25);
    expect(hours('2026-10-10')).toBe(24);
  });
});

describe('«вчера» после перевода часов', () => {
  it('30 марта (после «весеннего» перевода): «вчера в 14:30» — это 29 марта, а не 28-е', () => {
    const now = local('2026-03-30T10:00:00');
    const hit = extractTime('покормила вчера в 14:30', now);
    expect(stamp(hit.t)).toBe('2026-03-29 14:30');
  });

  it('26 октября (после «осеннего» перевода): «вчера в 14:30» — это 25 октября', () => {
    const now = local('2026-10-26T10:00:00');
    const hit = extractTime('покормила вчера в 14:30', now);
    expect(stamp(hit.t)).toBe('2026-10-25 14:30');
  });

  it('в сутки перевода «в 23:50» утром — это вчера в 23:50, а не сегодня в 00:50', () => {
    const now = local('2026-10-25T10:00:00');
    const hit = extractTime('уснула в 23:50', now);
    expect(stamp(hit.t)).toBe('2026-10-24 23:50');
  });

  it('в сутки перевода «в 9:30» без «утра/вечера» — ближайшее прошедшее', () => {
    const now = local('2026-10-25T08:00:00');
    expect(stamp(extractTime('покормила в 9:30', now).t)).toBe('2026-10-24 21:30');
    expect(stamp(extractTime('покормила в 7:30', now).t)).toBe('2026-10-25 07:30');
  });

  it('целая фраза: две записи в разные сутки, обе по календарю', () => {
    const now = local('2026-03-30T10:00:00');
    const r = parseVoice('вчера в 22:15 покормила 120 мл, потом уснула в 23:40', { now, gender: 'f' });
    expect(r.actions.map((a) => stamp(a.t))).toEqual(['2026-03-29 22:15', '2026-03-29 23:40']);
  });
});

describe('latestAtOrBefore: «чч:мм» не позже «сейчас»', () => {
  it('в сутки перевода берёт вчерашнее время по календарю', () => {
    const now = local('2026-10-25T10:00:00');
    expect(stamp(latestAtOrBefore(startOfDay(now), 23 * 60 + 50, now))).toBe('2026-10-24 23:50');
    expect(stamp(latestAtOrBefore(startOfDay(now), 9 * 60, now))).toBe('2026-10-25 09:00');
  });

  it('в обычные сутки то же самое', () => {
    const now = local('2026-10-10T10:00:00');
    expect(stamp(latestAtOrBefore(startOfDay(now), 23 * 60 + 50, now))).toBe('2026-10-09 23:50');
  });

  it('до минуты вперёд допускается (часы телефона и поля времени расходятся)', () => {
    const now = local('2026-10-10T10:00:00');
    expect(stamp(latestAtOrBefore(startOfDay(now), 10 * 60 + 1, now))).toBe('2026-10-10 10:01');
    expect(stamp(latestAtOrBefore(startOfDay(now), 10 * 60 + 2, now))).toBe('2026-10-09 10:02');
  });
});

describe('atMinutes и addDays держат местное время', () => {
  it('сутки перевода: «минус сутки» от 00:50 25 октября — вчера в 00:50', () => {
    expect(stamp(addDays(local('2026-10-25T00:50:00'), -1))).toBe('2026-10-24 00:50');
    expect(stamp(atMinutes(addDays(startOfDay(local('2026-10-25T10:00:00')), -1), 23 * 60 + 50))).toBe('2026-10-24 23:50');
  });
});
