/**
 * Сценарии для проверки: тот же набор данных, но «сейчас» — в разные моменты пятницы 9 октября.
 * По ним сравнивается приложение с макетом и сверяются цифры движка.
 */
import { Child, DremaEvent, SleepEvent } from '../engine/model';
import { parseISODate } from '../engine/time';
import { DEMO_CHILD_ID, demoChild, demoEvents, snapshotAt } from './demo';
import type { DayPlan } from './plan';

/** Пятница из макета. */
export const FIXTURE_DAY_ISO = '2026-10-09';

export const fixtureDay = (): number => parseISODate(FIXTURE_DAY_ISO);

/** Момент пятницы: часы, минуты, секунды. */
export const fixtureTime = (h: number, m: number, s = 0): number =>
  fixtureDay() + ((h * 60 + m) * 60 + s) * 1000;

export type ScenarioName = 'home' | 'sleeping' | 'night' | 'day' | 'why' | 'family' | 'report';

export interface Scenario {
  name: ScenarioName;
  now: number;
  child: Child;
  events: DremaEvent[];
  /** Маршрут приложения. */
  route: string;
}

export interface ScenarioOptions {
  plans?: DayPlan[];
}

const CLOCKS: Record<ScenarioName, [number, number, number]> = {
  home: [13, 42, 0],
  why: [13, 42, 0],
  sleeping: [15, 34, 8],
  family: [15, 34, 8],
  day: [15, 34, 30],
  night: [3, 55, 0],
  report: [23, 7, 0],
};

const ROUTES: Record<ScenarioName, string> = {
  home: '/',
  why: '/why',
  sleeping: '/sleeping',
  family: '/family',
  day: '/day',
  night: '/night',
  report: '/report',
};

export function scenario(name: ScenarioName, opts: ScenarioOptions = {}): Scenario {
  const day = fixtureDay();
  const [h, m, s] = CLOCKS[name];
  const now = fixtureTime(h, m, s);
  const master = demoEvents(day, opts);
  let events = snapshotAt(master, now);

  if (name === 'sleeping' || name === 'family') {
    // Дневной сон в 14:22 ещё идёт: в мастер-данных он закончился в 15:34.
    events = events.map((e) =>
      e.type === 'sleep' && e.t === fixtureTime(14, 22) ? ({ ...e, end: null } as SleepEvent) : e,
    );
  }
  if (name === 'night') {
    // Ночью малышка проснулась в 03:50 — в мастер-данных ночной сон тянется до 06:45.
    events = events.map((e) =>
      e.type === 'sleep' && e.end === null && e.t < now ? ({ ...e, end: fixtureTime(3, 50) } as SleepEvent) : e,
    );
  }

  return { name, now, child: demoChild(day), events, route: ROUTES[name] };
}

export { DEMO_CHILD_ID };
