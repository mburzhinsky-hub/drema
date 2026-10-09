import { describe, expect, it } from 'vitest';
import { RIBBON_W, buildRibbon, eventSub, eventTitle, expectedNapLength, recentItems, sleepMinutesIn, sleepSplitIn, timelineRows } from '../src/engine/day';
import { DremaEvent } from '../src/engine/model';
import { buildReport, buildReportText, periodRange, reportToText } from '../src/engine/report';
import { sleepsOf } from '../src/engine/sleep';
import { DAY, MIN, addDays } from '../src/engine/time';
import { BAR_AREA_PX, barHeight, dayStat, daysWord, fmtHours, fmtPerDay, periodStats, reportExtras } from '../src/engine/week';
import { DAY0, at, ctxAt, feed, makeChild, sleep, steadyDays } from './helpers';

// Ровные сутки: ночь 20:25 → 06:45 (620 мин), дневные сны по 60 мин в 08:25, 11:25, 14:25, 17:25.
const plan = { wake: '06:45', gaps: [100, 120, 120, 120, 120], durs: [60, 60, 60, 60] };
const wake = at(0, '06:45');
const steady = steadyDays(-14, -1, plan).map((s) => (s.end === null ? { ...s, end: wake } : s));
const D = (offset: number) => addDays(DAY0, offset);

const extra = (e: Record<string, unknown>): DremaEvent => ({ id: `x${Math.random()}`, childId: 'c1', t: at(0, '10:00'), updatedAt: 0, ...e }) as DremaEvent;

describe('сутки в цифрах', () => {
  it('полные ровные сутки: 14 ч 20 мин, из них ночью 10 ч 20 мин, днём 4 ч в 4 снах', () => {
    const d = dayStat(steady, 'c1', D(-5), at(0, '12:00'));
    expect(d).toMatchObject({ sleepMin: 860, nightMin: 620, napMin: 240, naps: 4, complete: true, isToday: false, tracked: true });
  });

  it('сон через полночь делится между сутками', () => {
    const ev = [sleep(-1, '20:00', '06:00', 0)];
    const a = dayStat(ev, 'c1', D(-1), at(0, '12:00'));
    const b = dayStat(ev, 'c1', D(0), at(0, '12:00'));
    expect(a.sleepMin).toBe(240);
    expect(b.sleepMin).toBe(360);
    expect(a.sleepMin + b.sleepMin).toBe(600);
  });

  it('идущий сон считается до «сейчас»', () => {
    const ev = [sleep(0, '13:00', null)];
    expect(dayStat(ev, 'c1', D(0), at(0, '14:00')).sleepMin).toBe(60);
  });

  it('кормления, миллилитры и подгузники', () => {
    const ev: DremaEvent[] = [
      feed(0, '07:00', { ml: 100 }),
      feed(0, '10:00', { ml: 120 }),
      feed(0, '13:00', { how: 'breast', ml: undefined, left: 10 }),
      extra({ type: 'diaper', kind: 'wet' }),
      extra({ type: 'diaper', kind: 'dirty' }),
      extra({ type: 'diaper', kind: 'mixed' }),
    ];
    const d = dayStat(ev, 'c1', D(0), at(0, '14:00'));
    expect(d).toMatchObject({ feeds: 3, ml: 220, diapers: 3, wet: 2, dirty: 2 });
  });

  it('удалённые записи и записи «из будущего» не считаются', () => {
    const ev: DremaEvent[] = [feed(0, '07:00', { deleted: true }), feed(0, '15:00')];
    expect(dayStat(ev, 'c1', D(0), at(0, '14:00')).feeds).toBe(0);
  });

  it('день без записей не «отслеживаемый»', () => {
    expect(dayStat([], 'c1', D(0), at(0, '14:00')).tracked).toBe(false);
  });

  it('чужой ребёнок не попадает в цифры', () => {
    const ev: DremaEvent[] = [{ ...feed(0, '07:00'), childId: 'other' }];
    expect(dayStat(ev, 'c1', D(0), at(0, '14:00')).feeds).toBe(0);
  });

  it('сегодняшний день не закончен', () => {
    expect(dayStat(steady, 'c1', D(0), at(0, '12:00'))).toMatchObject({ complete: false, isToday: true });
  });
});

describe('период', () => {
  it('неделя: средние по законченным суткам', () => {
    const s = periodStats(steady, 'c1', D(-1), 7, at(0, '12:00'));
    expect(s.days).toHaveLength(7);
    expect(s.basis).toHaveLength(7);
    expect(s.avgSleepMin).toBe(860);
    expect(s.avgNightMin).toBe(620);
    expect(s.avgNaps).toBe(4);
    expect(s.minSleepMin).toBe(860);
    expect(s.maxSleepMin).toBe(860);
    expect(s.from).toBe(D(-7));
    expect(s.to).toBe(D(-1));
  });

  it('сегодняшний неполный день в средние не входит', () => {
    const s = periodStats(steady, 'c1', D(0), 7, at(0, '12:00'));
    expect(s.basis.every((d) => d.complete)).toBe(true);
    expect(s.basis).toHaveLength(6);
  });

  it('в первый день использования берём то, что есть', () => {
    const ev = [sleep(0, '08:00', '09:00')];
    const s = periodStats(ev, 'c1', D(0), 7, at(0, '12:00'));
    expect(s.basis).toHaveLength(1);
    expect(s.avgSleepMin).toBe(60);
  });

  it('без записей средние нулевые, а не NaN', () => {
    const s = periodStats([], 'c1', D(0), 7, at(0, '12:00'));
    expect(s.basis).toHaveLength(0);
    for (const v of [s.avgSleepMin, s.avgFeeds, s.avgMl, s.avgDiapers, s.minSleepMin, s.maxSleepMin]) expect(v).toBe(0);
  });

  it('пустые дни внутри периода в средние не входят', () => {
    const ev = [sleep(-3, '08:00', '10:00'), sleep(-1, '08:00', '12:00')];
    const s = periodStats(ev, 'c1', D(-1), 7, at(0, '12:00'));
    expect(s.basis).toHaveLength(2);
    expect(s.avgSleepMin).toBe(180);
    expect(s.minSleepMin).toBe(120);
    expect(s.maxSleepMin).toBe(240);
  });
});

describe('столбики и подписи отчёта', () => {
  it('высота столбика: шкала 0…16,5 ч на 110 px', () => {
    expect(barHeight(0)).toBe(0);
    expect(barHeight(16.5 * 60)).toBe(BAR_AREA_PX);
    expect(barHeight(30 * 60)).toBe(BAR_AREA_PX);
    expect(barHeight(13 * 60)).toBe(87);
    expect(barHeight(-10)).toBe(0);
  });

  it('часы: одна цифра после запятой, запятая русская', () => {
    expect(fmtHours(768)).toBe('12,8');
    expect(fmtHours(855)).toBe('14,3');
    expect(fmtHours(840)).toBe('14');
    expect(fmtHours(0)).toBe('0');
  });

  it('«в сутки»: с точностью до половинки', () => {
    expect(fmtPerDay(7)).toBe('7');
    expect(fmtPerDay(6.4)).toBe('6,5');
    expect(fmtPerDay(6.2)).toBe('6');
    expect(fmtPerDay(0)).toBe('0');
  });

  it('склонение «день»', () => {
    expect([1, 2, 5, 11, 21, 22, 25].map(daysWord)).toEqual(['день', 'дня', 'дней', 'дней', 'день', 'дня', 'дней']);
  });
});

describe('температура, лекарства, рост за период', () => {
  const ev = [
    extra({ id: 't1', type: 'temp', c: 37.8, t: at(-2, '10:00') }),
    extra({ id: 't2', type: 'temp', c: 36.6, t: at(-1, '10:00') }),
    extra({ id: 't3', type: 'temp', c: 38.4, t: at(-1, '22:00') }),
    extra({ id: 't0', type: 'temp', c: 39, t: at(-20, '10:00') }),
    extra({ id: 'm1', type: 'med', name: 'Парацетамол', dose: '2 мл', t: at(-1, '22:05') }),
    extra({ id: 'g1', type: 'growth', kg: 6.8, cm: 64, t: at(-30, '10:00') }),
    extra({ id: 'g2', type: 'growth', kg: 7.4, cm: 67, t: at(-3, '10:00') }),
  ];

  it('берёт записи только из периода и по порядку', () => {
    const x = reportExtras(ev, 'c1', D(-7), D(0));
    expect(x.temps.map((t) => t.c)).toEqual([37.8, 36.6, 38.4]);
    expect(x.meds).toHaveLength(1);
    expect(x.maxTemp).toBe(38.4);
  });

  it('дни с температурой от 37,5 — «жаркие»', () => {
    expect(reportExtras(ev, 'c1', D(-7), D(0)).feverDays).toBe(2);
  });

  it('рост и вес — последнее измерение до конца периода, даже из прошлого', () => {
    expect(reportExtras(ev, 'c1', D(-7), D(0)).growth).toMatchObject({ kg: 7.4, cm: 67 });
    expect(reportExtras(ev, 'c1', D(-40), D(-10)).growth).toMatchObject({ kg: 6.8 });
  });

  it('пустой период', () => {
    const x = reportExtras([], 'c1', D(-7), D(0));
    expect(x).toMatchObject({ maxTemp: null, feverDays: 0, growth: undefined });
    expect(x.temps).toEqual([]);
  });
});

describe('выписка для педиатра', () => {
  const child = makeChild();
  const now = at(0, '09:00');
  const stats = periodStats(steady, 'c1', D(-1), 7, now);
  const ex = reportExtras(
    [...steady, extra({ type: 'temp', c: 38.4, t: at(-1, '22:00') }), extra({ type: 'med', name: 'Парацетамол', dose: '2 мл', t: at(-1, '22:05') }), extra({ type: 'growth', kg: 7.4, cm: 67, t: at(-3, '10:00') })],
    'c1',
    stats.from,
    D(0),
  );

  it('разделы по порядку и числа из статистики', () => {
    const doc = buildReport({ child, stats, extras: ex, question: 'Не слишком ли много спит днём?', now });
    expect(doc.sections.map((s) => s.title)).toEqual([
      'СОН (в среднем за 7 дней)', 'ПИТАНИЕ', 'ПОДГУЗНИКИ', 'ТЕМПЕРАТУРА', 'ЛЕКАРСТВА', 'РОСТ И ВЕС', 'ВОПРОС ВРАЧУ',
    ]);
    expect(doc.sections[0].bullets![0]).toBe('14 ч 20 мин в сутки, от 14 ч 20 мин до 14 ч 20 мин');
    expect(doc.sections[0].bullets![1]).toContain('ночью 10 ч 20 мин, днём 4 ч');
    expect(doc.heading).toContain('Мила');
  });

  it('температура и лекарства подробно, рост с датой', () => {
    const doc = buildReport({ child, stats, extras: ex, question: '', now });
    const t = doc.sections.find((s) => s.title === 'ТЕМПЕРАТУРА')!;
    expect(t.bullets![0]).toBe('максимум 38,4 °C');
    expect(t.bullets![1]).toContain('38,4 °C');
    expect(doc.sections.find((s) => s.title === 'ЛЕКАРСТВА')!.bullets![0]).toContain('Парацетамол, 2 мл');
    expect(doc.sections.find((s) => s.title === 'РОСТ И ВЕС')!.bullets![0]).toContain('7,4 кг, 67 см');
  });

  it('пустой вопрос не даёт раздел', () => {
    const doc = buildReport({ child, stats, extras: ex, question: '   ', now });
    expect(doc.sections.some((s) => s.title === 'ВОПРОС ВРАЧУ')).toBe(false);
  });

  it('без записей — «записей нет», без выдуманных цифр', () => {
    const empty = periodStats([], 'c1', D(-1), 7, now);
    const doc = buildReport({ child, stats: empty, extras: reportExtras([], 'c1', empty.from, D(0)), question: '', now });
    expect(doc.sections).toEqual([{ title: 'ЗАПИСИ', text: 'За выбранный период записей нет.' }]);
  });

  it('текст для мессенджера: заголовок, маркеры, подпись', () => {
    const text = buildReportText({ child, stats, extras: ex, question: 'Вопрос?', now });
    expect(text.startsWith('Выписка для педиатра\n')).toBe(true);
    expect(text).toContain('• 14 ч 20 мин в сутки');
    expect(text).toContain('ВОПРОС ВРАЧУ\nВопрос?');
    expect(text.endsWith('Это не медицинское заключение.')).toBe(true);
    expect(text).toBe(reportToText(buildReport({ child, stats, extras: ex, question: 'Вопрос?', now })));
  });

  it('смесь округляется до 10 мл', () => {
    const withMl = { ...stats, avgMl: 487 };
    const doc = buildReport({ child, stats: withMl, extras: ex, question: '', now });
    expect(doc.sections[1].bullets![0]).toContain('около 490 мл');
  });

  it('границы периода: неделя — 7 суток, включая последние', () => {
    const r = periodRange(D(-1), 7);
    expect(r.from).toBe(D(-7));
    expect(r.toExclusive).toBe(D(0));
  });
});

describe('лента суток', () => {
  const sleeps = sleepsOf(steady, 'c1');

  it('сегменты в пикселях: 314 px на 1440 минут', () => {
    const r = buildRibbon(sleeps, D(-5), at(0, '12:00'), null, 60);
    const nap = r.segments.find((s) => s.kind === 'nap')!;
    expect(nap.left).toBe(Math.round((8 * 60 + 25) * (RIBBON_W / 1440)));
    expect(nap.width).toBe(Math.round(((9 * 60 + 25) * RIBBON_W) / 1440) - nap.left);
    expect(r.nowLeft).toBeNull();
    expect(r.next).toBeNull();
  });

  it('ночь, пришедшая из вчера, с закруглением только справа от полуночи', () => {
    const r = buildRibbon(sleeps, D(-5), at(0, '12:00'), null, 60);
    const first = r.segments[0];
    expect(first.left).toBe(0);
    expect(first.roundLeft).toBe(true);
    const last = r.segments.at(-1)!;
    expect(last.roundRight).toBe(true);
  });

  it('сегодня: есть позиция «сейчас» и блок следующего сна', () => {
    const f = {
      predictedAt: at(0, '14:20'),
    } as never;
    const r = buildRibbon(sleeps, D(0), at(0, '12:00'), f, 75);
    expect(r.nowLeft).toBe(Math.floor(12 * 60 * (RIBBON_W / 1440)));
    expect(r.next).not.toBeNull();
    expect(r.next!.left).toBe(Math.round((14 * 60 + 20) * (RIBBON_W / 1440)));
  });

  it('блок следующего сна не вылезает за край ленты', () => {
    const f = { predictedAt: at(0, '23:30') } as never;
    const r = buildRibbon([], D(0), at(0, '23:00'), f, 120);
    expect(r.next!.left + r.next!.width).toBeLessThanOrEqual(RIBBON_W + 4);
  });

  it('описание для экранного диктора', () => {
    const r = buildRibbon(sleeps, D(-5), at(0, '12:00'), null, 60);
    expect(r.aria).toMatch(/^Лента суток: ночной сон до 6:45, дневные сны в 8:25, 11:25, 14:25 и 17:25/);
  });

  it('даже очень короткий сон виден: ширина не меньше 2 px', () => {
    const r = buildRibbon([sleep(-5, '10:00', '10:01')], D(-5), at(0, '12:00'), null, 60);
    expect(r.segments[0].width).toBe(2);
  });
});

describe('сон за сутки', () => {
  it('сумма и разбивка', () => {
    const s = sleepsOf(steady, 'c1');
    expect(sleepMinutesIn(s, D(-5), at(0, '12:00'))).toBe(860);
    expect(sleepSplitIn(s, D(-5), at(0, '12:00'))).toEqual({ total: 860, night: 620, nap: 240, naps: 4 });
  });
});

describe('журнал суток', () => {
  const ev: DremaEvent[] = [sleep(0, '08:25', '09:25'), feed(0, '09:30', { ml: 120 }), extra({ type: 'temp', c: 36.8, t: at(0, '10:00') })];
  const ctx = ctxAt(ev, at(0, '11:00'));

  it('сон даёт две строки, новые сверху', () => {
    const rows = timelineRows(ctx, D(0));
    expect(rows.map((r) => r.kind)).toEqual(['temp', 'feed', 'wake', 'sleep']);
    expect(rows.find((r) => r.kind === 'wake')!.sub).toBe('Сон 1 ч');
  });

  it('строки с заголовками и подписями', () => {
    const rows = timelineRows(ctx, D(0));
    expect(rows.find((r) => r.kind === 'feed')).toMatchObject({ title: 'Кормление', sub: 'Бутылочка · 120 мл' });
    expect(rows.find((r) => r.kind === 'temp')).toMatchObject({ title: 'Температура', sub: '36,8 °C' });
    expect(rows.find((r) => r.kind === 'sleep')!.title).toBe('Уснула');
  });

  it('идущий сон: «Спит сейчас», строки пробуждения нет', () => {
    const rows = timelineRows(ctxAt([sleep(0, '10:00', null)], at(0, '11:00')), D(0));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'sleep', ongoing: true, sub: 'Спит сейчас' });
  });

  it('пробуждение после «сейчас» не показывается', () => {
    const rows = timelineRows(ctxAt([sleep(0, '10:00', '12:00')], at(0, '11:00')), D(0));
    expect(rows.some((r) => r.kind === 'wake')).toBe(false);
  });

  it('записи других суток не попадают в журнал', () => {
    expect(timelineRows(ctxAt([feed(-1, '10:00')], at(0, '11:00')), D(0))).toEqual([]);
  });

  it('удалённые записи не показываются', () => {
    expect(timelineRows(ctxAt([feed(0, '10:00', { deleted: true })], at(0, '11:00')), D(0))).toEqual([]);
  });

  it('названия и подписи событий', () => {
    expect(eventTitle(extra({ type: 'walk' }))).toBe('Прогулка');
    expect(eventSub(extra({ type: 'walk', end: null }))).toBe('Идёт сейчас');
    expect(eventSub(extra({ type: 'walk', end: at(0, '10:40') }))).toBe('40 мин');
    expect(eventSub(extra({ type: 'growth', kg: 7.5, cm: 68 }))).toBe('7,5 кг · 68 см');
    expect(eventSub(extra({ type: 'med', name: 'Д', dose: '2 капли' }))).toBe('Д · 2 капли');
    expect(eventSub(extra({ type: 'diaper', kind: 'mixed' }))).toBe('Мокрый и грязный');
    expect(eventSub(extra({ type: 'bath' }))).toBeUndefined();
  });
});

describe('последние события и длина дневного сна', () => {
  it('последние события: новые сверху, лимит, сон — по моменту пробуждения', () => {
    const ev = [sleep(0, '08:00', '09:00'), feed(0, '08:30'), feed(0, '10:00'), feed(-3, '10:00')];
    const items = recentItems(ev, 'c1', at(0, '11:00'), 5);
    expect(items.map((i) => i.event.type)).toEqual(['feed', 'sleep', 'feed']);
    expect(recentItems(ev, 'c1', at(0, '11:00'), 1)).toHaveLength(1);
  });

  it('длина дневного сна: медиана за две недели, округлённая до 5 минут', () => {
    expect(expectedNapLength(sleepsOf(steady, 'c1'), at(0, '12:00'), 45)).toBe(60);
  });

  it('мало данных — запасное значение', () => {
    expect(expectedNapLength([sleep(-1, '10:00', '11:00')], at(0, '12:00'), 45)).toBe(45);
  });

  it('границы: сутки = 24 часа', () => {
    expect(DAY).toBe(24 * 60 * MIN);
  });
});
