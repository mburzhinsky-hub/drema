/** Статистика за период: неделя и месяц, средние, данные для выписки. */
import { sleepSplitIn } from './day';
import { fmtNum, plural, weekdayShort } from './format';
import {
  DiaperEvent,
  DremaEvent,
  FeedEvent,
  GrowthEvent,
  MedEvent,
  TempEvent,
} from './model';
import { SLEEP_CHART_MAX_H } from './norms';
import { liveEvents, sleepsOf } from './sleep';
import { addDays, startOfDay } from './time';

export interface DayStat {
  dayStart: number;
  /** «Пт». */
  label: string;
  /** День уже закончился. */
  complete: boolean;
  isToday: boolean;
  sleepMin: number;
  nightMin: number;
  napMin: number;
  naps: number;
  feeds: number;
  ml: number;
  diapers: number;
  wet: number;
  dirty: number;
  /** Есть хотя бы одна запись за день. */
  tracked: boolean;
}

export function dayStat(events: DremaEvent[], childId: string, dayStart: number, now: number): DayStat {
  const dayEnd = addDays(dayStart, 1);
  const live = liveEvents(events, childId);
  const sleeps = sleepsOf(events, childId);
  const split = sleepSplitIn(sleeps, dayStart, now);
  let feeds = 0;
  let ml = 0;
  let diapers = 0;
  let wet = 0;
  let dirty = 0;
  let any = split.total > 0;
  for (const e of live) {
    if (e.type === 'sleep') continue;
    if (e.t < dayStart || e.t >= dayEnd || e.t > now) continue;
    any = true;
    if (e.type === 'feed') {
      feeds += 1;
      ml += (e as FeedEvent).ml ?? 0;
    } else if (e.type === 'diaper') {
      diapers += 1;
      const k = (e as DiaperEvent).kind;
      if (k === 'wet' || k === 'mixed') wet += 1;
      if (k === 'dirty' || k === 'mixed') dirty += 1;
    }
  }
  return {
    dayStart,
    label: weekdayShort(dayStart),
    complete: dayEnd <= now,
    isToday: startOfDay(now) === dayStart,
    sleepMin: split.total,
    nightMin: split.night,
    napMin: split.nap,
    naps: split.naps,
    feeds,
    ml,
    diapers,
    wet,
    dirty,
    tracked: any,
  };
}

export interface PeriodStats {
  from: number;
  /** Начало последних суток периода. */
  to: number;
  days: DayStat[];
  /** Дни, по которым считаем средние: закончились и в них что-то записано. */
  basis: DayStat[];
  avgSleepMin: number;
  avgNightMin: number;
  avgNapMin: number;
  avgNaps: number;
  avgFeeds: number;
  avgMl: number;
  avgDiapers: number;
  avgWet: number;
  avgDirty: number;
  minSleepMin: number;
  maxSleepMin: number;
}

const avg = (xs: number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

/** Период из n суток, заканчивающийся днём lastDay (начало суток). */
export function periodStats(events: DremaEvent[], childId: string, lastDay: number, n: number, now: number): PeriodStats {
  const days: DayStat[] = [];
  for (let i = n - 1; i >= 0; i--) {
    days.push(dayStat(events, childId, addDays(lastDay, -i), now));
  }
  let basis = days.filter((d) => d.complete && d.tracked);
  // Первый день использования: завершённых суток ещё нет — берём то, что есть.
  if (basis.length === 0) basis = days.filter((d) => d.tracked);
  const sleeps = basis.map((d) => d.sleepMin);
  return {
    from: days[0].dayStart,
    to: lastDay,
    days,
    basis,
    avgSleepMin: avg(sleeps),
    avgNightMin: avg(basis.map((d) => d.nightMin)),
    avgNapMin: avg(basis.map((d) => d.napMin)),
    avgNaps: avg(basis.map((d) => d.naps)),
    avgFeeds: avg(basis.map((d) => d.feeds)),
    avgMl: avg(basis.map((d) => d.ml)),
    avgDiapers: avg(basis.map((d) => d.diapers)),
    avgWet: avg(basis.map((d) => d.wet)),
    avgDirty: avg(basis.map((d) => d.dirty)),
    minSleepMin: sleeps.length ? Math.min(...sleeps) : 0,
    maxSleepMin: sleeps.length ? Math.max(...sleeps) : 0,
  };
}

/** Высота столбика отчёта, px: шкала 0…16,5 ч на 110 px. */
export const BAR_AREA_PX = 110;
export function barHeight(sleepMin: number): number {
  const h = (sleepMin / 60 / SLEEP_CHART_MAX_H) * BAR_AREA_PX;
  return Math.max(0, Math.min(BAR_AREA_PX, Math.round(h)));
}

/** «12,8» — часы с одним знаком, округление вполовину вверх. */
export function fmtHours(min: number): string {
  return fmtNum(Math.round((min / 60) * 10 + 1e-9) / 10, 1);
}

/** Целое число в сутки: «7», а для дробных средних — с одним знаком («6,5»). */
export function fmtPerDay(x: number): string {
  const r = Math.round(x * 2) / 2;
  return fmtNum(r, 1);
}

export interface ReportExtras {
  temps: TempEvent[];
  meds: MedEvent[];
  growth: GrowthEvent | undefined;
  maxTemp: number | null;
  feverDays: number;
}

export function reportExtras(events: DremaEvent[], childId: string, from: number, toExclusive: number): ReportExtras {
  const live = liveEvents(events, childId).filter((e) => e.t >= from && e.t < toExclusive);
  const temps = live.filter((e): e is TempEvent => e.type === 'temp').sort((a, b) => a.t - b.t);
  const meds = live.filter((e): e is MedEvent => e.type === 'med').sort((a, b) => a.t - b.t);
  const growthAll = liveEvents(events, childId)
    .filter((e): e is GrowthEvent => e.type === 'growth' && e.t < toExclusive)
    .sort((a, b) => a.t - b.t);
  const fever = new Set<number>();
  for (const t of temps) if (t.c >= 37.5) fever.add(startOfDay(t.t));
  return {
    temps,
    meds,
    growth: growthAll[growthAll.length - 1],
    maxTemp: temps.length ? Math.max(...temps.map((t) => t.c)) : null,
    feverDays: fever.size,
  };
}

export function daysWord(n: number): string {
  return plural(n, 'день', 'дня', 'дней');
}
