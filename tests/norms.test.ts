import { describe, expect, it } from 'vitest';
import { NORMS, normFor, windowMultiplier } from '../src/engine/norms';

describe('таблица возрастных ориентиров', () => {
  it('внутренне согласована: диапазоны не перевёрнуты, месяцы идут по возрастанию', () => {
    for (let i = 0; i < NORMS.length; i++) {
      const n = NORMS[i];
      expect(n.wake[0]).toBeLessThan(n.wake[1]);
      expect(n.napLen[0]).toBeLessThan(n.napLen[1]);
      expect(n.total[0]).toBeLessThan(n.total[1]);
      expect(n.feedEvery).toBeGreaterThanOrEqual(120);
      if (i > 0) expect(n.fromMonths).toBeGreaterThan(NORMS[i - 1].fromMonths);
    }
  });
  it('окно бодрствования растёт с возрастом, число дневных снов не растёт', () => {
    for (let i = 1; i < NORMS.length; i++) {
      expect(NORMS[i].wake[0]).toBeGreaterThanOrEqual(NORMS[i - 1].wake[0]);
      expect(NORMS[i].wake[1]).toBeGreaterThanOrEqual(NORMS[i - 1].wake[1]);
      expect(NORMS[i].naps).toBeLessThanOrEqual(NORMS[i - 1].naps);
    }
  });
  it('общий сон — по AASM 2016: 4–12 мес 12–16 ч, 1–2 года 11–14 ч', () => {
    expect(normFor(6).total).toEqual([720, 960]);
    expect(normFor(12).total).toEqual([660, 840]);
    expect(normFor(20).total).toEqual([660, 840]);
  });
  it('нужное окно для 5 месяцев — 2–2,5 часа, как в макете', () => {
    expect(normFor(5).wake).toEqual([120, 150]);
    expect(normFor(5).naps).toBe(4);
  });
  it('normFor берёт последнюю строку, не превышающую возраст', () => {
    expect(normFor(0)).toBe(NORMS[0]);
    expect(normFor(13).fromMonths).toBe(12);
    expect(normFor(16).fromMonths).toBe(15);
    expect(normFor(500)).toBe(NORMS[NORMS.length - 1]);
  });
  it('отбой — корректное время', () => {
    for (const n of NORMS) expect(n.bedtime).toMatch(/^(19|20|21):\d{2}$/);
  });
});

describe('коэффициент окна по месту в дне', () => {
  it('первое окно короче, последнее длиннее, остальные без поправки', () => {
    expect(windowMultiplier(1, 5)).toBe(0.85);
    expect(windowMultiplier(3, 5)).toBe(1);
    expect(windowMultiplier(5, 5)).toBe(1.15);
  });
  it('при двух окнах поправок нет', () => {
    expect(windowMultiplier(1, 2)).toBe(1);
    expect(windowMultiplier(2, 2)).toBe(1);
  });
});
