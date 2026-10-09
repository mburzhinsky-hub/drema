import { html, svg, TemplateResult } from 'lit-html';
import { fmtDur, fmtDurWords, fmtDurWordsGen, fmtTimer } from '../../engine/format';
import { sleepRing } from '../../engine/geometry';
import { SleepEvent } from '../../engine/model';
import { computeOutlook } from '../../engine/predict';
import { hm } from '../../engine/time';
import { Derived } from '../../store/select';
import { icon } from '../icons';
import { SANS, SERIF, sparkle, timeText } from '../parts';
import { href } from '../../app/router';

export interface SleepingActions {
  wake(): void;
  editTime(): void;
}

export function sleepingScreen(d: Derived, s: SleepEvent, t: number, a: SleepingActions): TemplateResult {
  const out = computeOutlook(d.ctx, s);
  const night = out.kind === 'night';
  const elapsedMin = Math.max(0, (t - s.t) / 60000);
  const sec = Math.max(0, Math.floor((t - s.t) / 1000));
  const ring = sleepRing(elapsedMin, out.range, out.ringScaleMin);

  const aria = out.range
    ? `Кольцо сна: прошёл ${fmtDurWords(Math.floor(elapsedMin))}, обычный сон длится от ${fmtDurWordsGen(out.range[0])} до ${fmtDurWordsGen(out.range[1])}`
    : `Кольцо сна: прошло ${fmtDurWords(Math.floor(elapsedMin))}`;

  const chip = out.range
    ? `Обычно ${fmtDur(out.range[0])} – ${fmtDur(out.range[1])}`
    : out.nightTotalMin !== null
      ? `За ночь уже ${fmtDur(out.nightTotalMin)}`
      : '';

  return html`
    <div style="position:relative;width:100%;height:100%;box-sizing:border-box;background:#1A1850;overflow:hidden;display:flex;flex-direction:column;font-family:${SANS};color:#FFFFFF">
      <div style="position:absolute;left:0;top:0;width:100%;height:100%;background:radial-gradient(circle at 50% 44%, rgba(123,116,255,0.34) 0%, rgba(123,116,255,0) 62%)"></div>

      <svg width="390" height="844" viewBox="0 0 390 844" fill="none" aria-hidden="true" style="position:absolute;left:0;top:0">
        <circle cx="48" cy="150" r="1.3" fill="#FFFFFF" fill-opacity="0.7"/>
        <circle cx="332" cy="118" r="1.6" fill="#FFFFFF" fill-opacity="0.6"/>
        <circle cx="352" cy="262" r="1" fill="#FFFFFF" fill-opacity="0.5"/>
        <circle cx="22" cy="330" r="1" fill="#FFFFFF" fill-opacity="0.5"/>
        <circle cx="368" cy="470" r="1.3" fill="#FFFFFF" fill-opacity="0.45"/>
        <circle cx="36" cy="560" r="1.5" fill="#FFFFFF" fill-opacity="0.5"/>
        <circle cx="300" cy="640" r="1" fill="#FFFFFF" fill-opacity="0.4"/>
        ${sparkle(326, 195)}
      </svg>

      <div style="position:relative;flex:none;padding:24px 20px 0;display:flex;align-items:center;justify-content:space-between">
        <a href=${href('/')} aria-label="Назад" style="width:44px;height:44px;border-radius:22px;background:rgba(255,255,255,0.12);color:#FFFFFF;display:flex;align-items:center;justify-content:center;text-decoration:none">${icon('chevL')}</a>
        <div style="font-size:12px;font-weight:700;letter-spacing:0.1em;color:#B3B1FF">${night ? 'НОЧНОЙ СОН' : 'ДНЕВНОЙ СОН'}</div>
        <div style="width:44px"></div>
      </div>

      <div style="position:relative;flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;padding-bottom:12px">
        <div style="position:relative;width:320px;height:320px">
          <svg width="320" height="320" viewBox="0 0 300 300" fill="none" role="img" aria-label=${aria} style="display:block">
            ${out.range
              ? svg`<circle cx="150" cy="150" r="142" stroke="#FFD66B" stroke-width="5" stroke-linecap="round" stroke-dasharray="${ring.rangeLen} 892.2" stroke-dashoffset="-${ring.rangeOff}" transform="rotate(-90 150 150)" style="filter:drop-shadow(0 0 6px rgba(255,214,107,0.65))"/>`
              : ''}
            <circle cx="150" cy="150" r="128" stroke="#FFFFFF" stroke-opacity="0.12" stroke-width="16"/>
            <circle cx="150" cy="150" r="128" stroke="#B3B1FF" stroke-width="16" stroke-linecap="round" stroke-dasharray="${ring.elapsed} 804.3" transform="rotate(-90 150 150)" style="filter:drop-shadow(0 0 8px rgba(179,177,255,0.8))"/>
            <circle cx=${ring.knobX} cy=${ring.knobY} r="13" fill="#FFFFFF" style="filter:drop-shadow(0 0 8px rgba(255,255,255,0.85))"/>
            <circle cx=${ring.knobX} cy=${ring.knobY} r="5" fill="#3F3CBB"/>
          </svg>
          <div style="position:absolute;left:0;top:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px">
            ${icon('moon', { size: 30, stroke: '#FFD66B', fill: '#FFD66B', fo: 0.9, style: 'filter:drop-shadow(0 0 8px rgba(255,214,107,0.6))' })}
            <div style="margin-top:4px;font-size:15px;font-weight:500;color:#C9C8F5">${d.child.name} ${d.w.sleepsNow}</div>
            <div style="font-family:${SERIF};font-weight:400;font-size:48px;line-height:1.12;letter-spacing:-0.01em;text-shadow:0 0 28px rgba(179,177,255,0.6)">${timeText(fmtTimer(sec))}</div>
            <div style="font-size:14px;font-weight:500;color:#C9C8F5">${d.w.fellAsleep} в ${hm(s.t)}</div>
          </div>
        </div>

        ${chip
          ? html`<div style="display:flex;align-items:center;gap:10px;padding:9px 16px 9px 14px;border-radius:20px;background:rgba(255,255,255,0.10);font-size:14px;font-weight:500;color:#E4E3FB">
              <span style="width:8px;height:8px;border-radius:4px;background:#FFD66B;box-shadow:0 0 8px rgba(255,214,107,0.8)"></span>
              ${chip}
            </div>`
          : ''}
      </div>

      <div style="position:relative;flex:none;padding:0 20px 36px;display:flex;flex-direction:column;gap:8px">
        <button type="button" @click=${a.wake} style="height:64px;box-sizing:border-box;border:0;border-radius:32px;background:#FFFFFF;color:#1A1850;font-family:${SANS};font-size:18px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:inset 0 -3px 0 rgba(26,24,80,0.07),0 20px 36px -14px rgba(179,177,255,0.6)">
          ${icon('sun', { size: 24, fill: '#FFD66B', fo: 1, pstroke: '#1A1850' })}
          ${d.w.wokeUp}
        </button>
        <button type="button" @click=${a.editTime} style="height:52px;border:0;border-radius:26px;background:transparent;color:#E4E3FB;font-family:${SANS};font-size:16px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:8px">
          ${icon('pencil', { size: 20 })}
          Изменить время
        </button>
      </div>
    </div>`;
}

