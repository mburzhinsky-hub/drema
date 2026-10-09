/** Производные данные для экранов: прогноз, состояние дня, возраст. Пересчитываются по минутам. */
import { AgeInfo, ageInfo } from '../engine/age';
import { Child, DremaEvent, Settings, SleepEvent } from '../engine/model';
import { Norm, normFor } from '../engine/norms';
import { Ctx, Forecast, computeForecast } from '../engine/predict';
import { DayState, activeSleep, dayState, sleepsOf } from '../engine/sleep';
import { MIN } from '../engine/time';
import { Words, words } from '../engine/words';
import { AppState } from './state';

export interface Derived {
  child: Child;
  ctx: Ctx;
  events: DremaEvent[];
  sleeps: SleepEvent[];
  active: SleepEvent | undefined;
  ds: DayState;
  forecast: Forecast | null;
  age: AgeInfo;
  norm: Norm;
  w: Words;
  settings: Settings;
}

let memoKey: unknown[] = [];
let memoVal: Derived | null = null;

const same = (a: unknown[], b: unknown[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

export function derive(s: AppState, now: number): Derived | null {
  const child = s.children.find((c) => c.id === s.activeChildId) ?? s.children[0];
  if (!child) return null;
  const minute = Math.floor(now / MIN);
  const key = [s.events, s.settings, child, minute];
  if (memoVal && same(memoKey, key)) return memoVal;

  const events = s.events.some((e) => e.t > now + MIN) ? s.events.filter((e) => e.t <= now + MIN) : s.events;
  const ctx: Ctx = { child, events, now, settings: s.settings };
  const sleeps = sleepsOf(events, child.id);
  const age = ageInfo(child.birth, now);
  const val: Derived = {
    child,
    ctx,
    events,
    sleeps,
    active: activeSleep(sleeps),
    ds: dayState(sleeps, now),
    forecast: computeForecast(ctx),
    age,
    norm: normFor(age.months),
    w: words(child.gender),
    settings: s.settings,
  };
  memoKey = key;
  memoVal = val;
  return val;
}
