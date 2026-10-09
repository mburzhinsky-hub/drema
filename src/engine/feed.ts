import { DremaEvent, FeedEvent, isFeed } from './model';
import { Norm } from './norms';
import { median, roundTo, clamp } from './stats';
import { DAY, MIN } from './time';
import { liveEvents } from './sleep';

export function feedsOf(events: DremaEvent[], childId: string): FeedEvent[] {
  return liveEvents(events, childId)
    .filter(isFeed)
    .sort((a, b) => a.t - b.t);
}

export function lastFeed(feeds: FeedEvent[], now: number): FeedEvent | undefined {
  for (let i = feeds.length - 1; i >= 0; i--) {
    if (feeds[i].t <= now) return feeds[i];
  }
  return undefined;
}

const RHYTHM_DAYS = 7;
const MIN_GAPS = 8;

export interface FeedInterval {
  minutes: number;
  /** Посчитано по истории ребёнка, а не взято из возрастной нормы. */
  personal: boolean;
}

/**
 * Обычный промежуток между кормлениями: медиана за неделю (если хватает данных),
 * иначе — возрастная норма. Промежутки короче получаса (докорм) и длиннее 8 часов (пропуск записи) не считаем.
 */
export function typicalFeedInterval(feeds: FeedEvent[], norm: Norm, now: number): FeedInterval {
  const since = now - RHYTHM_DAYS * DAY;
  const recent = feeds.filter((f) => f.t >= since && f.t <= now);
  const gaps: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    const g = (recent[i].t - recent[i - 1].t) / MIN;
    if (g >= 30 && g <= 480) gaps.push(g);
  }
  if (gaps.length >= MIN_GAPS) {
    return { minutes: clamp(roundTo(median(gaps), 5), 60, 360), personal: true };
  }
  return { minutes: norm.feedEvery, personal: false };
}

const ruMl = (n: number): string => `${Math.round(n)} мл`;

/** Подпись к кормлению: «Бутылочка · 120 мл». */
export function feedLabel(f: FeedEvent): string {
  switch (f.how) {
    case 'bottle':
      return f.ml ? `Бутылочка · ${ruMl(f.ml)}` : 'Бутылочка';
    case 'breast': {
      const parts: string[] = [];
      if (f.left) parts.push(`лев. ${f.left} мин`);
      if (f.right) parts.push(`прав. ${f.right} мин`);
      if (!parts.length && f.min) parts.push(`${f.min} мин`);
      return parts.length ? `Грудь · ${parts.join(', ')}` : 'Грудь';
    }
    case 'solid':
      return f.note ? `Прикорм · ${f.note}` : 'Прикорм';
  }
}

/** Сколько кормлений и миллилитров в промежутке [from, to). */
export function feedTotals(feeds: FeedEvent[], from: number, to: number): { count: number; ml: number } {
  let count = 0;
  let ml = 0;
  for (const f of feeds) {
    if (f.t >= from && f.t < to) {
      count += 1;
      ml += f.ml ?? 0;
    }
  }
  return { count, ml };
}
