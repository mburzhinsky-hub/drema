/**
 * Возрастные ориентиры. Это не медицинские нормы, а стартовая точка для прогноза:
 * как только накопится история ребёнка, прогноз опирается на неё.
 *
 * Окна бодрствования: общепринятые рекомендации по детскому сну расходятся
 * (источники дают диапазоны от узких до очень широких), поэтому в таблице взяты
 * осторожные средние значения; для 5 месяцев — 2–2,5 часа.
 * Общий сон за сутки: AASM, консенсус 2016 (4–12 мес — 12–16 ч, 1–2 года — 11–14 ч).
 * До 4 месяцев — ориентир 14–17 ч (National Sleep Foundation, 2015).
 */

export interface Norm {
  /** С какого полного месяца действует строка (0 — первый месяц жизни). */
  fromMonths: number;
  /** Окно бодрствования, мин: [мин, макс]. */
  wake: [number, number];
  /** Сколько дневных снов обычно. */
  naps: number;
  /** Типичная длина дневного сна, мин: [мин, макс]. */
  napLen: [number, number];
  /** Общий сон за сутки, мин: [мин, макс]. */
  total: [number, number];
  /** Обычное время отбоя. */
  bedtime: string;
  /** Обычный интервал между кормлениями, мин. */
  feedEvery: number;
}

const H = 60;

export const NORMS: Norm[] = [
  { fromMonths: 0, wake: [30, 60], naps: 5, napLen: [30, 120], total: [14 * H, 17 * H], bedtime: '21:30', feedEvery: 150 },
  { fromMonths: 1, wake: [45, 75], naps: 5, napLen: [30, 120], total: [14 * H, 17 * H], bedtime: '21:30', feedEvery: 150 },
  { fromMonths: 2, wake: [60, 90], naps: 4, napLen: [30, 120], total: [14 * H, 17 * H], bedtime: '21:30', feedEvery: 180 },
  { fromMonths: 3, wake: [90, 120], naps: 4, napLen: [30, 105], total: [14 * H, 17 * H], bedtime: '21:00', feedEvery: 180 },
  { fromMonths: 4, wake: [105, 135], naps: 4, napLen: [30, 90], total: [12 * H, 16 * H], bedtime: '21:00', feedEvery: 180 },
  { fromMonths: 5, wake: [120, 150], naps: 4, napLen: [45, 90], total: [12 * H, 16 * H], bedtime: '20:00', feedEvery: 180 },
  { fromMonths: 6, wake: [135, 165], naps: 3, napLen: [45, 90], total: [12 * H, 16 * H], bedtime: '20:00', feedEvery: 210 },
  { fromMonths: 7, wake: [150, 180], naps: 3, napLen: [45, 90], total: [12 * H, 16 * H], bedtime: '20:00', feedEvery: 210 },
  { fromMonths: 8, wake: [165, 195], naps: 3, napLen: [45, 105], total: [12 * H, 16 * H], bedtime: '20:00', feedEvery: 210 },
  { fromMonths: 9, wake: [165, 210], naps: 2, napLen: [60, 105], total: [12 * H, 16 * H], bedtime: '20:00', feedEvery: 240 },
  { fromMonths: 10, wake: [180, 225], naps: 2, napLen: [60, 120], total: [12 * H, 16 * H], bedtime: '19:45', feedEvery: 240 },
  { fromMonths: 11, wake: [180, 240], naps: 2, napLen: [60, 120], total: [12 * H, 16 * H], bedtime: '19:45', feedEvery: 240 },
  { fromMonths: 12, wake: [180, 240], naps: 2, napLen: [60, 120], total: [11 * H, 14 * H], bedtime: '19:45', feedEvery: 270 },
  { fromMonths: 15, wake: [240, 300], naps: 1, napLen: [60, 150], total: [11 * H, 14 * H], bedtime: '19:45', feedEvery: 270 },
  { fromMonths: 18, wake: [270, 330], naps: 1, napLen: [60, 150], total: [11 * H, 14 * H], bedtime: '19:45', feedEvery: 270 },
  { fromMonths: 24, wake: [300, 360], naps: 1, napLen: [60, 120], total: [11 * H, 14 * H], bedtime: '20:00', feedEvery: 270 },
];

/** Строка таблицы для полного числа месяцев. */
export function normFor(months: number): Norm {
  let found = NORMS[0];
  for (const n of NORMS) {
    if (months >= n.fromMonths) found = n;
  }
  return found;
}

/** Верхняя граница шкалы столбиков «сон за сутки»: верх нормы AASM (16 ч) и запас в полчаса. */
export const SLEEP_CHART_MAX_H = 16.5;

/** Коэффициент окна по месту в дне: первое — короче, последнее перед ночью — длиннее. */
export function windowMultiplier(windowIndex: number, windowsTotal: number): number {
  if (windowsTotal <= 2) return 1;
  if (windowIndex === 1) return 0.85;
  if (windowIndex === windowsTotal) return 1.15;
  return 1;
}
