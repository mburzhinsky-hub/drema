import { describe, expect, it } from 'vitest';
import { clamp, dropOutliers, mad, median, quantile, roundTo, sigmaFromMad } from '../src/engine/stats';

describe('quantile / median', () => {
  it('медиана чётного и нечётного числа значений', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([7])).toBe(7);
  });
  it('квартили по линейной интерполяции', () => {
    expect(quantile([1, 2, 3, 4, 5], 0.25)).toBe(2);
    expect(quantile([1, 2, 3, 4, 5], 0.75)).toBe(4);
    expect(quantile([10, 20], 0.5)).toBe(15);
  });
  it('пустой набор — NaN, а не исключение', () => {
    expect(quantile([], 0.5)).toBeNaN();
    expect(mad([])).toBeNaN();
  });
  it('не меняет исходный массив', () => {
    const a = [3, 1, 2];
    median(a);
    expect(a).toEqual([3, 1, 2]);
  });
});

describe('MAD и выбросы', () => {
  it('MAD не реагирует на один выброс', () => {
    expect(mad([100, 101, 99, 100, 102, 400])).toBeLessThan(3);
  });
  it('sigmaFromMad ≈ стандартное отклонение для нормальных данных', () => {
    expect(sigmaFromMad([1, 2, 3, 4, 5])).toBeCloseTo(1.4826 * 1, 4);
  });
  it('dropOutliers убирает дальше трёх сигм и оставляет остальное', () => {
    const data = [100, 102, 98, 101, 99, 103, 97, 300];
    const out = dropOutliers(data);
    expect(out).not.toContain(300);
    expect(out).toHaveLength(7);
  });
  it('мало значений — ничего не выбрасываем', () => {
    expect(dropOutliers([1, 2, 3, 100])).toEqual([1, 2, 3, 100]);
  });
  it('нулевой разброс — ничего не выбрасываем', () => {
    expect(dropOutliers([5, 5, 5, 5, 5, 5, 5])).toHaveLength(7);
  });
  it('MAD = 0, но есть явный выброс: он всё равно отсекается', () => {
    const out = dropOutliers([100, 100, 100, 100, 100, 100, 100, 100, 300]);
    expect(out).toHaveLength(8);
    expect(out).not.toContain(300);
  });
  it('MAD = 0 не отсекает небольшие отклонения', () => {
    expect(dropOutliers([100, 100, 100, 100, 100, 100, 104, 96])).toHaveLength(8);
  });
});

describe('roundTo / clamp', () => {
  it('округление до шага', () => {
    expect(roundTo(14.1, 5)).toBe(15);
    expect(roundTo(12.4, 5)).toBe(10);
    expect(roundTo(12.5, 5)).toBe(15);
  });
  it('clamp', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
});
