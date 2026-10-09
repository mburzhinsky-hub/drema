import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/engine/model';
import {
  backtest, bedtimeTarget, computeForecast, computeOutlook, forecastFor, inNightWindow, live,
} from '../src/engine/predict';
import { NORMS, normFor } from '../src/engine/norms';
import { activeSleep, sleepsOf } from '../src/engine/sleep';
import { hm } from '../src/engine/time';
import { at, ctxAt, makeChild, sleep, steadyDays } from './helpers';

describe('когда прогнозировать не от чего', () => {
  it('нет записей', () => {
    expect(computeForecast(ctxAt([], at(0, '12:00')))).toBeNull();
  });
  it('малыш спит сейчас', () => {
    const ev = [sleep(0, '14:00', null)];
    expect(computeForecast(ctxAt(ev, at(0, '14:30')))).toBeNull();
  });
  it('ночное пробуждение: утра ещё не было', () => {
    const ev = [sleep(-1, '20:00', '03:50', 0)];
    expect(computeForecast(ctxAt(ev, at(0, '03:55')))).toBeNull();
  });
});

describe('без истории прогноз идёт по возрасту', () => {
  // 5 месяцев: окно 2–2,5 ч, первое окно короче (×0,85), середина 135 мин.
  const ev = [sleep(-1, '20:00', '06:45', 0)];
  const f = computeForecast(ctxAt(ev, at(0, '07:30')))!;
  it('первое окно утра: 135 × 0,85 ≈ 115 мин → 08:40', () => {
    expect(f.mode).toBe('nap');
    expect(f.napNumber).toBe(1);
    expect(f.basis.multiplier).toBe(0.85);
    expect(f.basis.priorMin).toBeCloseTo(114.75, 2);
    expect(f.basis.personal).toBeNull();
    expect(f.basis.weight).toBe(0);
    expect(hm(f.predictedAt)).toBe('08:40');
  });
  it('окно ±15 минут вокруг прогноза', () => {
    expect(f.halfWidthMin).toBe(15);
    expect(hm(f.windowStart)).toBe('08:25');
    expect(hm(f.windowEnd)).toBe('08:55');
  });
  it('прогноз округлён до 5 минут', () => {
    expect(new Date(f.predictedAt).getMinutes() % 5).toBe(0);
  });
  it('шкала кольца не меньше верхнего края окна по возрасту', () => {
    expect(f.ringScaleMin).toBeGreaterThanOrEqual(150);
    expect(f.ringScaleMin % 5).toBe(0);
  });
});

describe('с историей прогноз подстраивается под ребёнка', () => {
  // Окно до первого сна стабильно 100 мин (вместо возрастных 115).
  const plan = { wake: '06:45', gaps: [100, 120, 120, 120, 120], durs: [60, 60, 60, 60] };
  const history = steadyDays(-14, -1, plan);
  const wake = at(0, '06:45');
  const ev = [...history.slice(0, -1), history[history.length - 1]];
  // последнее ночное — до сегодняшнего утра: закроем его в 06:45
  const closed = ev.map((s) => (s.end === null ? { ...s, end: wake } : s));
  const f = computeForecast(ctxAt(closed, at(0, '07:00')))!;

  it('использует свои замеры для этого окна', () => {
    expect(f.basis.personal).not.toBeNull();
    expect(f.basis.personal!.pooled).toBe(false);
    expect(f.basis.personal!.medianMin).toBe(100);
    expect(f.basis.personal!.n).toBeGreaterThanOrEqual(12);
  });
  it('вес истории растёт с числом замеров, но не выше 0,85', () => {
    const n = f.basis.personal!.n;
    expect(f.basis.weight).toBeCloseTo(Math.min(0.85, n / (n + 4)), 6);
    expect(f.basis.weight).toBeLessThanOrEqual(0.85);
  });
  it('итог — смесь возраста и истории', () => {
    const w = f.basis.weight;
    expect(f.basis.blendedMin).toBeCloseTo((1 - w) * f.basis.priorMin + w * 100, 6);
    expect(f.basis.blendedMin).toBeLessThan(f.basis.priorMin);
    expect(f.basis.blendedMin).toBeGreaterThan(100);
  });
  it('при идеально ровном ритме окно сужается до минимума', () => {
    expect(f.halfWidthMin).toBeLessThan(15);
    expect(f.halfWidthMin).toBeGreaterThanOrEqual(10);
  });
  it('квартили времени засыпания считаются по истории', () => {
    expect(f.basis.personal!.startQuartiles).toEqual([505, 505]); // 06:45 + 100 мин = 08:25 каждый день
  });
});

describe('выбросы не сдвигают прогноз', () => {
  it('один день с окном 220 мин вместо 100 не учитывается', () => {
    const plan = { wake: '06:45', gaps: [100, 120, 120, 120, 120], durs: [60, 60, 60, 60] };
    const days = steadyDays(-9, -1, plan);
    const wake = at(0, '06:45');
    const base = days.map((s) => (s.end === null ? { ...s, end: wake } : s));
    // в один из дней малыш проснулся в 04:45 — первое окно получилось 220 минут вместо 100
    const bent = base.map((s) => (s.end === at(-5, '06:45') ? { ...s, end: at(-5, '04:45') } : s));
    const f = computeForecast(ctxAt(bent, at(0, '07:00')))!;
    expect(f.basis.personal!.medianMin).toBe(100);
    expect(f.basis.personal!.n).toBe(8);
  });
});

describe('поправка на длину прошлого сна', () => {
  const morning = sleep(-1, '20:00', '06:45', 0);
  const napEnds = (len: number) => {
    const nap = sleep(0, '08:30', null, 0);
    nap.end = nap.t + len * 60000;
    return nap;
  };
  const forecastAfter = (len: number) => {
    const nap = napEnds(len);
    return computeForecast(ctxAt([morning, nap], nap.end! + 60000))!;
  };
  it('короткий сон приближает следующий, долгий — чуть отодвигает, и не больше пределов', () => {
    const short = forecastAfter(20);
    const normal = forecastAfter(68);
    const long = forecastAfter(150);
    expect(short.basis.adj).toBeLessThan(0);
    expect(short.basis.adj).toBeGreaterThanOrEqual(-0.15);
    expect(Math.abs(normal.basis.adj)).toBeLessThan(0.01);
    expect(long.basis.adj).toBeLessThanOrEqual(0.05);
    expect(short.windowMin).toBeLessThan(normal.windowMin);
    expect(long.windowMin).toBeGreaterThanOrEqual(normal.windowMin);
  });
  it('эталон для сравнения — середина нормы, пока дневных снов мало', () => {
    const f = forecastAfter(20);
    expect(f.basis.lastSleepRefMin).toBe((45 + 90) / 2);
    expect(f.basis.adj).toBeCloseTo(((20 - 67.5) / 67.5) * 0.15, 6);
  });
  it('после утреннего пробуждения поправки нет', () => {
    const f = computeForecast(ctxAt([morning], at(0, '07:30')))!;
    expect(f.basis.adj).toBe(0);
    expect(f.basis.lastSleepMin).toBeNull();
  });
});

describe('вечер: прогноз ночного сна', () => {
  const plan = { wake: '06:45', gaps: [105, 125, 130, 130, 120], durs: [60, 60, 60, 30] };
  const days = steadyDays(-8, -1, plan);
  const todayWake = at(0, '06:45');
  const hist = days.map((s) => (s.end === null ? { ...s, end: todayWake } : s));
  // сегодня четыре сна уже были
  const todays = [
    sleep(0, '08:30', '09:30'),
    sleep(0, '11:35', '12:35'),
    sleep(0, '14:45', '15:45'),
    sleep(0, '17:55', '18:25'),
  ];
  const f = computeForecast(ctxAt([...hist, ...todays], at(0, '18:30')))!;
  it('после последнего дневного сна — режим «отбой»', () => {
    expect(f.mode).toBe('bedtime');
    expect(f.basis.mode).toBe('bedtime');
  });
  it('отбой остаётся в разумных пределах вокруг привычного времени', () => {
    const target = bedtimeTarget(sleepsOf(hist, 'c1'), normFor(5), DEFAULT_SETTINGS, at(0, '18:30'));
    const t = at(0, '00:00') + target * 60000;
    expect(f.predictedAt).toBeGreaterThanOrEqual(t - 60 * 60000);
    expect(f.predictedAt).toBeLessThanOrEqual(t + 45 * 60000);
  });
  it('желаемое время отбоя из настроек имеет приоритет над историей', () => {
    const target = bedtimeTarget(sleepsOf(hist, 'c1'), normFor(5), { ...DEFAULT_SETTINGS, bedtime: '19:30' }, at(0, '18:30'));
    expect(target).toBe(19 * 60 + 30);
  });
  it('без истории отбой берётся из возрастной нормы', () => {
    expect(bedtimeTarget([], normFor(5), DEFAULT_SETTINGS, at(0, '18:30'))).toBe(20 * 60);
  });
});

describe('живое состояние прогноза', () => {
  const f = computeForecast(ctxAt([sleep(-1, '20:00', '06:45', 0)], at(0, '07:30')))!;
  it('до окна, в окне, после окна', () => {
    expect(live(f, f.windowStart - 60000).status).toBe('before');
    expect(live(f, f.windowStart).status).toBe('in');
    expect(live(f, f.windowEnd).status).toBe('in');
    expect(live(f, f.windowEnd + 60000).status).toBe('overdue');
  });
  it('минуты до прогноза — отрицательные, когда он прошёл', () => {
    expect(live(f, f.predictedAt - 10 * 60000).minutesTo).toBeCloseTo(10, 6);
    expect(live(f, f.predictedAt + 10 * 60000).minutesTo).toBeCloseTo(-10, 6);
  });
  it('время бодрствования не бывает отрицательным', () => {
    expect(live(f, f.wakeAt - 5 * 60000).awakeMin).toBe(0);
  });
});

describe('ночное окно', () => {
  it('пересекает полночь', () => {
    expect(inNightWindow(at(0, '23:30'), DEFAULT_SETTINGS)).toBe(true);
    expect(inNightWindow(at(0, '03:00'), DEFAULT_SETTINGS)).toBe(true);
    expect(inNightWindow(at(0, '05:59'), DEFAULT_SETTINGS)).toBe(true);
    expect(inNightWindow(at(0, '06:00'), DEFAULT_SETTINGS)).toBe(false);
    expect(inNightWindow(at(0, '20:59'), DEFAULT_SETTINGS)).toBe(false);
    expect(inNightWindow(at(0, '21:00'), DEFAULT_SETTINGS)).toBe(true);
  });
  it('окно в пределах суток и пустые значения', () => {
    const s = { ...DEFAULT_SETTINGS, nightFrom: '01:00', nightTo: '05:00' };
    expect(inNightWindow(at(0, '03:00'), s)).toBe(true);
    expect(inNightWindow(at(0, '23:00'), s)).toBe(false);
    expect(inNightWindow(at(0, '03:00'), { ...DEFAULT_SETTINGS, nightFrom: '', nightTo: '' })).toBe(false);
  });
});

describe('что ждать от идущего сна', () => {
  it('дневной сон с историей: квартили длин дневных снов', () => {
    const plan = { wake: '06:45', gaps: [105, 125, 130, 130, 120], durs: [60, 70, 80, 70] };
    const days = steadyDays(-8, -1, plan).map((s) => (s.end === null ? { ...s, end: at(0, '06:45') } : s));
    const nap = sleep(0, '11:30', null);
    const ev = [...days, nap];
    const ctx = ctxAt(ev, at(0, '12:00'));
    const o = computeOutlook(ctx, nap);
    expect(o.kind).toBe('nap');
    expect(o.range![0]).toBeGreaterThanOrEqual(60);
    expect(o.range![1]).toBeLessThanOrEqual(80);
    expect(o.ringScaleMin).toBeGreaterThanOrEqual(60);
  });
  it('мало данных: диапазон из нормы по возрасту', () => {
    const nap = sleep(0, '11:30', null);
    const o = computeOutlook(ctxAt([nap], at(0, '12:00')), nap);
    expect(o.range).toEqual(normFor(5).napLen);
  });
  it('ночь: диапазона нет, суммируются куски ночи с короткими перерывами', () => {
    const a = sleep(-1, '20:00', '01:30', 0);
    const b = sleep(0, '02:10', null);
    const o = computeOutlook(ctxAt([a, b], at(0, '04:10')), b);
    expect(o.kind).toBe('night');
    expect(o.range).toBeNull();
    expect(o.nightTotalMin).toBe(5 * 60 + 30 + 120);
  });
  it('ночные куски, разделённые днём, не склеиваются', () => {
    const a = sleep(-2, '20:00', '06:30', -1);
    const b = sleep(-1, '21:00', null);
    const o = computeOutlook(ctxAt([a, b], at(0, '03:00')), b);
    expect(o.nightTotalMin).toBe(6 * 60);
  });
});

describe('проверка прогноза на прошлом', () => {
  const plan = { wake: '06:45', gaps: [105, 125, 130, 130, 120], durs: [60, 70, 80, 70] };
  const days = steadyDays(-10, -1, plan).map((s) => (s.end === null ? { ...s, end: at(0, '06:45') } : s));
  const ctx = ctxAt(days, at(0, '07:00'));
  const bt = backtest(ctx);
  it('не больше 10 пар, попаданий не больше пар', () => {
    expect(bt.total).toBeLessThanOrEqual(10);
    expect(bt.total).toBeGreaterThan(0);
    expect(bt.hits).toBeLessThanOrEqual(bt.total);
  });
  it('на ровном ритме попадает почти всегда', () => {
    expect(bt.hits / bt.total).toBeGreaterThanOrEqual(0.7);
  });
  it('прогноз для каждой пары считается только по тому, что было известно тогда', () => {
    for (const r of bt.rows) {
      expect(r.predictedAt).toBeGreaterThan(r.wakeAt);
      expect(r.windowStart).toBeLessThan(r.windowEnd);
    }
  });
  it('forecastFor находит прогноз к конкретному сну', () => {
    const sleeps = sleepsOf(days, 'c1');
    const nap = sleeps.find((s) => s.t === at(-1, '08:30'))!;
    const r = forecastFor(ctx, nap)!;
    expect(r).not.toBeNull();
    expect(r.nextId).toBe(nap.id);
    expect(typeof r.hit).toBe('boolean');
  });
  it('активный сон не мешает', () => {
    expect(activeSleep(sleepsOf(days, 'c1'))).toBeUndefined();
  });
});

describe('прогноз при любом возрасте', () => {
  it.each([0, 1, 2, 3, 4, 6, 8, 10, 12, 15, 18, 24, 30])('возраст %i мес: окно в пределах разумного', (months) => {
    const birth = new Date(at(0, '00:00'));
    birth.setMonth(birth.getMonth() - months);
    const iso = `${birth.getFullYear()}-${String(birth.getMonth() + 1).padStart(2, '0')}-${String(birth.getDate()).padStart(2, '0')}`;
    const f = computeForecast(ctxAt([sleep(-1, '20:00', '06:45', 0)], at(0, '07:30'), makeChild(iso)))!;
    const norm = NORMS.filter((n) => months >= n.fromMonths).at(-1)!;
    expect(f).not.toBeNull();
    expect(f.windowMin).toBeGreaterThanOrEqual(norm.wake[0] * 0.85 * 0.75 - 5);
    expect(f.windowMin).toBeLessThanOrEqual(norm.wake[1] * 1.25 + 5);
    expect(f.windowEnd - f.windowStart).toBeLessThanOrEqual(50 * 60000);
  });
});
