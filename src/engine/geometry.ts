/** Геометрия колец и лент, как в макете. Чистые функции: их проверяют тесты. */
import { clamp } from './stats';

const TAU = Math.PI * 2;

/** Кольцо бодрствования на главном экране: окружность радиуса 108 в рамке 260×260. */
export const HOME_R = 108;
export const HOME_C = TAU * HOME_R;

export interface HomeRing {
  /** Заливка «прошло времени». */
  elapsed: number;
  /** Длина и сдвиг жёлтой дуги окна сна. */
  windowLen: number;
  windowOff: number;
  knobX: number;
  knobY: number;
}

const n1 = (x: number): number => Math.round(x * 10) / 10;

export function homeRing(awakeMin: number, windowStartMin: number, windowEndMin: number, scaleMin: number): HomeRing {
  const frac = clamp(awakeMin / scaleMin, 0, 1);
  const start = clamp(windowStartMin / scaleMin, 0, 1);
  const end = clamp(windowEndMin / scaleMin, 0, 1);
  const angle = frac * TAU;
  return {
    elapsed: n1(frac * HOME_C),
    windowLen: n1((end - start) * HOME_C),
    windowOff: n1(start * HOME_C),
    knobX: n1(130 + HOME_R * Math.sin(angle)),
    knobY: n1(130 - HOME_R * Math.cos(angle)),
  };
}

/** Кольцо сна: внутреннее — прошедшее время (r=128), внешняя дуга — обычная длительность (r=142). */
export const SLEEP_R = 128;
export const SLEEP_C = TAU * SLEEP_R;
export const SLEEP_OUTER_R = 142;
export const SLEEP_OUTER_C = TAU * SLEEP_OUTER_R;

export interface SleepRing {
  elapsed: number;
  rangeLen: number;
  rangeOff: number;
  knobX: number;
  knobY: number;
}

export function sleepRing(elapsedMin: number, range: [number, number] | null, scaleMin: number): SleepRing {
  const frac = clamp(elapsedMin / scaleMin, 0, 1);
  const angle = frac * TAU;
  const lo = range ? clamp(range[0] / scaleMin, 0, 1) : 0;
  const hi = range ? clamp(range[1] / scaleMin, 0, 1) : 0;
  return {
    elapsed: n1(frac * SLEEP_C),
    rangeLen: n1((hi - lo) * SLEEP_OUTER_C),
    rangeOff: n1(lo * SLEEP_OUTER_C),
    knobX: Math.round(150 + SLEEP_R * Math.sin(angle)),
    knobY: Math.round(150 - SLEEP_R * Math.cos(angle)),
  };
}

/** Малое кольцо «с последнего кормления» на ночном экране: r=32. */
export const FEED_R = 32;
export const FEED_C = TAU * FEED_R;
export const feedRingDash = (sinceMin: number, typicalMin: number): number => n1(clamp(sinceMin / typicalMin, 0, 1) * FEED_C);

/** Шкала прогресса в карточке «так увидит бабушка»: доля от обычной длительности, не больше 100 %. */
export const progressPct = (valueMin: number, refMin: number): number => Math.round(clamp(valueMin / refMin, 0, 1) * 100);
