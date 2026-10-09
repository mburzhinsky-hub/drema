/**
 * Напоминания. Чистая логика: какие напоминания пора показать сейчас.
 * Показ (уведомление браузера или всплывашка) — в app/reminders.ts.
 *
 * Важно: без сервера напоминание сработает, только пока приложение открыто или свёрнуто
 * (страница жива). Когда приложение закрыто, браузер не даст запустить код по времени.
 */
import { ageInfo } from './age';
import { feedsOf, lastFeed, typicalFeedInterval } from './feed';
import { fmtDur } from './format';
import { Norm, normFor } from './norms';
import { Ctx, computeForecast, computeOutlook } from './predict';
import { activeSleep, sleepKind, sleepsOf } from './sleep';
import { MIN, hm } from './time';

export interface Reminder {
  id: string;
  kind: 'window' | 'feed' | 'wake';
  /** С какого момента показывать. */
  at: number;
  /** После этого момента напоминание не нужно. */
  expires: number;
  title: string;
  body: string;
}

/** Через сколько после «пора» напоминание теряет смысл. */
const FEED_LIFETIME_MIN = 45;
/** Запас после обычного конца сна, прежде чем напомнить разбудить. */
export const WAKE_GRACE_MIN = 15;

export function plannedReminders(ctx: Ctx): Reminder[] {
  const { child, settings, now } = ctx;
  const r = settings.reminders;
  const out: Reminder[] = [];
  const sleeps = sleepsOf(ctx.events, child.id);
  const active = activeSleep(sleeps);

  if (!active) {
    const f = computeForecast(ctx);
    if (r.window.on && f && f.mode === 'nap') {
      out.push({
        id: `window:${f.wakeAt}`,
        kind: 'window',
        at: f.windowStart - r.window.lead * MIN,
        expires: f.windowEnd,
        title: `${child.name}: скоро окно сна`,
        body: `Окно сна с ${hm(f.windowStart)} до ${hm(f.windowEnd)}, прогноз ${hm(f.predictedAt)}.`,
      });
    }
    if (r.window.on && f && f.mode === 'bedtime') {
      out.push({
        id: `window:${f.wakeAt}`,
        kind: 'window',
        at: f.windowStart - r.window.lead * MIN,
        expires: f.windowEnd,
        title: `${child.name}: скоро ночной сон`,
        body: `Отбой около ${hm(f.predictedAt)}.`,
      });
    }
    if (r.feed.on) {
      const feeds = feedsOf(ctx.events, child.id);
      const lf = lastFeed(feeds, now);
      if (lf) {
        const typ = typicalFeedInterval(feeds, normOf(ctx), now);
        const at = lf.t + typ.minutes * MIN;
        out.push({
          id: `feed:${lf.t}`,
          kind: 'feed',
          at,
          expires: at + FEED_LIFETIME_MIN * MIN,
          title: `${child.name}: пора кормить?`,
          body: `С последнего кормления прошло ${fmtDur(typ.minutes)} — обычный промежуток.`,
        });
      }
    }
  } else if (r.wake.on && sleepKind(active) === 'nap') {
    const out2 = computeOutlook(ctx, active);
    if (out2.range) {
      const at = active.t + (out2.range[1] + WAKE_GRACE_MIN) * MIN;
      out.push({
        id: `wake:${active.t}`,
        kind: 'wake',
        at,
        expires: at + 120 * MIN,
        title: `${child.name} спит дольше обычного`,
        body: `Сон идёт уже ${fmtDur(Math.floor((now - active.t) / MIN))}, обычно до ${fmtDur(out2.range[1])}.`,
      });
    }
  }
  return out;
}

const normOf = (ctx: Ctx): Norm => normFor(ageInfo(ctx.child.birth, ctx.now).months);

/** Напоминания, которые пора показать сейчас и которых ещё не показывали. */
export function dueReminders(ctx: Ctx, fired: ReadonlySet<string>): Reminder[] {
  return plannedReminders(ctx).filter((r) => ctx.now >= r.at && ctx.now < r.expires && !fired.has(r.id));
}
