import { html, svg, TemplateResult } from 'lit-html';
import { Backtest, Forecast } from '../../engine/predict';
import { Explanation } from '../../engine/explain';
import { hm } from '../../engine/time';
import { Derived } from '../../store/select';
import { icon } from '../icons';
import { SANS, SERIF, timeText, unit } from '../parts';
import { backLink, cardRings, topGlow } from '../shell';
import { href } from '../../app/router';

const reason = (ic: TemplateResult | ReturnType<typeof icon>, title: string, text: string, last: boolean): TemplateResult => html`
  <div style="min-height:68px;display:flex;align-items:center;gap:14px;${last ? '' : 'border-bottom:1px solid #E9ECF5'}">
    <div style="width:40px;height:40px;border-radius:14px;background:#E6E6FB;color:#3F3CBB;display:flex;align-items:center;justify-content:center;flex:none">${ic}</div>
    <div style="display:flex;flex-direction:column;gap:1px"><div style="font-size:16px;font-weight:600;line-height:21px">${title}</div><div style="font-size:14px;font-weight:400;line-height:19px;color:#5A5F7A">${text}</div></div>
  </div>`;

const dot = (on: boolean): TemplateResult =>
  on
    ? html`<span style="width:24px;height:24px;border-radius:12px;background:#3F3CBB;box-shadow:inset 0 1px 0 rgba(255,255,255,0.3),0 6px 10px -5px rgba(63,60,187,0.6)"></span>`
    : html`<span style="box-sizing:border-box;width:24px;height:24px;border-radius:12px;border:2px solid #C9C8F5"></span>`;

export function whyScreen(d: Derived, t: number, f: Forecast, ex: Explanation, bt: Backtest): TemplateResult {
  const scale = f.ringScaleMin;
  const pct = (min: number): number => (min / scale) * 100;
  const awake = Math.max(0, (t - f.wakeAt) / 60000);
  const startMin = (f.windowStart - f.wakeAt) / 60000;
  const endMin = (f.windowEnd - f.wakeAt) / 60000;
  const predMin = (f.predictedAt - f.wakeAt) / 60000;
  const pred = hm(f.predictedAt);

  const aria = `${d.w.tot} ${d.w.wokeShort} в ${hm(f.wakeAt)}, окно сна с ${hm(f.windowStart)} до ${hm(f.windowEnd)}, прогноз ${pred}`;

  return html`
    <div style="position:relative;width:100%;height:100%;box-sizing:border-box;background:#F1F3FB;display:flex;flex-direction:column;overflow:hidden;font-family:${SANS};color:#14172E">
      ${topGlow(0.14)}
      <div class="scroll" style="position:relative;flex:1;min-height:0;display:flex;flex-direction:column">
        <div style="position:relative;flex:none;padding:24px 20px 0;display:flex;flex-direction:column;gap:14px">
          ${backLink('/')}
          <h1 style="margin:0;font-family:${SERIF};font-weight:400;font-size:32px;line-height:1.2;letter-spacing:-0.01em">Почему ${timeText(pred, '#3F3CBB', false)}</h1>
        </div>

        <div style="position:relative;flex:none;margin:16px 20px 0;box-sizing:border-box;border-radius:32px;background:#221F66;color:#FFFFFF;padding:18px;overflow:hidden;display:flex;flex-direction:column;gap:12px;box-shadow:0 26px 46px -26px rgba(34,31,102,0.75)">
          ${cardRings(350, 170, svg`<circle cx="330" cy="10" r="110" stroke="#FFFFFF" stroke-opacity="0.06" stroke-width="2"/><circle cx="330" cy="10" r="70" stroke="#FFFFFF" stroke-opacity="0.06" stroke-width="2"/><circle cx="220" cy="26" r="1.2" fill="#FFFFFF" fill-opacity="0.6"/>`)}
          <div style="position:relative;font-size:12px;font-weight:700;letter-spacing:0.1em;color:#B3B1FF">БОДРСТВОВАНИЕ И ОКНО СНА</div>
          <div role="img" aria-label=${aria} style="position:relative;width:100%;height:52px">
            <div style="position:absolute;left:calc(${pct(predMin)}% - 20px);top:0;width:40px;text-align:center;font-size:14px;font-weight:700;color:#FFD66B">${pred}</div>
            <div style="position:absolute;left:0;top:28px;width:100%;height:18px;border-radius:9px;background:rgba(255,255,255,0.12)"></div>
            <div style="position:absolute;left:0;top:28px;width:${Math.min(100, pct(awake))}%;height:18px;border-radius:9px;background:#B3B1FF;box-shadow:0 0 14px rgba(179,177,255,0.6)"></div>
            <div style="position:absolute;left:${pct(startMin)}%;top:28px;width:${pct(endMin - startMin)}%;height:18px;border-radius:9px;background:#FFD66B;box-shadow:0 0 16px rgba(255,214,107,0.6)"></div>
            <div style="position:absolute;left:calc(${pct(predMin)}% - 2px);top:21px;width:4px;height:32px;border-radius:2px;background:#FFFFFF;box-shadow:0 0 10px rgba(255,255,255,0.9)"></div>
          </div>
          <div style="position:relative;width:100%;display:flex;justify-content:space-between;font-size:13px;font-weight:500;color:#C9C8F5"><span>${hm(f.wakeAt)} ${d.w.wokeShort}</span><span>окно ${hm(f.windowStart)} – ${hm(f.windowEnd)}</span></div>
        </div>

        <div style="position:relative;flex:none;margin:12px 20px 0;box-sizing:border-box;border-radius:28px;background:#FFFFFF;padding:6px 18px;display:flex;flex-direction:column;box-shadow:0 1px 2px rgba(20,23,46,0.04),0 16px 36px -22px rgba(34,31,102,0.3)">
          ${reason(icon('clock', { fo: 0.18 }), ex.ageTitle, ex.age, false)}
          ${reason(icon(f.basis.wakeKind === 'nap' ? 'moon' : 'sun', { fo: 0.18 }), ex.lastTitle, ex.last, false)}
          ${reason(icon('bars'), ex.rhythmTitle, ex.rhythm, true)}
        </div>

        <div style="position:relative;flex:none;margin:12px 20px 0;box-sizing:border-box;border-radius:28px;background:#FFFFFF;padding:18px;display:flex;flex-direction:column;gap:12px;box-shadow:0 1px 2px rgba(20,23,46,0.04),0 16px 36px -22px rgba(34,31,102,0.3)">
          <div style="display:flex;align-items:baseline;justify-content:space-between">
            <div style="font-size:12px;font-weight:700;letter-spacing:0.1em;color:#5A5F7A">ТОЧНОСТЬ ЗА НЕДЕЛЮ</div>
            ${bt.total >= 3
              ? html`<div style="font-family:${SERIF};font-weight:400;font-size:23px;letter-spacing:0;color:#3F3CBB">${bt.hits}${unit('из')}${bt.total}</div>`
              : ''}
          </div>
          ${bt.total >= 3
            ? html`<div role="img" aria-label="${bt.hits} из ${bt.total} прогнозов попали в окно сна" style="display:flex;gap:8px">${Array.from({ length: bt.total }, (_, i) => dot(i < bt.hits))}</div>
                <div style="font-size:14px;font-weight:400;color:#5A5F7A">Прогнозы, которые попали в окно сна</div>`
            : html`<div style="font-size:14px;font-weight:400;line-height:19px;color:#5A5F7A">Пока записано мало снов. Через несколько дней здесь появится точность: сколько прогнозов попало в окно.</div>`}
        </div>

        <div style="position:relative;flex:none;margin:12px 20px 0;display:flex;gap:10px;align-items:flex-start;color:#5A5F7A">
          ${icon('info', { size: 20, style: 'flex:none;margin-top:1px' })}
          <div style="font-size:13px;font-weight:400;line-height:18px">Это ориентир, а не рекомендация врача. Если сон вас тревожит, спросите педиатра.</div>
        </div>

        <div style="flex:1;min-height:16px"></div>

        <div style="position:relative;flex:none;padding:0 20px 32px">
          <a href=${href('/')} style="height:56px;box-sizing:border-box;border-radius:28px;background:#3F3CBB;color:#FFFFFF;text-decoration:none;font-size:17px;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:inset 0 1px 0 rgba(255,255,255,0.28),0 18px 28px -14px rgba(63,60,187,0.85)">Понятно</a>
        </div>
      </div>
    </div>`;
}
