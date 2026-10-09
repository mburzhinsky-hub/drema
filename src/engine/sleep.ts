import {
  DremaEvent,
  SleepEvent,
  SleepKind,
  isSleep,
} from './model';
import { MIN, minutesOfDay } from './time';

/** Ночной сон — всё, что началось с 18:30 до 06:00, если вид не указан вручную. */
export function classifyStart(t: number): SleepKind {
  const m = minutesOfDay(t);
  return m >= 18 * 60 + 30 || m < 6 * 60 ? 'night' : 'nap';
}

export const sleepKind = (s: SleepEvent): SleepKind => s.kind ?? classifyStart(s.t);

export function liveEvents(events: DremaEvent[], childId?: string): DremaEvent[] {
  return events.filter((e) => !e.deleted && (childId === undefined || e.childId === childId));
}

export function sleepsOf(events: DremaEvent[], childId?: string): SleepEvent[] {
  return liveEvents(events, childId)
    .filter(isSleep)
    .sort((a, b) => a.t - b.t);
}

export const activeSleep = (sleeps: SleepEvent[]): SleepEvent | undefined =>
  [...sleeps].reverse().find((s) => s.end === null);

export interface Seg {
  id: string;
  start: number;
  end: number;
  kind: SleepKind;
  ongoing: boolean;
}

/**
 * Куски сна внутри [from, to]: обрезаны по границам, идущий сон заканчивается «сейчас»,
 * пересекающиеся записи склеены, чтобы одно и то же время не считалось дважды.
 */
export function clipSleeps(sleeps: SleepEvent[], from: number, to: number, now: number): Seg[] {
  const segs: Seg[] = [];
  for (const s of sleeps) {
    const rawEnd = s.end ?? now;
    const start = Math.max(s.t, from);
    const end = Math.min(rawEnd, to);
    if (end > start) {
      segs.push({ id: s.id, start, end, kind: sleepKind(s), ongoing: s.end === null && rawEnd <= to });
    }
  }
  segs.sort((a, b) => a.start - b.start);
  const out: Seg[] = [];
  for (const seg of segs) {
    const last = out[out.length - 1];
    if (last && seg.start <= last.end) {
      if (seg.end > last.end) {
        last.end = seg.end;
        last.ongoing = seg.ongoing;
      }
    } else {
      out.push({ ...seg });
    }
  }
  return out;
}

export const segMinutes = (segs: Seg[]): number =>
  segs.reduce((s, x) => s + (x.end - x.start) / MIN, 0);

export const durationMin = (s: SleepEvent, now: number): number =>
  Math.max(0, ((s.end ?? now) - s.t) / MIN);

/** Утреннее пробуждение: ночной сон закончился между 04:30 и 12:00. */
export function isMorningWake(s: SleepEvent): boolean {
  if (s.end === null || sleepKind(s) !== 'night') return false;
  const m = minutesOfDay(s.end);
  return m >= 270 && m < 720;
}

/** Где мы в сутках после последнего завершённого сна. */
export type WakeKind = 'morning' | 'nap' | 'night-waking' | 'none';

export interface DayState {
  last: SleepEvent | undefined;
  wakeKind: WakeKind;
  /** Сколько дневных снов уже было с утреннего пробуждения. */
  napsDone: number;
}

const GAP_NEW_DAY = 10 * 60 * MIN;

export function dayState(sleeps: SleepEvent[], now: number): DayState {
  let napsDone = 0;
  let prev: SleepEvent | undefined;
  for (const s of sleeps) {
    if (s.end === null || s.end > now) continue;
    if (prev && prev.end !== null && s.t - prev.end > GAP_NEW_DAY) napsDone = 0;
    if (prev && isMorningWake(prev)) napsDone = 0;
    if (sleepKind(s) === 'nap') napsDone += 1;
    prev = s;
  }
  if (!prev) return { last: undefined, wakeKind: 'none', napsDone: 0 };
  if (isMorningWake(prev)) napsDone = 0;
  const wakeKind: WakeKind =
    sleepKind(prev) === 'nap' ? 'nap' : isMorningWake(prev) ? 'morning' : 'night-waking';
  return { last: prev, wakeKind, napsDone };
}

/** Один замер: сколько прошло от пробуждения до следующего засыпания. */
export interface WindowSample {
  /** Номер окна в дне: 1 — от утреннего пробуждения до первого сна. */
  windowIndex: number;
  mode: 'nap' | 'bedtime';
  gapMin: number;
  wakeAt: number;
  startAt: number;
  /** Сон, которым закончилось окно. */
  nextId: string;
}

/** Все пары «пробуждение → следующее засыпание» за прошлое. */
export function windowSamples(sleeps: SleepEvent[], now: number): WindowSample[] {
  const out: WindowSample[] = [];
  let napsSinceMorning = 0;
  let prev: SleepEvent | undefined;
  for (const s of sleeps) {
    if (s.t > now) break;
    if (prev && prev.end !== null) {
      const gap = (s.t - prev.end) / MIN;
      if (s.t - prev.end > GAP_NEW_DAY) napsSinceMorning = 0;
      if (isMorningWake(prev)) napsSinceMorning = 0;
      const prevKind = sleepKind(prev);
      const dayWake = prevKind === 'nap' || isMorningWake(prev);
      if (dayWake && gap >= 10 && gap <= 480) {
        out.push({
          windowIndex: napsSinceMorning + 1,
          mode: sleepKind(s) === 'night' ? 'bedtime' : 'nap',
          gapMin: gap,
          wakeAt: prev.end,
          startAt: s.t,
          nextId: s.id,
        });
      }
    }
    if (sleepKind(s) === 'nap') napsSinceMorning += 1;
    prev = s;
  }
  return out;
}
