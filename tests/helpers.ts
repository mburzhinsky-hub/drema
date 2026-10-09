import { Child, DEFAULT_SETTINGS, DremaEvent, FeedEvent, Gender, SleepEvent } from '../src/engine/model';
import { Ctx } from '../src/engine/predict';
import { addDays, atMinutes, parseHM, parseISODate } from '../src/engine/time';

/** Опорные сутки тестов: пятница 9 октября 2026. */
export const DAY0 = parseISODate('2026-10-09');

export const makeChild = (birth = '2026-05-02', gender: Gender = 'f'): Child => ({
  id: 'c1',
  name: 'Мила',
  birth,
  gender,
  createdAt: 0,
});

/** Момент «чч:мм» в сутках со смещением от DAY0 (−1 — вчера). */
export const at = (dayOffset: number, hm: string): number => atMinutes(addDays(DAY0, dayOffset), parseHM(hm));

let n = 0;

export function sleep(dayOffset: number, from: string, to: string | null, endDayOffset: number = dayOffset, extra: Partial<SleepEvent> = {}): SleepEvent {
  n += 1;
  return {
    id: `s${n}`,
    childId: 'c1',
    type: 'sleep',
    t: at(dayOffset, from),
    end: to === null ? null : at(endDayOffset, to),
    updatedAt: 0,
    ...extra,
  };
}

export function feed(dayOffset: number, hm: string, extra: Partial<FeedEvent> = {}): FeedEvent {
  n += 1;
  return { id: `f${n}`, childId: 'c1', type: 'feed', t: at(dayOffset, hm), how: 'bottle', ml: 120, updatedAt: 0, ...extra };
}

export const ctxAt = (events: DremaEvent[], now: number, child: Child = makeChild(), settings = DEFAULT_SETTINGS): Ctx => ({
  child,
  events,
  now,
  settings,
});

/**
 * История «ровных» суток: ночь до wake, четыре дневных сна с заданными промежутками и длинами, отбой вечером.
 * gaps — пять окон бодрствования (до каждого дневного сна и до ночи), durs — четыре дневных сна.
 */
export function steadyDays(
  from: number,
  to: number,
  plan: { wake: string; gaps: number[]; durs: number[] },
): SleepEvent[] {
  const out: SleepEvent[] = [];
  const wake = parseHM(plan.wake);
  let prevBed: number | null = null;
  for (let d = from; d <= to; d++) {
    const day = addDays(DAY0, d);
    const nightStart = prevBed ?? atMinutes(addDays(day, -1), 20 * 60);
    n += 1;
    out.push({ id: `n${n}`, childId: 'c1', type: 'sleep', t: nightStart, end: atMinutes(day, wake), updatedAt: 0 });
    let cursor = wake;
    plan.durs.forEach((dur, k) => {
      const start = cursor + plan.gaps[k];
      n += 1;
      out.push({ id: `d${n}`, childId: 'c1', type: 'sleep', t: atMinutes(day, start), end: atMinutes(day, start + dur), updatedAt: 0 });
      cursor = start + dur;
    });
    prevBed = atMinutes(day, cursor + plan.gaps[plan.durs.length]);
  }
  if (prevBed !== null) {
    n += 1;
    out.push({ id: `b${n}`, childId: 'c1', type: 'sleep', t: prevBed, end: null, updatedAt: 0 });
  }
  return out;
}
