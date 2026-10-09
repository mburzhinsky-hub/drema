/**
 * Демо-данные: три недели из жизни Милы. Нужны для знакомства с приложением и как «золотой» набор
 * для проверок: расписание в `plan.ts` подобрано так, что движок выдаёт ровно те цифры, что нарисованы в макете.
 */
import { Child, DiaperKind, DremaEvent } from '../engine/model';
import { MIN, addDays, isoDate } from '../engine/time';
import { DayPlan, PLAN } from './plan';

export const DEMO_CHILD_ID = 'demo-mila';
export type { DayPlan };

/** Мила родилась за 160 суток до «пятницы»: на макете ей пять месяцев. */
export const demoChild = (anchorDay: number): Child => ({
  id: DEMO_CHILD_ID,
  name: 'Мила',
  birth: isoDate(addDays(anchorDay, -160)),
  gender: 'f',
  createdAt: addDays(anchorDay, -21),
});

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const at = (day: number, minutes: number): number => day + Math.round(minutes) * MIN;
const jitter = (r: () => number, amp: number): number => Math.round((r() - 0.5) * 2 * amp);

export interface DemoOptions {
  plans?: DayPlan[];
}

/**
 * События для последних `plans.length` суток; последние сутки — это «сегодня» (anchorDay).
 * Всё, что позже «сейчас», отсекает `snapshotAt`.
 */
export function demoEvents(anchorDay: number, opts: DemoOptions = {}): DremaEvent[] {
  const plans = opts.plans ?? PLAN;
  const n = plans.length;
  const out: DremaEvent[] = [];
  const rnd = mulberry32(20261009);
  let seq = 0;
  const id = (p: string): string => `demo-${p}${String(seq++).padStart(4, '0')}`;
  const base = { childId: DEMO_CHILD_ID, updatedAt: anchorDay };

  let prevBed: number | null = null;

  for (let i = 0; i < n; i++) {
    const p = plans[i];
    const isFriday = i === n - 1;
    const day = addDays(anchorDay, i - (n - 1));

    // Ночной сон, который закончился этим утром.
    const nightStart = prevBed ?? at(addDays(day, -1), 1200);
    out.push({ ...base, id: id('s'), type: 'sleep', t: nightStart, end: at(day, p.wake), by: 'Мама' });

    // Дневные сны.
    const starts: number[] = [];
    let cursor = p.wake;
    p.durs.forEach((dur, k) => {
      const start = cursor + p.gaps[k];
      starts.push(start);
      out.push({ ...base, id: id('s'), type: 'sleep', t: at(day, start), end: at(day, start + dur), by: k % 2 ? 'Папа' : 'Мама' });
      cursor = start + dur;
    });
    const napEnd1 = starts[0] + p.durs[0];
    const bed = cursor + p.gaps[4];
    prevBed = at(day, bed);

    // Кормления: ночное под утро, дневные ровно раз в три часа (как в макете) и «сонное» вечером.
    const feeds: Array<[number, 'bottle' | 'breast']> = isFriday
      ? [
          [95, 'bottle'],
          [415, 'breast'],
          [600, 'bottle'],
          [800, 'bottle'],
          [990, 'bottle'],
          [1175, 'bottle'],
          [1350, 'bottle'],
        ]
      : [
          [95 + jitter(rnd, 25), 'bottle'],
          [p.wake + 10 + jitter(rnd, 3), i % 3 === 0 ? 'breast' : 'bottle'],
          [p.wake + 190, 'bottle'],
          [p.wake + 370, 'bottle'],
          [p.wake + 550, 'bottle'],
          [p.wake + 730, 'bottle'],
          [1350 + jitter(rnd, 10), 'bottle'],
        ];
    feeds.forEach(([m, how], k) => {
      const by = k % 3 === 2 ? 'Папа' : 'Мама';
      if (how === 'breast') {
        out.push({ ...base, id: id('f'), type: 'feed', t: at(day, m), how, left: 10, right: 8, by });
      } else {
        const pick = [90, 120, 150, 120, 120][Math.floor(rnd() * 5)];
        const ml = isFriday && m === 800 ? 120 : pick;
        // Ночное кормление в макете записано одним нажатием, без объёма.
        if (isFriday && m === 95) out.push({ ...base, id: id('f'), type: 'feed', t: at(day, m), how, by });
        else out.push({ ...base, id: id('f'), type: 'feed', t: at(day, m), how, ml, by });
      }
    });

    // Подгузники: после пробуждения и перед каждым сном.
    const diaperTimes: number[] = isFriday
      ? [410, 500, 650, 960, 1050, 1185]
      : [p.wake + 5, starts[0] - 10, starts[1] - 10, starts[2] - 10, starts[3] - 10, bed - 15];
    const kinds: DiaperKind[] = ['wet', 'wet', i % 2 ? 'dirty' : 'wet', 'wet', i % 3 === 0 ? 'mixed' : 'wet', 'wet'];
    diaperTimes.forEach((m, k) => {
      out.push({ ...base, id: id('d'), type: 'diaper', t: at(day, m), kind: kinds[k], by: 'Мама' });
    });

    // Прогулка после первого сна и вечернее купание.
    out.push({ ...base, id: id('w'), type: 'walk', t: at(day, napEnd1 + 10), end: at(day, napEnd1 + 55), by: 'Папа' });
    out.push({ ...base, id: id('b'), type: 'bath', t: at(day, bed - 55), by: 'Папа' });
  }

  // Ночной сон последних суток начался вечером и ещё не закончился.
  if (prevBed !== null) out.push({ ...base, id: id('s'), type: 'sleep', t: prevBed, end: null, by: 'Мама' });

  // Несколько записей «о здоровье» для выписки.
  const d = (back: number, minutes: number): number => at(addDays(anchorDay, -back), minutes);
  out.push({ ...base, id: id('g'), type: 'growth', t: d(8, 600), kg: 6.9, cm: 64, by: 'Мама' });
  out.push({ ...base, id: id('t'), type: 'temp', t: d(4, 1230), c: 36.7, by: 'Мама' });
  out.push({ ...base, id: id('m'), type: 'med', t: d(5, 440), name: 'Витамин D', dose: '1 капля', by: 'Мама' });

  return out.sort((a, b) => a.t - b.t);
}

/** События на момент now: будущее отсекается, сны, которые ещё не закончились, становятся идущими. */
export function snapshotAt(events: DremaEvent[], now: number): DremaEvent[] {
  const out: DremaEvent[] = [];
  for (const e of events) {
    if (e.t > now) continue;
    if (e.type === 'sleep' && e.end !== null && e.end > now) out.push({ ...e, end: null });
    else if (e.type === 'walk' && e.end != null && e.end > now) out.push({ ...e, end: null });
    else out.push(e);
  }
  return out;
}
