/** Работа со временем. Все границы суток — по местному часовому поясу. */

export const MIN = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Часы пользователя можно подменить (тесты, визуальные эталоны, демо). */
export interface ClockOverride {
  /** Базовое время в мс. */
  base: number;
  /** Замороженные часы не идут. */
  frozen: boolean;
}

let override: ClockOverride | null = null;
let startedAt = 0;

export function setClock(o: ClockOverride | null): void {
  override = o;
  startedAt = typeof performance !== 'undefined' ? performance.now() : 0;
}

export function now(): number {
  if (!override) return Date.now();
  if (override.frozen) return override.base;
  return override.base + (performance.now() - startedAt);
}

export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Сдвиг на n суток с сохранением местного времени (корректно при переводе часов). */
export function addDays(t: number, n: number): number {
  const d = new Date(t);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

export function minutesOfDay(t: number): number {
  const d = new Date(t);
  return d.getHours() * 60 + d.getMinutes();
}

/** Время суток в минутах с долей секунд. */
export function minutesOfDayExact(t: number): number {
  const d = new Date(t);
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60 + d.getMilliseconds() / 60000;
}

/** Момент «чч:мм» в сутках, которые начинаются в dayStart. */
export function atMinutes(dayStart: number, minutes: number): number {
  const d = new Date(dayStart);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(Math.round(minutes));
  return d.getTime();
}

export function hm(t: number): string {
  const d = new Date(t);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function parseHM(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return NaN;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return NaN;
  return h * 60 + mi;
}

/** Округление до шага в минутах по местному времени. */
export function roundLocal(t: number, stepMin: number): number {
  const day = startOfDay(t);
  const minutes = (t - day) / MIN;
  return atMinutes(day, Math.round(minutes / stepMin) * stepMin);
}

export function isSameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b);
}

/** YYYY-MM-DD в местном времени. */
export function isoDate(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseISODate(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return NaN;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
}

/** Значение для input[type=datetime-local] / time. */
export function toTimeInput(t: number): string {
  return hm(t);
}

/**
 * «чч:мм» в сутках, начинающихся в dayStart, но не позже nowT (с запасом в минуту): если выходит позже — то же время вчера.
 * «Вчера» считается по календарю (addDays), а не вычитанием 24 часов: в сутки перевода часов они длятся 23 или 25 часов.
 */
export function latestAtOrBefore(dayStart: number, minutes: number, nowT: number): number {
  const t = atMinutes(dayStart, minutes);
  return t > nowT + MIN ? atMinutes(addDays(dayStart, -1), minutes) : t;
}

/** Подставляет «чч:мм» в сутки опорного момента. Если получилось позже now — берёт вчера. */
export function resolveTimeToday(hmStr: string, ref: number, nowT: number): number {
  const mins = parseHM(hmStr);
  if (Number.isNaN(mins)) return ref;
  let t = atMinutes(startOfDay(ref), mins);
  if (t > nowT + MIN) t = atMinutes(addDays(startOfDay(ref), -1), mins);
  return t;
}
