import { describe, expect, it } from 'vitest';
import { ageInfo, wholeMonths } from '../src/engine/age';
import { parseISODate } from '../src/engine/time';

const d = (s: string): number => parseISODate(s);

describe('wholeMonths', () => {
  it('считает полные календарные месяцы', () => {
    expect(wholeMonths(d('2026-05-12'), d('2026-10-09'))).toBe(4);
    expect(wholeMonths(d('2026-05-12'), d('2026-10-12'))).toBe(5);
    expect(wholeMonths(d('2026-05-02'), d('2026-10-09'))).toBe(5);
  });
  it('конец месяца: 31 января → 28 февраля ещё не месяц', () => {
    expect(wholeMonths(d('2026-01-31'), d('2026-02-28'))).toBe(0);
    expect(wholeMonths(d('2026-01-31'), d('2026-03-31'))).toBe(2);
  });
  it('будущая дата рождения даёт 0, а не минус', () => {
    expect(wholeMonths(d('2027-01-01'), d('2026-10-09'))).toBe(0);
  });
});

describe('ageInfo', () => {
  const at = d('2026-10-09');
  it('первые две недели — дни', () => {
    expect(ageInfo('2026-10-08', at).label).toBe('1 день');
    expect(ageInfo('2026-10-05', at).label).toBe('4 дня');
    expect(ageInfo('2026-09-28', at).label).toBe('11 дней');
  });
  it('до месяца — недели', () => {
    expect(ageInfo('2026-09-25', at).label).toBe('2 недели');
    expect(ageInfo('2026-09-15', at).label).toBe('3 недели');
    expect(ageInfo('2026-09-15', at).labelFor).toBe('3 недель');
  });
  it('месяцы с правильным склонением', () => {
    expect(ageInfo('2026-09-09', at).label).toBe('1 месяц');
    expect(ageInfo('2026-07-09', at).label).toBe('3 месяца');
    expect(ageInfo('2026-05-02', at).label).toBe('5 месяцев');
    expect(ageInfo('2026-05-02', at).labelFor).toBe('5 месяцев');
    expect(ageInfo('2025-11-09', at).labelFor).toBe('11 месяцев');
    expect(ageInfo('2025-10-09', at).label).toBe('12 месяцев');
  });
  it('после двух лет — годы и месяцы', () => {
    expect(ageInfo('2024-10-09', at).label).toBe('2 года');
    expect(ageInfo('2024-08-09', at).label).toBe('2 года 2 мес.');
    expect(ageInfo('2021-10-09', at).label).toBe('5 лет');
  });
});
