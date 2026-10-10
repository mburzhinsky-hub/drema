/** Сутки: лента, список событий, итоги. */
import { Forecast, Ctx, forecastFor } from './predict';
import { fmtDur } from './format';
import { DremaEvent, SleepEvent, SleepKind, FeedEvent, DiaperEvent } from './model';
import { feedLabel } from './feed';
import { Seg, clipSleeps, durationMin, liveEvents, segMinutes, sleepKind } from './sleep';
import { DAY, MIN, addDays, hm, startOfDay } from './time';
import { words } from './words';

/** Ширина ленты суток в макете, px. */
export const RIBBON_W = 314;

export interface RibbonSegment {
  left: number;
  width: number;
  kind: SleepKind;
  roundLeft: boolean;
  roundRight: boolean;
}

export interface Ribbon {
  segments: RibbonSegment[];
  /** Положение «сейчас», px; null — для прошлых суток. */
  nowLeft: number | null;
  /** Пунктирный блок следующего сна. */
  next: { left: number; width: number } | null;
  aria: string;
}

const hmShort = (t: number): string => hm(t).replace(/^0/, '');

function joinRu(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} и ${items[items.length - 1]}`;
}

export function buildRibbon(
  sleeps: SleepEvent[],
  dayStart: number,
  now: number,
  forecast: Forecast | null,
  expectedNapMin: number,
): Ribbon {
  const dayEnd = addDays(dayStart, 1);
  const isToday = now >= dayStart && now < dayEnd;
  const segs: Seg[] = clipSleeps(sleeps, dayStart, dayEnd, now);
  // Лента занимает всю ширину и в сутки перевода часов (23 или 25 часов), а не вылезает за край или не доходит до него.
  const k = RIBBON_W / ((dayEnd - dayStart) / MIN);
  const px = (t: number): number => Math.round(((t - dayStart) / MIN) * k);

  const segments: RibbonSegment[] = segs.map((s) => {
    const left = px(s.start);
    const right = px(s.end);
    return {
      left,
      width: Math.max(2, right - left),
      kind: s.kind,
      roundLeft: s.start <= dayStart,
      roundRight: s.end >= dayEnd,
    };
  });

  let next: Ribbon['next'] = null;
  if (isToday && forecast && forecast.predictedAt < dayEnd) {
    const left = px(forecast.predictedAt);
    const right = Math.min(RIBBON_W, px(forecast.predictedAt + expectedNapMin * MIN));
    next = { left, width: Math.max(4, right - left) };
  }

  const nowLeft = isToday ? Math.floor(((now - dayStart) / MIN) * k) : null;

  const parts: string[] = [];
  const nights = segs.filter((s) => s.kind === 'night' && !s.ongoing);
  const nightEnds = nights.filter((s) => s.start <= dayStart).map((s) => `ночной сон до ${hmShort(s.end)}`);
  if (nightEnds.length) parts.push(nightEnds.join(', '));
  const naps = segs.filter((s) => s.kind === 'nap');
  if (naps.length) parts.push(`дневные сны в ${joinRu(naps.map((s) => hmShort(s.start)))}`);
  if (isToday) parts.push(`сейчас ${hmShort(now)}`);
  if (next && forecast) parts.push(`следующий сон около ${hmShort(forecast.predictedAt)}`);
  const aria = `Лента суток: ${parts.join(', ')}`;

  return { segments, nowLeft, next, aria };
}

/** Сон за сутки, минуты (идущий сон считается до «сейчас»). */
export function sleepMinutesIn(sleeps: SleepEvent[], dayStart: number, now: number): number {
  const segs = clipSleeps(sleeps, dayStart, addDays(dayStart, 1), now);
  return segMinutes(segs);
}

export function sleepSplitIn(
  sleeps: SleepEvent[],
  dayStart: number,
  now: number,
): { total: number; night: number; nap: number; naps: number } {
  const segs = clipSleeps(sleeps, dayStart, addDays(dayStart, 1), now);
  const night = segMinutes(segs.filter((s) => s.kind === 'night'));
  const nap = segMinutes(segs.filter((s) => s.kind === 'nap'));
  return { total: night + nap, night, nap, naps: segs.filter((s) => s.kind === 'nap').length };
}

export type RowKind =
  | 'sleep'
  | 'wake'
  | 'feed'
  | 'diaper'
  | 'temp'
  | 'med'
  | 'bath'
  | 'walk'
  | 'growth'
  | 'note';

export interface TimelineRow {
  key: string;
  t: number;
  kind: RowKind;
  eventId: string;
  title: string;
  sub?: string;
  /** Для строк сна: идущий сон. */
  ongoing?: boolean;
  /** Прогноз сбылся. */
  hit?: boolean;
}

const DIAPER_LABEL: Record<DiaperEvent['kind'], string> = {
  wet: 'Мокрый',
  dirty: 'Грязный',
  mixed: 'Мокрый и грязный',
};

const fmtC = (c: number): string => `${c.toFixed(1).replace('.', ',')} °C`;

export function eventTitle(e: DremaEvent): string {
  switch (e.type) {
    case 'sleep':
      return 'Сон';
    case 'feed':
      return 'Кормление';
    case 'diaper':
      return 'Подгузник';
    case 'temp':
      return 'Температура';
    case 'med':
      return 'Лекарство';
    case 'bath':
      return 'Купание';
    case 'walk':
      return 'Прогулка';
    case 'growth':
      return 'Рост и вес';
    case 'note':
      return 'Заметка';
  }
}

/** Строка подписи для события (без сна). */
export function eventSub(e: DremaEvent): string | undefined {
  switch (e.type) {
    case 'feed':
      return feedLabel(e as FeedEvent);
    case 'diaper':
      return DIAPER_LABEL[(e as DiaperEvent).kind];
    case 'temp':
      return fmtC(e.c);
    case 'med':
      return e.dose ? `${e.name} · ${e.dose}` : e.name;
    case 'walk':
      if (e.end === null) return 'Идёт сейчас';
      return e.end === undefined ? undefined : fmtDur((e.end - e.t) / MIN);
    case 'growth': {
      const p: string[] = [];
      if (e.kg !== undefined) p.push(`${String(e.kg).replace('.', ',')} кг`);
      if (e.cm !== undefined) p.push(`${String(e.cm).replace('.', ',')} см`);
      return p.join(' · ') || undefined;
    }
    case 'note':
      return e.text;
    default:
      return undefined;
  }
}

/** Все строки журнала за сутки, новые сверху. Сон даёт две строки: «уснула» и «проснулась». */
export function timelineRows(ctx: Ctx, dayStart: number): TimelineRow[] {
  const { child, now } = ctx;
  const dayEnd = addDays(dayStart, 1);
  const w = words(child.gender);
  const rows: TimelineRow[] = [];

  for (const e of liveEvents(ctx.events, child.id)) {
    if (e.type === 'sleep') {
      const s = e as SleepEvent;
      if (s.t >= dayStart && s.t < dayEnd) {
        let sub: string | undefined;
        let hit = false;
        if (s.t <= now) {
          const f = forecastFor(ctx, s);
          if (f && f.hit) {
            sub = `Прогноз был ${hm(f.predictedAt)}`;
            hit = true;
          }
        }
        if (s.end === null) sub = sub ?? 'Спит сейчас';
        rows.push({
          key: `${s.id}:s`,
          t: s.t,
          kind: 'sleep',
          eventId: s.id,
          title: w.fellAsleep,
          sub,
          ongoing: s.end === null,
          hit,
        });
      }
      if (s.end !== null && s.end >= dayStart && s.end < dayEnd && s.end <= now) {
        rows.push({
          key: `${s.id}:w`,
          t: s.end,
          kind: 'wake',
          eventId: s.id,
          title: w.wokeUp,
          sub: `Сон ${fmtDur(durationMin(s, now))}`,
        });
      }
      continue;
    }
    if (e.t >= dayStart && e.t < dayEnd && e.t <= now + MIN) {
      rows.push({
        key: e.id,
        t: e.t,
        kind: e.type,
        eventId: e.id,
        title: eventTitle(e),
        sub: eventSub(e),
      });
    }
  }

  const order = (r: TimelineRow): number => (r.kind === 'wake' ? 1 : r.kind === 'sleep' ? 0 : 0.5);
  rows.sort((a, b) => b.t - a.t || order(b) - order(a));
  return rows;
}

/** Последние события для главного экрана: каждая запись — одна строка, сон — одна строка «11:00 – 12:10». */
export interface RecentItem {
  event: DremaEvent;
  /** Момент, по которому строка встаёт в список (для сна — конец). */
  at: number;
}

export function recentItems(events: DremaEvent[], childId: string, now: number, limit: number): RecentItem[] {
  const items: RecentItem[] = [];
  const day = startOfDay(now);
  for (const e of liveEvents(events, childId)) {
    if (e.t > now + MIN) continue;
    const at = e.type === 'sleep' ? (e.end ?? e.t) : e.t;
    if (at < day - DAY) continue;
    items.push({ event: e, at });
  }
  items.sort((a, b) => b.at - a.at);
  return items.slice(0, limit);
}

/** Типичная длина дневного сна для пунктирного блока на ленте, мин. */
export function expectedNapLength(sleeps: SleepEvent[], now: number, fallback: number): number {
  const since = now - 14 * DAY;
  const durs = sleeps
    .filter((s) => s.end !== null && s.end <= now && s.t >= since && sleepKind(s) === 'nap')
    .map((s) => durationMin(s, now))
    .sort((a, b) => a - b);
  if (durs.length < 5) return fallback;
  const mid = (durs.length - 1) / 2;
  const med = (durs[Math.floor(mid)] + durs[Math.ceil(mid)]) / 2;
  return Math.round(med / 5) * 5;
}
