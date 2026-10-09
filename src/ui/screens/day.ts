import { html, svg, TemplateResult } from 'lit-html';
import { RIBBON_W, TimelineRow, buildRibbon, expectedNapLength, sleepSplitIn, timelineRows } from '../../engine/day';
import { fmtDate, fmtDateLong, fmtDur, fmtPeriod, weekdayShort } from '../../engine/format';
import { periodStats, barHeight, DayStat } from '../../engine/week';
import { addDays, hm, startOfDay } from '../../engine/time';
import { Derived } from '../../store/select';
import { icon } from '../icons';
import { TYPE_STYLE } from '../palette';
import { SANS, SERIF, durText, stars } from '../parts';
import { cardRings, navBar, topGlow } from '../shell';

export interface DayActions {
  shift(days: number): void;
  setTab(tab: 'day' | 'week'): void;
  openRow(r: TimelineRow): void;
  pickDay(dayStart: number): void;
}

const WEEKDAYS_FULL = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

const pct = (px: number): string => `${((px / RIBBON_W) * 100).toFixed(4)}%`;

function dateHeader(dayStart: number, t: number, tab: 'day' | 'week', a: DayActions, canNext: boolean): TemplateResult {
  const today = startOfDay(t);
  const diff = Math.round((dayStart - today) / 86400000);
  const step = tab === 'week' ? 7 : 1;
  let title: string;
  let sub: string;
  if (tab === 'week') {
    title = diff === 0 ? 'Эта неделя' : 'Неделя';
    sub = fmtPeriod(addDays(dayStart, -6), dayStart);
  } else {
    title = diff === 0 ? 'Сегодня' : diff === -1 ? 'Вчера' : WEEKDAYS_FULL[new Date(dayStart).getDay()];
    sub = fmtDateLong(dayStart);
  }
  return html`
    <div style="flex:none;padding:24px 20px 0;display:flex;align-items:center;justify-content:space-between">
      <button type="button" @click=${() => a.shift(-step)} aria-label=${tab === 'week' ? 'Предыдущая неделя' : 'Предыдущий день'} style="width:44px;height:44px;border:1px solid #E1E4F1;border-radius:22px;background:#FFFFFF;color:#14172E;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 18px -12px rgba(34,31,102,0.35)">${icon('chevL')}</button>
      <div style="display:flex;flex-direction:column;align-items:center;gap:2px">
        <div style="font-family:${SERIF};font-weight:400;font-size:23px;line-height:1.2;letter-spacing:0">${title}</div>
        <div style="font-size:13px;font-weight:500;color:#5A5F7A">${sub}</div>
      </div>
      ${canNext
        ? html`<button type="button" @click=${() => a.shift(step)} aria-label=${tab === 'week' ? 'Следующая неделя' : 'Следующий день'} style="width:44px;height:44px;border:1px solid #E1E4F1;border-radius:22px;background:#FFFFFF;color:#14172E;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 18px -12px rgba(34,31,102,0.35)">${icon('chevR')}</button>`
        : html`<button type="button" aria-label=${tab === 'week' ? 'Следующая неделя' : 'Следующий день'} disabled style="width:44px;height:44px;border:1px solid #E1E4F1;border-radius:22px;background:#F1F3FB;color:#9AA0BA;display:flex;align-items:center;justify-content:center">${icon('chevR')}</button>`}
    </div>`;
}

function tabs(tab: 'day' | 'week', a: DayActions): TemplateResult {
  const b = (key: 'day' | 'week', label: string): TemplateResult => {
    const on = tab === key;
    return html`<button type="button" @click=${() => a.setTab(key)} aria-pressed=${on ? 'true' : 'false'} style="flex:1;border:0;border-radius:20px;background:${on ? '#FFFFFF' : 'transparent'};color:${on ? '#14172E' : '#5A5F7A'};font-family:${SANS};font-size:15px;font-weight:${on ? 700 : 600};${on ? 'box-shadow:0 2px 8px -2px rgba(20,23,46,.2)' : ''}">${label}</button>`;
  };
  return html`<div role="group" aria-label="Период" style="flex:none;margin:16px 20px 0;height:48px;box-sizing:border-box;border-radius:24px;background:#E4E7F4;padding:4px;display:flex;gap:4px">${b('day', 'День')}${b('week', 'Неделя')}</div>`;
}

function row(r: TimelineRow, first: boolean, a: DayActions): TemplateResult {
  const st = TYPE_STYLE[r.kind];
  return html`
    <button type="button" @click=${() => a.openRow(r)} style="position:relative;width:100%;height:56px;border:0;background:transparent;padding:0;display:flex;align-items:center;gap:12px;text-align:left;font-family:${SANS};color:#14172E">
      <div style="width:44px;font-size:15px;font-weight:${first ? 700 : 600};${first ? '' : 'color:#5A5F7A'}">${hm(r.t)}</div>
      <div style="width:36px;height:36px;border-radius:12px;background:${st.bg};color:${st.fg};display:flex;align-items:center;justify-content:center;flex:none">${icon(st.icon, { size: 20, fo: 0.22 })}</div>
      <div style="display:flex;flex-direction:column;gap:1px"><div style="font-size:16px;font-weight:600;line-height:21px">${r.title}</div>${r.sub ? html`<div style="font-size:13px;font-weight:500;line-height:18px;color:#5A5F7A">${r.sub}</div>` : ''}</div>
    </button>`;
}

let rowsMemo: { key: unknown[]; rows: TimelineRow[] } | null = null;
function rowsFor(d: Derived, dayStart: number, t: number): TimelineRow[] {
  const key = [d.events, d.settings, d.child, dayStart, Math.floor(t / 60000)];
  if (rowsMemo && rowsMemo.key.length === key.length && rowsMemo.key.every((x, i) => x === key[i])) return rowsMemo.rows;
  const rows = timelineRows({ ...d.ctx, now: t }, dayStart);
  rowsMemo = { key, rows };
  return rows;
}

function dayView(d: Derived, t: number, dayStart: number, a: DayActions): TemplateResult {
  const today = startOfDay(t);
  const isToday = dayStart === today;
  const split = sleepSplitIn(d.sleeps, dayStart, t);
  const fc = isToday && !d.active ? d.forecast : null;
  const expected = expectedNapLength(d.sleeps, t, Math.round((d.norm.napLen[0] + d.norm.napLen[1]) / 2 / 5) * 5);
  const ribbon = buildRibbon(d.sleeps, dayStart, t, fc, expected);
  const rows = rowsFor(d, dayStart, t);

  const right = isToday
    ? d.active
      ? html`<div style="font-size:12px;font-weight:500;color:#B3B1FF">Спит с</div><div style="font-size:17px;font-weight:700;color:#FFD66B">${hm(d.active.t)}</div>`
      : fc
        ? html`<div style="font-size:12px;font-weight:500;color:#B3B1FF">${fc.mode === 'bedtime' ? 'Ночной сон' : 'Следующий сон'}</div><div style="font-size:17px;font-weight:700;color:#FFD66B">≈ ${hm(fc.predictedAt)}</div>`
        : ''
    : html`<div style="font-size:12px;font-weight:500;color:#B3B1FF">Дневной сон</div><div style="font-size:17px;font-weight:700">${fmtDur(split.nap)}</div>`;

  return html`
    <div style="flex:none;position:relative;margin:12px 20px 0;box-sizing:border-box;border-radius:32px;background:#221F66;color:#FFFFFF;padding:18px 18px 16px;overflow:hidden;display:flex;flex-direction:column;gap:14px;box-shadow:0 26px 46px -26px rgba(34,31,102,0.75)">
      ${cardRings(350, 170, svg`<circle cx="330" cy="10" r="110" stroke="#FFFFFF" stroke-opacity="0.06" stroke-width="2"/><circle cx="330" cy="10" r="70" stroke="#FFFFFF" stroke-opacity="0.06" stroke-width="2"/>${stars([[205, 30, 1.2, 0.6], [170, 14, 1, 0.5]])}`)}
      <div style="position:relative;display:flex;align-items:flex-end;justify-content:space-between">
        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="font-size:12px;font-weight:700;letter-spacing:0.1em;color:#B3B1FF">${isToday ? 'СОН С ПОЛУНОЧИ' : 'СОН ЗА СУТКИ'}</div>
          <div style="font-family:${SERIF};font-weight:400;font-size:35px;line-height:1.1;letter-spacing:-0.01em;white-space:nowrap;text-shadow:0 0 24px rgba(179,177,255,0.5)">${durText(split.total, true)}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px">${right}</div>
      </div>
      <div style="position:relative;display:flex;flex-direction:column;gap:6px">
        <div role="img" aria-label=${ribbon.aria} style="position:relative;width:100%;height:30px">
          <div style="position:absolute;left:0;top:0;width:100%;height:30px;border-radius:10px;background:rgba(255,255,255,0.12)"></div>
          ${ribbon.segments.map((s) => {
            const rl = s.roundLeft ? '10px' : '6px';
            const rr = s.roundRight ? '10px' : '6px';
            return html`<div style="position:absolute;left:${pct(s.left)};top:0;width:${pct(s.width)};height:30px;background:#B3B1FF;border-radius:${rl} ${rr} ${rr} ${rl}"></div>`;
          })}
          ${ribbon.next
            ? html`<div style="position:absolute;left:${pct(ribbon.next.left)};top:0;width:${pct(ribbon.next.width)};height:30px;box-sizing:border-box;border:1.5px dashed #FFD66B;border-radius:6px;background:rgba(255,214,107,0.14)"></div>`
            : ''}
          ${ribbon.nowLeft !== null
            ? html`<div style="position:absolute;left:${pct(ribbon.nowLeft)};top:-5px;width:3px;height:40px;border-radius:2px;background:#FFD66B;box-shadow:0 0 10px rgba(255,214,107,0.9)"></div>`
            : ''}
        </div>
        <div style="width:100%;display:flex;justify-content:space-between;font-size:12px;font-weight:500;color:#B3B1FF"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
      </div>
    </div>

    <div style="flex:none;margin:14px 20px 8px;font-size:12px;font-weight:700;letter-spacing:0.1em;color:#5A5F7A">СОБЫТИЯ</div>
    ${rows.length
      ? html`<div style="flex:none;position:relative;margin:0 20px 16px;box-sizing:border-box;border-radius:28px;background:#FFFFFF;padding:6px 18px;display:flex;flex-direction:column;box-shadow:0 1px 2px rgba(20,23,46,0.04),0 16px 36px -22px rgba(34,31,102,0.3)">
          <div style="position:absolute;left:91px;top:34px;bottom:34px;width:2px;background:#E3E6F2"></div>
          ${rows.map((r, i) => row(r, i === 0, a))}
        </div>`
      : html`<div style="flex:none;margin:0 20px 16px;padding:22px 18px;border-radius:28px;background:#FFFFFF;font-size:14px;font-weight:500;line-height:20px;color:#5A5F7A;box-shadow:0 1px 2px rgba(20,23,46,0.04),0 16px 36px -22px rgba(34,31,102,0.3)">В этот день записей нет.</div>`}
  `;
}

function weekRow(ds: DayStat, a: DayActions): TemplateResult {
  const name = WEEKDAYS_FULL[new Date(ds.dayStart).getDay()];
  const sub = ds.tracked ? `${fmtDur(ds.sleepMin)} сна · кормлений ${ds.feeds} · подгузников ${ds.diapers}` : 'Записей нет';
  return html`
    <button type="button" @click=${() => a.pickDay(ds.dayStart)} style="width:100%;min-height:64px;border:0;border-bottom:1px solid #E9ECF5;background:transparent;padding:0;display:flex;align-items:center;gap:14px;text-align:left;font-family:${SANS};color:#14172E">
      <span style="width:40px;height:40px;border-radius:14px;background:${ds.isToday ? '#FFF0C2' : '#E6E6FB'};color:${ds.isToday ? '#6B4E00' : '#3F3CBB'};display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex:none">${weekdayShort(ds.dayStart)}</span>
      <span style="flex:1;display:flex;flex-direction:column;gap:1px"><span style="font-size:16px;font-weight:600;line-height:21px">${name}, ${fmtDate(ds.dayStart)}</span><span style="font-size:13px;font-weight:500;line-height:18px;color:#5A5F7A">${sub}</span></span>
      ${icon('chevR', { size: 18, stroke: '#5A5F7A' })}
    </button>`;
}

function weekView(d: Derived, t: number, lastDay: number, a: DayActions): TemplateResult {
  const ps = periodStats(d.events, d.child.id, lastDay, 7, t);
  const bars = ps.days.map((ds) => ({ ds, h: barHeight(ds.sleepMin) }));
  return html`
    <div style="flex:none;position:relative;margin:12px 20px 0;box-sizing:border-box;border-radius:32px;background:#221F66;color:#FFFFFF;padding:18px;overflow:hidden;display:flex;flex-direction:column;gap:14px;box-shadow:0 26px 46px -26px rgba(34,31,102,0.75)">
      ${cardRings(350, 180, svg`<circle cx="330" cy="10" r="110" stroke="#FFFFFF" stroke-opacity="0.06" stroke-width="2"/><circle cx="330" cy="10" r="70" stroke="#FFFFFF" stroke-opacity="0.06" stroke-width="2"/>${stars([[190, 24, 1.2, 0.6]])}`)}
      <div style="position:relative;display:flex;flex-direction:column;gap:6px">
        <div style="font-size:12px;font-weight:700;letter-spacing:0.1em;color:#B3B1FF">СОН ЗА СУТКИ, В СРЕДНЕМ</div>
        <div style="font-family:${SERIF};font-weight:400;font-size:35px;line-height:1.1;letter-spacing:-0.01em;white-space:nowrap;text-shadow:0 0 24px rgba(179,177,255,0.5)">${ps.basis.length ? durText(ps.avgSleepMin, true) : '—'}</div>
      </div>
      <div style="position:relative;display:flex;align-items:flex-end;gap:10px;height:110px">
        ${bars.map(({ ds, h }) => html`<button type="button" @click=${() => a.pickDay(ds.dayStart)} aria-label="${weekdayShort(ds.dayStart)}: ${fmtDur(ds.sleepMin)}" style="flex:1;height:${Math.max(h, 4)}px;border:0;padding:0;border-radius:12px 12px 6px 6px;background:${ds.isToday ? '#FFD66B' : 'rgba(179,177,255,0.5)'};${ds.isToday ? 'box-shadow:0 0 18px rgba(255,214,107,0.55)' : ''}"></button>`)}
      </div>
      <div style="position:relative;display:flex;gap:10px;font-size:12px;font-weight:500;color:#B3B1FF;text-align:center;margin-top:-8px">
        ${bars.map(({ ds }) => html`<span style="flex:1;${ds.isToday ? 'color:#FFD66B;font-weight:700' : ''}">${weekdayShort(ds.dayStart)}</span>`)}
      </div>
    </div>
    <div style="flex:none;margin:14px 20px 8px;font-size:12px;font-weight:700;letter-spacing:0.1em;color:#5A5F7A">ПО ДНЯМ</div>
    <div style="flex:none;margin:0 20px 16px;box-sizing:border-box;border-radius:28px;background:#FFFFFF;padding:0 18px;display:flex;flex-direction:column;box-shadow:0 1px 2px rgba(20,23,46,0.04),0 16px 36px -22px rgba(34,31,102,0.3)">
      ${[...ps.days].reverse().map((ds) => weekRow(ds, a))}
    </div>`;
}

export function dayScreen(d: Derived, t: number, offset: number, tab: 'day' | 'week', a: DayActions): TemplateResult {
  const dayStart = addDays(startOfDay(t), offset);
  return html`
    <div style="position:relative;width:100%;height:100%;box-sizing:border-box;background:#F1F3FB;overflow:hidden;font-family:${SANS};color:#14172E">
      ${topGlow(0.14)}
      <div style="position:relative;height:100%;display:flex;flex-direction:column">
        <div class="scroll" style="flex:1;min-height:0;display:flex;flex-direction:column">
          ${dateHeader(dayStart, t, tab, a, offset < 0)}
          ${tabs(tab, a)}
          ${tab === 'day' ? dayView(d, t, dayStart, a) : weekView(d, t, dayStart, a)}
        </div>
        ${navBar('day')}
      </div>
    </div>`;
}
