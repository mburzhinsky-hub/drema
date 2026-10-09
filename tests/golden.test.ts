/**
 * «Золотые» проверки: на демо-данных движок обязан выдавать ровно те числа, что нарисованы в макете V3.
 * Если правка формул сдвинула хоть одно из них, экран перестанет совпадать с дизайном — тест скажет об этом первым.
 */
import { describe, expect, it } from 'vitest';
import { buildRibbon, expectedNapLength, sleepSplitIn, timelineRows } from '../src/engine/day';
import { fmtDur } from '../src/engine/format';
import { feedsOf, lastFeed, typicalFeedInterval } from '../src/engine/feed';
import { feedRingDash, homeRing, progressPct, sleepRing } from '../src/engine/geometry';
import { backtest, computeForecast, computeOutlook, live } from '../src/engine/predict';
import { explain } from '../src/engine/explain';
import { activeSleep, sleepsOf } from '../src/engine/sleep';
import { hm, startOfDay } from '../src/engine/time';
import { barHeight, fmtHours, periodStats } from '../src/engine/week';
import { normFor } from '../src/engine/norms';
import { ageInfo } from '../src/engine/age';
import { DEFAULT_SETTINGS } from '../src/engine/model';
import { fixtureDay, scenario } from '../src/demo/scenarios';

const ctxOf = (name: Parameters<typeof scenario>[0]) => {
  const sc = scenario(name);
  return { sc, ctx: { child: sc.child, events: sc.events, now: sc.now, settings: DEFAULT_SETTINGS } };
};

describe('макет «Сегодня» (13:42)', () => {
  const { sc, ctx } = ctxOf('home');
  const f = computeForecast(ctx)!;
  it('прогноз 14:20, окно 14:05–14:35 (±15)', () => {
    expect(hm(f.predictedAt)).toBe('14:20');
    expect(hm(f.windowStart)).toBe('14:05');
    expect(hm(f.windowEnd)).toBe('14:35');
    expect(f.halfWidthMin).toBe(15);
    expect(f.mode).toBe('nap');
  });
  it('бодрствует 1 ч 32 мин, до прогноза 38 мин', () => {
    const l = live(f, sc.now);
    expect(fmtDur(Math.floor(l.awakeMin))).toBe('1 ч 32 мин');
    expect(Math.ceil(l.minutesTo)).toBe(38);
    expect(l.status).toBe('before');
  });
  it('шкала кольца 150 минут', () => {
    expect(f.ringScaleMin).toBe(150);
  });
  it('возраст — 5 месяцев', () => {
    expect(ageInfo(sc.child.birth, sc.now).label).toBe('5 месяцев');
  });
  it('кольцо: заливка и жёлтая дуга как в макете', () => {
    const l = live(f, sc.now);
    const startMin = (f.windowStart - f.wakeAt) / 60000;
    const endMin = (f.windowEnd - f.wakeAt) / 60000;
    const r = homeRing(l.awakeMin, startMin, endMin, f.ringScaleMin);
    expect(r.windowLen).toBeGreaterThan(100);
    expect(r.elapsed).toBeLessThan(r.windowOff + r.windowLen);
  });
});

describe('макет «Почему так?»', () => {
  const { sc, ctx } = ctxOf('why');
  const f = computeForecast(ctx)!;
  it('личный ритм: 14 замеров, вес 0,78, квартили 14:15–14:40', () => {
    expect(f.basis.personal!.n).toBe(14);
    expect(f.basis.weight).toBeCloseTo(14 / 18, 6);
    expect(f.basis.personal!.startQuartiles).toEqual([855, 880]);
  });
  it('точность: 8 из 10', () => {
    const bt = backtest(ctx);
    expect(bt.hits).toBe(8);
    expect(bt.total).toBe(10);
  });
  it('тексты причин собираются без пустых мест', () => {
    const ex = explain(f, sc.child.gender);
    for (const k of ['ageTitle', 'age', 'lastTitle', 'last', 'rhythmTitle', 'rhythm'] as const) {
      expect(ex[k].length).toBeGreaterThan(3);
    }
    expect(ex.age).toContain('2–2,5 часа');
    expect(ex.rhythm).toContain('14:15');
    expect(ex.rhythm).toContain('14:40');
  });
});

describe('макет «Сон идёт» (15:34:08)', () => {
  const { sc, ctx } = ctxOf('sleeping');
  const act = activeSleep(sleepsOf(sc.events, sc.child.id))!;
  const o = computeOutlook(ctx, act);
  it('уснула в 14:22, идёт 1:12:08', () => {
    expect(hm(act.t)).toBe('14:22');
    expect(Math.floor((sc.now - act.t) / 1000)).toBe(1 * 3600 + 12 * 60 + 8);
  });
  it('обычно 1 ч – 1 ч 20 мин', () => {
    expect(o.range).toEqual([60, 80]);
    expect(`${fmtDur(o.range![0])} – ${fmtDur(o.range![1])}`).toBe('1 ч – 1 ч 20 мин');
  });
  it('кольцо: заливка 483,4 из 804,3 и внешняя дуга 148,7 со сдвигом 446,1', () => {
    const elapsed = (sc.now - act.t) / 60000;
    const r = sleepRing(elapsed, o.range, o.ringScaleMin);
    expect(o.ringScaleMin).toBe(120);
    expect(r.elapsed).toBeCloseTo(483.4, 0);
    expect(r.rangeLen).toBeCloseTo(148.7, 1);
    expect(r.rangeOff).toBeCloseTo(446.1, 1);
  });
});

describe('макет «Ночь» (03:55)', () => {
  const { sc } = ctxOf('night');
  const feeds = feedsOf(sc.events, sc.child.id);
  const lf = lastFeed(feeds, sc.now)!;
  const typical = typicalFeedInterval(feeds, normFor(5), sc.now);
  it('последнее кормление в 01:35, прошло 2 ч 20 мин', () => {
    expect(hm(lf.t)).toBe('01:35');
    expect(fmtDur(Math.floor((sc.now - lf.t) / 60000))).toBe('2 ч 20 мин');
  });
  it('обычный промежуток 3 часа, кольцо заполнено на 156,4 из 201,1', () => {
    expect(typical.minutes).toBe(180);
    expect(feedRingDash((sc.now - lf.t) / 60000, typical.minutes)).toBeCloseTo(156.4, 1);
  });
});

describe('макет «Журнал» (15:34)', () => {
  const { sc, ctx } = ctxOf('day');
  const dayStart = startOfDay(sc.now);
  const sleeps = sleepsOf(sc.events, sc.child.id);
  const f = computeForecast(ctx)!;
  it('сон с полуночи 10 ч 02 мин', () => {
    expect(fmtDur(sleepSplitIn(sleeps, dayStart, sc.now).total, { pad: true })).toBe('10 ч 02 мин');
  });
  it('следующий сон ≈ 17:35', () => {
    expect(hm(f.predictedAt)).toBe('17:35');
  });
  it('типичная длина дневного сна 75 минут', () => {
    expect(expectedNapLength(sleeps, sc.now, 70)).toBe(75);
  });
  it('лента: «сейчас» в 15:34 и пунктирный блок следующего сна', () => {
    const rb = buildRibbon(sleeps, dayStart, sc.now, f, 75);
    expect(rb.nowLeft).toBe(Math.floor(((15 * 60 + 34) / 1440) * 314));
    expect(rb.next).not.toBeNull();
    expect(rb.segments.length).toBeGreaterThanOrEqual(4);
  });
  it('в журнале видны строки макета: 15:34, 14:22, 13:20, 12:10, 11:00, 10:50', () => {
    const rows = timelineRows(ctx, dayStart).slice(0, 6);
    expect(rows.map((r) => hm(r.t))).toEqual(['15:34', '14:22', '13:20', '12:10', '11:00', '10:50']);
    expect(rows[0].title).toBe('Проснулась');
    expect(rows[0].sub).toBe('Сон 1 ч 12 мин');
    expect(rows[1].sub).toBe('Прогноз был 14:20');
    expect(rows[2].sub).toBe('Бутылочка · 120 мл');
    expect(rows[3].sub).toBe('Сон 1 ч 10 мин');
    expect(rows[5].sub).toBe('Мокрый');
  });
});

describe('макет «Выписка» (23:07)', () => {
  const { sc } = ctxOf('report');
  const ps = periodStats(sc.events, sc.child.id, fixtureDay(), 7, sc.now);
  it('в среднем 13 ч 35 мин в сутки', () => {
    expect(fmtDur(ps.avgSleepMin, { pad: true })).toBe('13 ч 35 мин');
  });
  it('высота столбиков 90, 93, 85, 93, 95, 87, 91 px', () => {
    expect(ps.days.map((d) => barHeight(d.sleepMin))).toEqual([90, 93, 85, 93, 95, 87, 91]);
  });
  it('от 12,8 до 14,2 часа', () => {
    expect(fmtHours(ps.minSleepMin)).toBe('12,8');
    expect(fmtHours(ps.maxSleepMin)).toBe('14,2');
  });
  it('сегодня — последний столбик', () => {
    expect(ps.days[6].isToday).toBe(true);
    expect(ps.days.filter((d) => d.isToday)).toHaveLength(1);
  });
});

describe('макет «Семья»: карточка «так увидит бабушка»', () => {
  it('шкала: доля от верхней границы обычного сна', () => {
    const { sc, ctx } = ctxOf('family');
    const act = activeSleep(sleepsOf(sc.events, sc.child.id))!;
    const o = computeOutlook(ctx, act);
    const min = (sc.now - act.t) / 60000;
    expect(progressPct(min, o.range![1])).toBe(Math.round(((72.13) / 80) * 100));
  });
});
