import { describe, expect, it } from 'vitest';
import { backtest, computeOutlook, live } from '../src/engine/predict';
import { buildReport, periodRange, reportToText } from '../src/engine/report';
import { recentItems, timelineRows } from '../src/engine/day';
import { activeSleep, sleepsOf } from '../src/engine/sleep';
import { periodStats, reportExtras } from '../src/engine/week';
import { HOUR, MIN, startOfDay } from '../src/engine/time';
import { parseVoice } from '../src/engine/voice';
import { derive } from '../src/store/select';
import { emptyState, sanitizeState } from '../src/store/state';
import { DremaEvent } from '../src/engine/model';
import { makeChild } from './helpers';

/**
 * Случайные, но повторяемые наборы записей: всё, что может прийти из реальной жизни и из файла копии
 * (пересечения, дубли, записи «из будущего», сон на много суток, пустые дни, один-единственный сон).
 * Расчёты не должны падать и не должны отдавать NaN/Infinity: иначе на экране появятся «NaN мин» или пустой экран.
 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOW0 = new Date('2026-10-10T14:20:00+03:00').getTime();

function randomEvents(r: () => number, now: number): DremaEvent[] {
  const out: DremaEvent[] = [];
  const n = Math.floor(r() * 120);
  let id = 0;
  for (let i = 0; i < n; i++) {
    const t = now - Math.floor(r() * 30 * 24 * HOUR) + (r() < 0.03 ? 40 * HOUR : 0);
    const base = { id: `e${id++}`, childId: 'c1', t, updatedAt: 0 };
    const k = r();
    if (k < 0.4) {
      const open = r() < 0.04;
      const len = r() < 0.05 ? Math.floor(r() * 80 * HOUR) : Math.floor((20 + r() * 200) * MIN);
      out.push({ ...base, type: 'sleep', end: open ? null : t + len } as DremaEvent);
    } else if (k < 0.7) {
      const how = r() < 0.6 ? 'bottle' : r() < 0.5 ? 'breast' : 'solid';
      out.push({ ...base, type: 'feed', how, ...(how === 'bottle' ? { ml: Math.floor(r() * 300) } : how === 'breast' ? { left: Math.floor(r() * 30), right: Math.floor(r() * 30) } : { note: 'каша' }) } as DremaEvent);
    } else if (k < 0.85) out.push({ ...base, type: 'diaper', kind: (['wet', 'dirty', 'mixed'] as const)[Math.floor(r() * 3)] } as DremaEvent);
    else if (k < 0.9) out.push({ ...base, type: 'temp', c: 35 + r() * 6 } as DremaEvent);
    else if (k < 0.94) out.push({ ...base, type: 'med', name: 'Витамин Д' } as DremaEvent);
    else if (k < 0.97) out.push({ ...base, type: 'walk', end: r() < 0.5 ? t + 40 * MIN : null } as DremaEvent);
    else out.push({ ...base, type: 'growth', kg: 3 + r() * 10, cm: 50 + r() * 40 } as DremaEvent);
  }
  return out;
}

const finite = (v: unknown, path: string, bad: string[]): void => {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) bad.push(`${path} = ${v}`);
  } else if (Array.isArray(v)) v.forEach((x, i) => finite(x, `${path}[${i}]`, bad));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) finite(x, `${path}.${k}`, bad);
};

describe('случайные данные: расчёты не падают и не дают NaN', () => {
  it('300 случайных наборов записей × случайные «сейчас»', () => {
    const problems: string[] = [];
    const seen = { forecast: 0, active: 0, outlook: 0, rows: 0, report: 0 };
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed);
      const now = NOW0 + Math.floor((r() - 0.5) * 20 * HOUR) + Math.floor(r() * 6) * 24 * HOUR * (r() < 0.2 ? 1 : 0);
      const child = makeChild(['2026-09-20', '2026-05-02', '2025-10-01', '2024-03-01', '2026-10-09'][seed % 5], seed % 2 ? 'f' : 'm');
      const events = randomEvents(r, now);
      // как при загрузке копии: данные сначала проходят проверку
      const s = sanitizeState({ ...emptyState(), onboarded: true, children: [child], activeChildId: 'c1', events });
      expect(s, `seed ${seed}`).not.toBeNull();
      const where = `seed ${seed}`;
      try {
        const d = derive(s!, now);
        expect(d).not.toBeNull();
        finite(d!.ds, `${where} ds`, problems);
        if (d!.forecast) {
          seen.forecast++;
          finite(d!.forecast, `${where} forecast`, problems);
          finite(live(d!.forecast, now), `${where} live`, problems);
        }
        const act = activeSleep(sleepsOf(d!.events, 'c1'));
        if (act) {
          seen.active++;
          const o = computeOutlook(d!.ctx, act);
          if (o.range) seen.outlook++;
          finite(o, `${where} outlook`, problems);
        }
        finite(backtest(d!.ctx), `${where} backtest`, problems);
        const day = startOfDay(now);
        const rows = timelineRows({ ...d!.ctx, now }, day);
        if (rows.length) seen.rows++;
        finite(rows.map((x) => x.t), `${where} timeline`, problems);
        recentItems(d!.events, 'c1', now, 6);
        for (const n of [7, 30]) {
          const ps = periodStats(d!.events, 'c1', day, n, now);
          finite(ps, `${where} period${n}`, problems);
          const range = periodRange(day, n);
          const extras = reportExtras(d!.events, 'c1', range.from, range.toExclusive);
          finite(extras, `${where} extras${n}`, problems);
          const doc = buildReport({ child, stats: ps, extras, question: 'Нормальный ли сон?', now });
          const text = reportToText(doc);
          if (text.length > 50) seen.report++;
          if (/NaN|Infinity|undefined|null/.test(text)) problems.push(`${where} отчёт: «${text.match(/.{0,30}(NaN|Infinity|undefined|null).{0,30}/)?.[0]}»`);
        }
      } catch (e) {
        problems.push(`${where}: упало — ${e instanceof Error ? e.stack?.split('\n').slice(0, 3).join(' | ') : e}`);
      }
    }
    expect(problems.slice(0, 15)).toEqual([]);
    // проверка не пустая: большая часть наборов дошла до прогноза, незаконченного сна, ленты дня и отчёта
    expect(seen.forecast).toBeGreaterThan(50);
    expect(seen.active).toBeGreaterThan(50);
    expect(seen.outlook).toBeGreaterThan(20);
    expect(seen.rows).toBeGreaterThan(150);
    expect(seen.report).toBeGreaterThan(500);
  });

  it('любая фраза в голосовом вводе разбирается без падения', () => {
    const r = rng(7);
    const words = ['покормила', 'уснула', 'проснулась', 'подгузник', 'мокрый', 'грязный', 'температура', '37,2', 'мл', '120', 'вчера', 'в', '14:30', 'назад', 'минут', 'час', 'полчаса', 'сто', 'двадцать', 'левая', 'правая', 'грудь', 'витамин', 'дали', 'гуляли', 'купали', 'вес', 'рост', 'заметка', '0', '99999', '25:99', ':', ',', '!!!', '🙂', ''];
    for (let i = 0; i < 2000; i++) {
      const len = 1 + Math.floor(r() * 9);
      const phrase = Array.from({ length: len }, () => words[Math.floor(r() * words.length)]).join(r() < 0.7 ? ' ' : ', ');
      let res;
      expect(() => (res = parseVoice(phrase, { now: NOW0, gender: 'f' })), phrase).not.toThrow();
      const bad: string[] = [];
      finite(res, phrase, bad);
      expect(bad, phrase).toEqual([]);
      for (const a of (res as unknown as { actions: Array<{ t: number }> }).actions) expect(a.t, phrase).toBeLessThanOrEqual(NOW0 + MIN);
    }
  });
});
