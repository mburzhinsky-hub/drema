/** Русские формы слов и форматы чисел. */

export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

/** Форма родительного падежа после «для N»: 1 месяца, 2 месяцев, 21 месяца. */
export function genitive(n: number, one: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  return b === 1 && a !== 11 ? one : many;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

export interface DurOpts {
  /** Минуты всегда двумя цифрами и показываются даже при нуле: «10 ч 02 мин», «10 ч 00 мин». */
  pad?: boolean;
}

/** «1 ч 32 мин», «38 мин», «2 ч». */
export function fmtDur(totalMin: number, opts: DurOpts = {}): string {
  const t = Math.max(0, Math.round(totalMin));
  const h = Math.floor(t / 60);
  const m = t % 60;
  if (opts.pad) {
    if (h === 0) return `${m} мин`;
    return `${h} ч ${pad2(m)} мин`;
  }
  if (h === 0) return `${m} мин`;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
}

/** Таймер «1:12:08». */
export function fmtTimer(totalSec: number): string {
  const t = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return `${h}:${pad2(m)}:${pad2(s)}`;
}

/** Часы с запятой: 2, 2,5, 2,25. */
export function fmtNum(n: number, digits = 2): string {
  const r = Number(n.toFixed(digits));
  return String(r).replace('.', ',');
}

/** Диапазон окна бодрствования: «2–2,5 часа», «30–60 минут», «1 ч 45 мин – 2 ч 15 мин». */
export function fmtRange(loMin: number, hiMin: number): string {
  if (hiMin < 90 && loMin < 90) return `${loMin}–${hiMin} минут`;
  const halfHours = loMin % 30 === 0 && hiMin % 30 === 0;
  if (halfHours) {
    const lo = loMin / 60;
    const hi = hiMin / 60;
    const word = Number.isInteger(hi) ? plural(hi, 'час', 'часа', 'часов') : 'часа';
    return `${fmtNum(lo)}–${fmtNum(hi)} ${word}`;
  }
  return `${fmtDur(loMin)} – ${fmtDur(hiMin)}`;
}

const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const WEEKDAYS_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

/** «9 октября». */
export function fmtDate(t: number): string {
  const d = new Date(t);
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
}

/** «9 октября, пятница». */
export function fmtDateLong(t: number): string {
  const d = new Date(t);
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}, ${WEEKDAYS[d.getDay()]}`;
}

export function weekdayShort(t: number): string {
  return WEEKDAYS_SHORT[new Date(t).getDay()];
}

/** «3 – 9 октября» или «28 сентября – 4 октября». */
export function fmtPeriod(from: number, to: number): string {
  const a = new Date(from);
  const b = new Date(to);
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    return `${a.getDate()} – ${b.getDate()} ${MONTHS_GEN[b.getMonth()]}`;
  }
  return `${fmtDate(from)} – ${fmtDate(to)}`;
}

/** «02.05.2026». */
export function fmtDateNumeric(t: number): string {
  const d = new Date(t);
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}

const ORDINALS = ['первый', 'второй', 'третий', 'четвёртый', 'пятый', 'шестой', 'седьмой'];
export function ordinal(n: number): string {
  return ORDINALS[n - 1] ?? `${n}-й`;
}

/** Длительность словами для озвучивания: «1 час 32 минуты». */
export function fmtDurWords(totalMin: number): string {
  const t = Math.max(0, Math.round(totalMin));
  const h = Math.floor(t / 60);
  const m = t % 60;
  const hs = `${h} ${plural(h, 'час', 'часа', 'часов')}`;
  const ms = `${m} ${plural(m, 'минута', 'минуты', 'минут')}`;
  if (h === 0) return ms;
  if (m === 0) return hs;
  return `${hs} ${ms}`;
}

/** Длительность словами в родительном падеже: «1 часа 20 минут» (для «от … до …»). */
export function fmtDurWordsGen(totalMin: number): string {
  const t = Math.max(0, Math.round(totalMin));
  const h = Math.floor(t / 60);
  const m = t % 60;
  const hs = `${h} ${genitive(h, 'часа', 'часов')}`;
  const ms = `${m} ${genitive(m, 'минуты', 'минут')}`;
  if (h === 0) return ms;
  if (m === 0) return hs;
  return `${hs} ${ms}`;
}
