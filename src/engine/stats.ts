/** Устойчивая статистика: медиана, квантили, MAD. Выбросы не сдвигают оценку так, как среднее. */

export const sum = (a: number[]): number => a.reduce((s, x) => s + x, 0);

export function sorted(a: number[]): number[] {
  return [...a].sort((x, y) => x - y);
}

/** Квантиль по линейной интерполяции, q от 0 до 1. */
export function quantile(a: number[], q: number): number {
  if (a.length === 0) return NaN;
  const s = sorted(a);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export const median = (a: number[]): number => quantile(a, 0.5);

/** Медиана абсолютных отклонений. */
export function mad(a: number[]): number {
  if (a.length === 0) return NaN;
  const m = median(a);
  return median(a.map((x) => Math.abs(x - m)));
}

/** Оценка стандартного отклонения по MAD (для нормального распределения). */
export const sigmaFromMad = (a: number[]): number => 1.4826 * mad(a);

export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

export function roundTo(x: number, step: number): number {
  return Math.round(x / step) * step;
}

/**
 * Отбрасывает значения дальше трёх сигм от медианы (нужно хотя бы 6 значений).
 * Если больше половины значений совпали с медианой, MAD равен нулю и «три сигмы» ничего не отсекут —
 * тогда берём минимальный разброс: 5 % медианы, но не меньше единицы.
 */
export function dropOutliers(a: number[]): number[] {
  if (a.length < 6) return a;
  const m = median(a);
  const s = Math.max(sigmaFromMad(a), mad(a) === 0 ? Math.max(1, 0.05 * Math.abs(m)) : 0);
  return a.filter((x) => Math.abs(x - m) <= 3 * s);
}
