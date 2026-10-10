import { html, TemplateResult } from 'lit-html';
import { homeRing } from '../../engine/geometry';
import { fmtDur, fmtDurWords, fmtRange } from '../../engine/format';
import { LiveForecast, computeOutlook, live } from '../../engine/predict';
import { RecentItem, recentItems } from '../../engine/day';
import { feedLabel } from '../../engine/feed';
import { eventSub, eventTitle } from '../../engine/day';
import { DremaEvent, FeedEvent, SleepEvent } from '../../engine/model';
import { sleepKind } from '../../engine/sleep';
import { hm } from '../../engine/time';
import { fmtTimer } from '../../engine/format';
import { Derived } from '../../store/select';
import { icon } from '../icons';
import { SANS, SERIF, durText, sparkle, timeText } from '../parts';
import { TYPE_STYLE, StyleKey } from '../palette';
import { initial } from '../parts';
import { navBar, topGlow } from '../shell';
import { href } from '../../app/router';

export interface HomeActions {
  startSleep(): void;
  wake(): void;
  openFeed(): void;
  openDiaper(): void;
  openMore(): void;
  openChild(): void;
  openReminders(): void;
  openEvent(e: DremaEvent): void;
}

const card =
  'flex:none;position:relative;margin:6px 20px 0;box-sizing:border-box;border-radius:36px;background:#221F66;color:#FFFFFF;padding:14px 18px 18px;overflow:hidden;box-shadow:0 26px 48px -24px rgba(34,31,102,0.75)';

const cardDecor = (): TemplateResult => html`
  <svg width="350" height="368" viewBox="0 0 350 368" fill="none" aria-hidden="true" style="position:absolute;right:0;top:0">
    <circle cx="330" cy="30" r="150" stroke="#FFFFFF" stroke-opacity="0.06" stroke-width="2"/>
    <circle cx="330" cy="30" r="100" stroke="#FFFFFF" stroke-opacity="0.06" stroke-width="2"/>
    <circle cx="40" cy="70" r="1.3" fill="#FFFFFF" fill-opacity="0.7"/>
    <circle cx="302" cy="108" r="1.5" fill="#FFFFFF" fill-opacity="0.6"/>
    <circle cx="322" cy="214" r="1" fill="#FFFFFF" fill-opacity="0.5"/>
    <circle cx="28" cy="190" r="1" fill="#FFFFFF" fill-opacity="0.5"/>
    <circle cx="60" cy="318" r="1.2" fill="#FFFFFF" fill-opacity="0.4"/>
    ${sparkle(310, 76)}
  </svg>`;

function header(d: Derived, a: HomeActions): TemplateResult {
  return html`
    <div style="flex:none;display:flex;align-items:center;justify-content:space-between;padding:24px 20px 4px">
      <button type="button" @click=${a.openChild} aria-label="Выбрать ребёнка" style="min-width:0;border:0;background:transparent;padding:0;min-height:44px;display:flex;align-items:center;gap:12px;font-family:${SANS};color:#14172E;text-align:left">
        <span style="position:relative;flex:none;width:44px;height:44px;border-radius:22px;background:#E6E6FB;color:#3F3CBB;display:flex;align-items:center;justify-content:center;font-family:${SERIF};font-weight:400;font-size:20px">${initial(d.child.name)}<span style="position:absolute;right:-1px;bottom:-1px;width:14px;height:14px;box-sizing:border-box;border-radius:7px;background:#FFD66B;border:2.5px solid #F1F3FB"></span></span>
        <span style="min-width:0;display:flex;flex-direction:column;gap:1px"><span style="font-size:17px;font-weight:700;line-height:22px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.child.name}</span><span style="font-size:13px;font-weight:500;line-height:18px;color:#5A5F7A;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.age.label}</span></span>
        <span style="flex:none;display:flex">${icon('chevD', { size: 18, stroke: '#5A5F7A' })}</span>
      </button>
      <button type="button" @click=${a.openReminders} aria-label="Напоминания" style="flex:none;width:44px;height:44px;border:1px solid #E1E4F1;border-radius:22px;background:#FFFFFF;color:#14172E;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 18px -12px rgba(34,31,102,0.35)">${icon('bell')}</button>
    </div>`;
}

/** Основная карточка: прогноз и кольцо бодрствования. */
function forecastCard(lf: LiveForecast): TemplateResult {
  const f = lf;
  const scale = f.ringScaleMin;
  const startMin = (f.windowStart - f.wakeAt) / 60000;
  const endMin = (f.windowEnd - f.wakeAt) / 60000;
  const ring = homeRing(f.awakeMin, startMin, endMin, scale);
  const hmPred = hm(f.predictedAt);
  const awakeShown = Math.floor(f.awakeMin + 1e-6);
  const chip =
    f.status === 'before'
      ? `через ${fmtDur(Math.ceil(f.minutesTo - 1e-6))}`
      : f.status === 'in'
        ? 'самое время'
        : 'окно уже закончилось';
  const caption = f.mode === 'bedtime' ? 'Ночной сон' : 'Следующий сон';
  const aria = `Кольцо бодрствования: прошло ${fmtDurWords(awakeShown)}, окно сна с ${hm(f.windowStart)} до ${hm(f.windowEnd)}`;
  return html`
    <div style=${card}>
      ${cardDecor()}
      <div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:6px">
        <div style="width:100%;display:flex;align-items:center;justify-content:space-between">
          <div style="font-size:12px;font-weight:700;letter-spacing:0.1em;color:#B3B1FF">ПРОГНОЗ СНА</div>
          <a href=${href('/why')} style="min-height:44px;box-sizing:border-box;padding:0 12px 0 16px;border-radius:22px;background:rgba(255,255,255,0.14);color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;display:flex;align-items:center;gap:4px">Почему так?
            ${icon('chevR', { size: 16, sw: 2 })}
          </a>
        </div>

        <div style="position:relative;width:224px;height:224px">
          <svg width="224" height="224" viewBox="0 0 260 260" fill="none" role="img" aria-label=${aria} style="display:block">
            <circle cx="130" cy="130" r="124" stroke="#FFFFFF" stroke-opacity="0.22" stroke-width="6" stroke-dasharray="1.8 14.82" transform="rotate(-90 130 130)"/>
            <circle cx="130" cy="130" r="108" stroke="#FFFFFF" stroke-opacity="0.12" stroke-width="16"/>
            <circle cx="130" cy="130" r="108" stroke="#B3B1FF" stroke-width="16" stroke-linecap="round" stroke-dasharray="${ring.elapsed} 678.6" transform="rotate(-90 130 130)" style="filter:drop-shadow(0 0 7px rgba(179,177,255,0.75))"/>
            <circle cx="130" cy="130" r="108" stroke="#FFD66B" stroke-width="16" stroke-linecap="round" stroke-dasharray="${ring.windowLen} 678.6" stroke-dashoffset="-${ring.windowOff}" transform="rotate(-90 130 130)" style="filter:drop-shadow(0 0 9px rgba(255,214,107,0.7))"/>
            <circle cx=${ring.knobX} cy=${ring.knobY} r="13" fill="#FFFFFF" style="filter:drop-shadow(0 0 8px rgba(255,255,255,0.85))"/>
            <circle cx=${ring.knobX} cy=${ring.knobY} r="5" fill="#3F3CBB"/>
          </svg>
          <div style="position:absolute;left:0;top:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px">
            <div style="font-size:13px;font-weight:500;color:#C9C8F5">${caption}</div>
            <div style="font-family:${SERIF};font-weight:400;font-size:57px;line-height:1.08;letter-spacing:-0.01em;text-shadow:0 0 26px rgba(179,177,255,0.55)">${timeText(hmPred)}</div>
            <div style="margin-top:4px;padding:5px 12px;border-radius:14px;background:rgba(255,214,107,0.18);border:1px solid rgba(255,214,107,0.42);color:#FFD66B;font-size:13px;font-weight:700">${chip}</div>
          </div>
        </div>

        <div style="width:100%;display:flex;align-items:stretch;margin-top:4px">
          <div style="flex:1;display:flex;flex-direction:column;gap:2px;align-items:center"><div style="font-size:12px;font-weight:500;color:#B3B1FF">Бодрствует</div><div style="font-size:17px;font-weight:700">${fmtDur(awakeShown)}</div></div>
          <div style="width:1px;background:rgba(255,255,255,0.18)"></div>
          <div style="flex:1;display:flex;flex-direction:column;gap:2px;align-items:center"><div style="font-size:12px;font-weight:500;color:#B3B1FF">Окно сна</div><div style="font-size:17px;font-weight:700">${hm(f.windowStart)} – ${hm(f.windowEnd)}</div></div>
        </div>
      </div>
    </div>`;
}

/** Малышка спит: карточка ведёт на экран сна. */
function sleepingCard(d: Derived, s: SleepEvent, t: number): TemplateResult {
  const out = computeOutlook(d.ctx, s);
  const sec = Math.max(0, Math.floor((t - s.t) / 1000));
  const range = out.range ? `Обычно ${fmtRange2(out.range)}` : out.nightTotalMin !== null ? `За ночь уже ${fmtDur(out.nightTotalMin)}` : '';
  const title = `${d.child.name} ${d.w.sleepsNow}`;
  return html`
    <a href=${href('/sleeping')} style="${card};display:block;text-decoration:none;color:#FFFFFF;min-height:326px">
      ${cardDecor()}
      <div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:6px">
        <div style="width:100%;display:flex;align-items:center;justify-content:space-between">
          <div style="font-size:12px;font-weight:700;letter-spacing:0.1em;color:#B3B1FF">${sleepKind(s) === 'night' ? 'НОЧНОЙ СОН' : 'ДНЕВНОЙ СОН'}</div>
          <div style="min-height:44px;display:flex;align-items:center;gap:4px;font-size:14px;font-weight:600;color:#C9C8F5">Открыть ${icon('chevR', { size: 16, sw: 2 })}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:18px 0 8px">
          ${icon('moon', { size: 30, stroke: '#FFD66B', fill: '#FFD66B', fo: 0.9, style: 'filter:drop-shadow(0 0 8px rgba(255,214,107,0.6))' })}
          <div style="margin-top:4px;font-size:15px;font-weight:500;color:#C9C8F5">${title}</div>
          <div style="font-family:${SERIF};font-weight:400;font-size:48px;line-height:1.12;letter-spacing:-0.01em;text-shadow:0 0 28px rgba(179,177,255,0.6)">${timeText(fmtTimer(sec))}</div>
          <div style="font-size:14px;font-weight:500;color:#C9C8F5">${d.w.fellAsleep} в ${hm(s.t)}</div>
        </div>
        ${range
          ? html`<div style="display:flex;align-items:center;gap:10px;padding:9px 16px 9px 14px;border-radius:20px;background:rgba(255,255,255,0.10);font-size:14px;font-weight:500;color:#E4E3FB"><span style="width:8px;height:8px;border-radius:4px;background:#FFD66B;box-shadow:0 0 8px rgba(255,214,107,0.8)"></span>${range}</div>`
          : ''}
      </div>
    </a>`;
}

function fmtRange2(r: [number, number]): string {
  return `${fmtDur(r[0])} – ${fmtDur(r[1])}`;
}

/** Нет прогноза: ночное пробуждение или ещё нет данных. */
function quietCard(d: Derived, t: number): TemplateResult {
  const night = d.ds.wakeKind === 'night-waking' && d.ds.last?.end;
  const range = fmtRange(d.norm.wake[0], d.norm.wake[1]);
  return html`
    <div style="${card};min-height:326px">
      ${cardDecor()}
      <div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:6px">
        <div style="width:100%;font-size:12px;font-weight:700;letter-spacing:0.1em;color:#B3B1FF;min-height:44px;display:flex;align-items:center">${night ? 'НОЧНОЕ ПРОБУЖДЕНИЕ' : 'ПРОГНОЗ СНА'}</div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:22px 8px 8px;text-align:center">
          ${icon(night ? 'moon' : 'clock', { size: 34, stroke: '#FFD66B', fill: '#FFD66B', fo: night ? 0.9 : 0.18, style: 'filter:drop-shadow(0 0 8px rgba(255,214,107,0.6))' })}
          ${night && d.ds.last?.end
            ? html`<div style="font-size:15px;font-weight:500;color:#C9C8F5">${d.child.name} не спит уже</div>
                <div style="font-family:${SERIF};font-weight:400;font-size:41px;line-height:1.15;letter-spacing:-0.01em;text-shadow:0 0 28px rgba(179,177,255,0.6)">${durText((t - d.ds.last.end) / 60000, false)}</div>
                <div style="font-size:14px;font-weight:500;color:#C9C8F5;max-width:260px">Прогноз появится после утреннего пробуждения.</div>`
            : html`<div style="font-family:${SERIF};font-weight:400;font-size:26px;line-height:1.2;max-width:280px">Прогноз появится после первого сна</div>
                <div style="font-size:14px;font-weight:500;color:#C9C8F5;max-width:280px">Нажмите «${d.w.fellAsleep}», когда ${d.w.baby} заснёт. В ${d.age.labelFor} окно бодрствования обычно ${range}.</div>`}
        </div>
      </div>
    </div>`;
}

function rowFor(item: RecentItem, a: HomeActions): TemplateResult {
  const e = item.event;
  let key: StyleKey = e.type;
  let title = eventTitle(e);
  let sub: string | undefined = eventSub(e);
  let right = hm(e.t);
  if (e.type === 'sleep') {
    const s = e as SleepEvent;
    const night = sleepKind(s) === 'night';
    title = night ? 'Ночной сон' : 'Дневной сон';
    if (s.end === null) {
      sub = 'Идёт сейчас';
      right = `с ${hm(s.t)}`;
    } else {
      sub = fmtDur((s.end - s.t) / 60000);
      right = `${hm(s.t)} – ${hm(s.end)}`;
    }
    key = 'sleep';
  }
  if (e.type === 'feed') sub = feedLabel(e as FeedEvent);
  const st = TYPE_STYLE[key];
  return html`
    <button type="button" @click=${() => a.openEvent(e)} style="width:100%;height:64px;box-sizing:border-box;border:0;border-radius:22px;background:#FFFFFF;padding:0 16px;display:flex;align-items:center;gap:12px;text-align:left;font-family:${SANS};color:#14172E;box-shadow:0 1px 2px rgba(20,23,46,0.04),0 14px 26px -18px rgba(34,31,102,0.35)">
      <span style="width:40px;height:40px;border-radius:14px;background:${st.bg};color:${st.fg};display:flex;align-items:center;justify-content:center;flex:none">${icon(st.icon)}</span>
      <span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:1px"><span style="font-size:16px;font-weight:600;line-height:21px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${title}</span>${sub ? html`<span style="font-size:13px;font-weight:500;line-height:18px;color:#5A5F7A;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${sub}</span>` : ''}</span>
      <span style="flex:none;white-space:nowrap;font-size:15px;font-weight:600;color:#5A5F7A">${right}</span>
    </button>`;
}

export function rowsFit(viewportH: number): number {
  return Math.max(2, Math.min(6, 2 + Math.floor((viewportH - 844 + 12) / 72)));
}

export function homeScreen(d: Derived, t: number, a: HomeActions, viewportH: number): TemplateResult {
  const sleeping = d.active;
  const lf = !sleeping && d.forecast ? live(d.forecast, t) : null;
  const items = recentItems(d.events, d.child.id, t, rowsFit(viewportH));

  const topCard = sleeping ? sleepingCard(d, sleeping, t) : lf ? forecastCard(lf) : quietCard(d, t);

  const primary = sleeping
    ? html`<button type="button" @click=${a.wake} style="height:96px;box-sizing:border-box;border:0;border-radius:28px;background:#FFD66B;color:#3B2D00;font-family:${SANS};text-align:left;padding:14px 16px;display:flex;flex-direction:column;align-items:flex-start;justify-content:space-between;box-shadow:inset 0 1px 0 rgba(255,255,255,0.5),0 18px 28px -14px rgba(255,214,107,0.9)">
        ${icon('sun', { size: 32, fo: 0.3 })}
        <span style="font-size:18px;font-weight:700">${d.w.wokeUp}</span>
      </button>`
    : html`<button type="button" @click=${a.startSleep} style="height:96px;box-sizing:border-box;border:0;border-radius:28px;background:#3F3CBB;color:#FFFFFF;font-family:${SANS};text-align:left;padding:14px 16px;display:flex;flex-direction:column;align-items:flex-start;justify-content:space-between;box-shadow:inset 0 1px 0 rgba(255,255,255,0.28),0 18px 28px -14px rgba(63,60,187,0.85)">
        ${icon('moon', { size: 32, fill: '#FFD66B', fo: 0.9, pstroke: '#FFFFFF' })}
        <span style="font-size:18px;font-weight:700">${d.w.fellAsleep}</span>
      </button>`;

  return html`
    <div style="position:relative;width:100%;height:100%;box-sizing:border-box;background:#F1F3FB;overflow:hidden;font-family:${SANS};color:#14172E">
      ${topGlow(0.16)}
      <div style="position:relative;height:100%;display:flex;flex-direction:column">
        <div class="scroll" style="flex:1;min-height:0;display:flex;flex-direction:column">
          ${header(d, a)}
          ${topCard}

          <div class="act-grid" style="flex:none;margin:14px 20px 0;display:grid;grid-template-columns:1.5fr 1fr 1fr;gap:10px">
            ${primary}
            <button type="button" @click=${a.openFeed} style="height:96px;box-sizing:border-box;border:0;border-radius:28px;background:#FDE8E2;color:#A8341F;font-family:${SANS};text-align:left;padding:14px 12px;display:flex;flex-direction:column;align-items:flex-start;justify-content:space-between;box-shadow:inset 0 1px 0 rgba(255,255,255,0.7)">
              ${icon('bottle', { size: 28 })}
              <span style="font-size:14px;font-weight:700">Еда</span>
            </button>
            <button type="button" @click=${a.openDiaper} style="height:96px;box-sizing:border-box;border:0;border-radius:28px;background:#DDF1E8;color:#1E6B4C;font-family:${SANS};text-align:left;padding:14px 12px;display:flex;flex-direction:column;align-items:flex-start;justify-content:space-between;box-shadow:inset 0 1px 0 rgba(255,255,255,0.7)">
              ${icon('diaper', { size: 28 })}
              <span style="font-size:14px;font-weight:700">Подгузник</span>
            </button>
          </div>

          <div style="flex:none;margin:12px 20px 0;display:flex;align-items:center;justify-content:space-between">
            <div style="font-size:12px;font-weight:700;letter-spacing:0.1em;color:#5A5F7A">СЕГОДНЯ</div>
            <button type="button" @click=${a.openMore} aria-label="Записать другое" style="width:44px;height:44px;border:0;border-radius:22px;background:#E6E6FB;color:#3F3CBB;display:flex;align-items:center;justify-content:center">${icon('plus', { sw: 2 })}</button>
          </div>
          <div style="flex:none;margin:0 20px 16px;display:flex;flex-direction:column;gap:8px">
            ${items.length
              ? items.map((i) => rowFor(i, a))
              : html`<div style="padding:18px 16px;border-radius:22px;background:#FFFFFF;font-size:14px;font-weight:500;color:#5A5F7A;line-height:20px;box-shadow:0 1px 2px rgba(20,23,46,0.04),0 14px 26px -18px rgba(34,31,102,0.35)">Записей пока нет. Нажмите «Еда» или «Подгузник» — они появятся здесь.</div>`}
          </div>
        </div>
        ${navBar('home')}
      </div>
    </div>`;
}
