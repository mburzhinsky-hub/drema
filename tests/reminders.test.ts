import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, DremaEvent, Settings } from '../src/engine/model';
import { normFor } from '../src/engine/norms';
import { ageInfo } from '../src/engine/age';
import { computeForecast, computeOutlook } from '../src/engine/predict';
import { WAKE_GRACE_MIN, dueReminders, plannedReminders } from '../src/engine/reminders';
import { activeSleep, sleepKind, sleepsOf } from '../src/engine/sleep';
import { MIN } from '../src/engine/time';
import { at, ctxAt, feed, makeChild, sleep, steadyDays } from './helpers';

const plan = { wake: '06:45', gaps: [100, 120, 120, 120, 120], durs: [60, 60, 60, 60] };

/** Две недели ровных суток; последняя ночь закрыта в 06:45 сегодняшнего дня. */
function history(): DremaEvent[] {
  const wake = at(0, '06:45');
  return steadyDays(-14, -1, plan).map((s) => (s.end === null ? { ...s, end: wake } : s));
}

const settings = (patch: Partial<Settings['reminders']>): Settings => ({
  ...DEFAULT_SETTINGS,
  reminders: { ...DEFAULT_SETTINGS.reminders, ...patch },
});

describe('напоминание об окне сна', () => {
  const ev = history();
  const now = at(0, '07:30');

  it('приходит за lead минут до начала окна и живёт до его конца', () => {
    const ctx = ctxAt(ev, now);
    const f = computeForecast(ctx)!;
    const [r] = plannedReminders(ctx).filter((x) => x.kind === 'window');
    expect(r.at).toBe(f.windowStart - 10 * MIN);
    expect(r.expires).toBe(f.windowEnd);
    expect(r.id).toBe(`window:${f.wakeAt}`);
    expect(r.body).toContain('Окно сна');
  });

  it('упреждение берётся из настроек', () => {
    const s = settings({ window: { on: true, lead: 25 } });
    const ctx = ctxAt(ev, now, makeChild(), s);
    const f = computeForecast(ctx)!;
    expect(plannedReminders(ctx)[0].at).toBe(f.windowStart - 25 * MIN);
  });

  it('выключено — не планируется', () => {
    const ctx = ctxAt(ev, now, makeChild(), settings({ window: { on: false, lead: 10 } }));
    expect(plannedReminders(ctx)).toEqual([]);
  });

  it('до срока не показывается, в окне — показывается, после окончания — нет', () => {
    const f = computeForecast(ctxAt(ev, now))!;
    const fired = new Set<string>();
    expect(dueReminders(ctxAt(ev, f.windowStart - 11 * MIN), fired)).toHaveLength(0);
    expect(dueReminders(ctxAt(ev, f.windowStart - 10 * MIN), fired)).toHaveLength(1);
    expect(dueReminders(ctxAt(ev, f.windowEnd - MIN), fired)).toHaveLength(1);
    expect(dueReminders(ctxAt(ev, f.windowEnd), fired)).toHaveLength(0);
  });

  it('уже показанное повторно не показывается', () => {
    const f = computeForecast(ctxAt(ev, now))!;
    const ctx = ctxAt(ev, f.windowStart);
    const [r] = dueReminders(ctx, new Set());
    expect(dueReminders(ctx, new Set([r.id]))).toHaveLength(0);
  });

  it('когда малыш уснул, окно сна не напоминается', () => {
    const asleep = [...ev, sleep(0, '08:30', null)];
    expect(plannedReminders(ctxAt(asleep, at(0, '08:40'))).filter((r) => r.kind === 'window')).toEqual([]);
  });

  it('идентификатор привязан к пробуждению: после нового пробуждения напоминание новое', () => {
    const first = plannedReminders(ctxAt(ev, now))[0];
    const next = [...ev, sleep(0, '08:30', '09:30')];
    const second = plannedReminders(ctxAt(next, at(0, '09:35'))).find((r) => r.kind === 'window')!;
    expect(second.id).not.toBe(first.id);
  });
});

describe('напоминание о кормлении', () => {
  const norm = normFor(ageInfo('2026-05-02', at(0, '12:00')).months);
  const s = settings({ feed: { on: true } });

  it('нет кормлений — нечего напоминать', () => {
    const ctx = ctxAt([sleep(0, '09:00', '10:00')], at(0, '12:00'), makeChild(), s);
    expect(plannedReminders(ctx).filter((r) => r.kind === 'feed')).toEqual([]);
  });

  it('срок — обычный промежуток после последнего кормления (без истории — по возрастной норме)', () => {
    const ctx = ctxAt([feed(0, '12:00')], at(0, '12:30'), makeChild(), s);
    const [r] = plannedReminders(ctx).filter((x) => x.kind === 'feed');
    expect(r.at).toBe(at(0, '12:00') + norm.feedEvery * MIN);
    expect(r.expires - r.at).toBe(45 * MIN);
  });

  it('по умолчанию выключено', () => {
    const ctx = ctxAt([feed(0, '12:00')], at(0, '15:30'));
    expect(plannedReminders(ctx).filter((r) => r.kind === 'feed')).toEqual([]);
  });

  it('приходит через промежуток, истекает через 45 минут', () => {
    const lf = at(0, '12:00');
    const due = (dt: number) => dueReminders(ctxAt([feed(0, '12:00')], lf + dt * MIN, makeChild(), s), new Set());
    expect(due(norm.feedEvery - 1)).toHaveLength(0);
    expect(due(norm.feedEvery)).toHaveLength(1);
    expect(due(norm.feedEvery + 44)).toHaveLength(1);
    expect(due(norm.feedEvery + 45)).toHaveLength(0);
  });

  it('новое кормление — новый идентификатор', () => {
    const a = plannedReminders(ctxAt([feed(0, '12:00')], at(0, '12:10'), makeChild(), s))[0];
    const b = plannedReminders(ctxAt([feed(0, '12:00'), feed(0, '12:05')], at(0, '12:10'), makeChild(), s))[0];
    expect(a.id).not.toBe(b.id);
  });
});

describe('напоминание «пора будить»', () => {
  const s = settings({ wake: { on: true } });
  const nap = sleep(0, '12:00', null);
  const ev = [...history(), nap];

  it('срок — верх обычного диапазона сна плюс запас', () => {
    const now = at(0, '12:30');
    const ctx = ctxAt(ev, now, makeChild(), s);
    const act = activeSleep(sleepsOf(ev, 'c1'))!;
    const range = computeOutlook(ctx, act).range!;
    const [r] = plannedReminders(ctx);
    expect(r.kind).toBe('wake');
    expect(r.at).toBe(act.t + (range[1] + WAKE_GRACE_MIN) * MIN);
    expect(r.expires - r.at).toBe(120 * MIN);
    expect(r.id).toBe(`wake:${act.t}`);
  });

  it('до срока не показывается', () => {
    expect(dueReminders(ctxAt(ev, at(0, '12:30'), makeChild(), s), new Set())).toHaveLength(0);
  });

  it('после срока показывается', () => {
    expect(dueReminders(ctxAt(ev, at(0, '14:30'), makeChild(), s), new Set())).toHaveLength(1);
  });

  it('ночной сон будить не напоминаем', () => {
    const night = [...history().slice(0, -3), sleep(-1, '20:00', null)];
    const ctx = ctxAt(night, at(0, '03:00'), makeChild(), s);
    const act = activeSleep(sleepsOf(night, 'c1'));
    expect(act && sleepKind(act)).toBe('night');
    expect(plannedReminders(ctx)).toEqual([]);
  });

  it('выключено — не планируется', () => {
    expect(plannedReminders(ctxAt(ev, at(0, '14:30'), makeChild(), DEFAULT_SETTINGS)).filter((r) => r.kind === 'wake')).toEqual([]);
  });
});
