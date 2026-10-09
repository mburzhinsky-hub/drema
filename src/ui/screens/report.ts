import { html, svg, TemplateResult } from 'lit-html';
import { fmtPeriod, weekdayShort } from '../../engine/format';
import { PeriodStats, barHeight, fmtHours, fmtPerDay } from '../../engine/week';
import { icon } from '../icons';
import { SANS, SERIF, durText, stars } from '../parts';
import { cardRings, navBar, topGlow } from '../shell';

export interface ReportActions {
  setRange(r: 'week' | 'month'): void;
  setQuestion(q: string): void;
  send(): void;
  pdf(): void;
}

export function reportScreen(ps: PeriodStats, range: 'week' | 'month', question: string, a: ReportActions): TemplateResult {
  const tab = (key: 'week' | 'month', label: string): TemplateResult => {
    const on = range === key;
    return html`<button type="button" @click=${() => a.setRange(key)} aria-pressed=${on ? 'true' : 'false'} style="flex:1;border:0;border-radius:20px;background:${on ? '#FFFFFF' : 'transparent'};color:${on ? '#14172E' : '#5A5F7A'};font-family:${SANS};font-size:15px;font-weight:${on ? 700 : 600};${on ? 'box-shadow:0 2px 8px -2px rgba(20,23,46,.2)' : ''}">${label}</button>`;
  };

  const monthly = range === 'month';
  const has = ps.basis.length > 0;
  const gap = monthly ? 3 : 10;
  const chartAria = has
    ? `Сон по дням${monthly ? '' : ' недели'}, от ${fmtHours(ps.minSleepMin)} до ${fmtHours(ps.maxSleepMin)} часа`
    : 'Нет данных о сне';

  return html`
    <div style="position:relative;width:100%;height:100%;box-sizing:border-box;background:#F1F3FB;overflow:hidden;font-family:${SANS};color:#14172E">
      ${topGlow(0.14)}
      <div style="position:relative;height:100%;display:flex;flex-direction:column">
        <div class="scroll" style="flex:1;min-height:0;display:flex;flex-direction:column">
          <div style="flex:none;padding:28px 20px 0;display:flex;flex-direction:column;gap:4px">
            <h1 style="margin:0;font-family:${SERIF};font-weight:400;font-size:32px;line-height:1.2;letter-spacing:-0.01em">Выписка</h1>
            <div style="font-size:15px;font-weight:500;color:#5A5F7A">для педиатра · ${fmtPeriod(ps.from, ps.to)}</div>
          </div>

          <div role="group" aria-label="Период" style="flex:none;margin:14px 20px 0;height:48px;box-sizing:border-box;border-radius:24px;background:#E4E7F4;padding:4px;display:flex;gap:4px">${tab('week', 'Неделя')}${tab('month', 'Месяц')}</div>

          <div style="flex:none;position:relative;margin:12px 20px 0;box-sizing:border-box;border-radius:32px;background:#221F66;color:#FFFFFF;padding:18px;overflow:hidden;display:flex;flex-direction:column;gap:14px;box-shadow:0 26px 46px -26px rgba(34,31,102,0.75)">
            ${cardRings(350, 180, svg`<circle cx="330" cy="10" r="110" stroke="#FFFFFF" stroke-opacity="0.06" stroke-width="2"/><circle cx="330" cy="10" r="70" stroke="#FFFFFF" stroke-opacity="0.06" stroke-width="2"/>${stars([[190, 24, 1.2, 0.6]])}`)}
            <div style="position:relative;display:flex;flex-direction:column;gap:6px">
              <div style="font-size:12px;font-weight:700;letter-spacing:0.1em;color:#B3B1FF">СОН ЗА СУТКИ, В СРЕДНЕМ</div>
              <div style="font-family:${SERIF};font-weight:400;font-size:35px;line-height:1.1;letter-spacing:-0.01em;white-space:nowrap;text-shadow:0 0 24px rgba(179,177,255,0.5)">${has ? durText(ps.avgSleepMin, true) : '—'}</div>
            </div>
            <div role="img" aria-label=${chartAria} style="position:relative;display:flex;align-items:flex-end;gap:${gap}px;height:110px">
              ${ps.days.map((ds) => html`<div style="flex:1;height:${barHeight(ds.sleepMin)}px;border-radius:${monthly ? '6px 6px 3px 3px' : '12px 12px 6px 6px'};${ds.isToday ? 'background:#FFD66B;box-shadow:0 0 18px rgba(255,214,107,0.55)' : 'background:rgba(179,177,255,0.5)'}"></div>`)}
            </div>
            <div style="position:relative;display:flex;gap:${gap}px;font-size:12px;font-weight:500;color:#B3B1FF;text-align:center;margin-top:-8px">
              ${ps.days.map((ds, i) => {
                const label = monthly ? (i % 5 === 4 || ds.isToday ? String(new Date(ds.dayStart).getDate()) : '') : weekdayShort(ds.dayStart);
                return html`<span style="flex:1;${ds.isToday ? 'color:#FFD66B;font-weight:700' : ''}${monthly ? ';font-size:11px;min-width:0;overflow:visible;white-space:nowrap' : ''}">${label}</span>`;
              })}
            </div>
          </div>

          <div style="flex:none;margin:12px 20px 0;box-sizing:border-box;border-radius:28px;background:#FFFFFF;padding:6px 18px;display:flex;flex-direction:column;box-shadow:0 1px 2px rgba(20,23,46,0.04),0 16px 36px -22px rgba(34,31,102,0.3)">
            <div style="min-height:56px;display:flex;align-items:center;gap:14px;border-bottom:1px solid #E9ECF5">
              <div style="width:36px;height:36px;border-radius:12px;background:#FDE8E2;color:#A8341F;display:flex;align-items:center;justify-content:center;flex:none">${icon('bottle', { size: 20, fo: 0.22 })}</div>
              <div style="flex:1;font-size:16px;font-weight:500">Кормлений в сутки</div>
              <div style="font-family:${SERIF};font-size:21px;font-weight:400;letter-spacing:0">${has ? fmtPerDay(ps.avgFeeds) : '—'}</div>
            </div>
            <div style="min-height:56px;display:flex;align-items:center;gap:14px">
              <div style="width:36px;height:36px;border-radius:12px;background:#DDF1E8;color:#1E6B4C;display:flex;align-items:center;justify-content:center;flex:none">${icon('diaper', { size: 20, fo: 0.22 })}</div>
              <div style="flex:1;font-size:16px;font-weight:500">Подгузников в сутки</div>
              <div style="font-family:${SERIF};font-size:21px;font-weight:400;letter-spacing:0">${has ? fmtPerDay(ps.avgDiapers) : '—'}</div>
            </div>
          </div>

          <div style="flex:none;margin:12px 20px 0;display:flex;flex-direction:column;gap:6px">
            <label for="q" style="font-size:12px;font-weight:700;letter-spacing:0.1em;color:#5A5F7A">ВОПРОС ВРАЧУ</label>
            <div style="position:relative">
              <input id="q" type="text" placeholder="Что хотите спросить?" .value=${question} @input=${(e: Event) => a.setQuestion((e.target as HTMLInputElement).value)} style="width:100%;box-sizing:border-box;height:52px;border:1.5px solid #D7DAEC;border-radius:18px;background:#FFFFFF;padding:0 48px 0 16px;font-family:${SANS};font-size:16px;color:#14172E;outline:none">
              ${icon('pencil', { size: 20, stroke: '#5A5F7A', style: 'position:absolute;right:16px;top:16px' })}
            </div>
          </div>

          <div style="flex:none;margin:16px 20px 16px;display:flex;gap:10px">
            <button type="button" @click=${a.send} style="flex:1;height:60px;border:0;border-radius:30px;background:#3F3CBB;color:#FFFFFF;font-family:${SANS};font-size:17px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:inset 0 1px 0 rgba(255,255,255,0.28),0 18px 28px -14px rgba(63,60,187,0.85)">
              ${icon('send', { size: 22, sw: 1.85, fo: 0.22 })}
              Отправить врачу
            </button>
            <button type="button" @click=${a.pdf} aria-label="Сохранить как PDF" style="width:96px;height:60px;border:0;border-radius:30px;background:#E6E6FB;color:#3F3CBB;font-family:${SANS};font-size:16px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:6px;padding:0;box-shadow:inset 0 1px 0 rgba(255,255,255,0.7)">
              ${icon('pdf', { size: 20 })}
              PDF
            </button>
          </div>
        </div>
        ${navBar('report')}
      </div>
    </div>`;
}

