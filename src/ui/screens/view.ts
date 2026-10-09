/** Страница по ссылке-приглашению: только смотреть, без регистрации. */
import { html, TemplateResult } from 'lit-html';
import { go } from '../../app/router';
import { decodeSnapshot, viewFromSnapshot } from '../../app/share';
import { getState } from '../../store/store';
import { icon } from '../icons';
import { SANS, SERIF } from '../parts';
import { topGlow } from '../shell';
import { viewerCardView } from './family';
import { logoMark } from './splash';

const leave = (): void => go(getState().onboarded ? '/' : '/welcome');

export function viewScreen(code: string, t: number): TemplateResult {
  const snap = decodeSnapshot(code);
  const body = snap
    ? (() => {
        const v = viewFromSnapshot(snap, t);
        return html`
          <div style="flex:none;padding:24px 20px 0;display:flex;align-items:center;gap:12px">
            <div style="flex:none">${logoMark(44)}</div>
            <div style="display:flex;flex-direction:column;gap:1px"><div style="font-size:12px;font-weight:700;letter-spacing:0.1em;color:#5A5F7A">ТОЛЬКО СМОТРИТЕ</div><div style="font-size:15px;font-weight:600">Дрёма — знает, когда спать</div></div>
          </div>
          <div style="flex:none;padding:22px 20px 0"><h1 style="margin:0;font-family:${SERIF};font-weight:400;font-size:32px;line-height:1.2;letter-spacing:-0.01em">Как сейчас ${snap.n}</h1></div>
          <div style="margin-top:6px">${viewerCardView(v.model)}</div>
          ${v.facts.length
            ? html`<div style="flex:none;margin:14px 20px 0;border-radius:24px;background:#FFFFFF;padding:4px 18px;display:flex;flex-direction:column;box-shadow:0 1px 2px rgba(20,23,46,0.04),0 16px 36px -22px rgba(34,31,102,0.3)">
                ${v.facts.map((f, i) => html`<div style="min-height:56px;display:flex;align-items:center;justify-content:space-between;gap:12px;${i < v.facts.length - 1 ? 'border-bottom:1px solid #E9ECF5' : ''}"><span style="font-size:15px;font-weight:500;color:#5A5F7A">${f.label}</span><span style="font-size:17px;font-weight:700">${f.value}</span></div>`)}
              </div>`
            : ''}
          <div role="note" style="flex:none;margin:14px 20px 0;font-size:13px;font-weight:500;line-height:19px;color:#5A5F7A">
            ${v.stale ? html`<strong style="color:#A8341F">Данные устарели.</strong> ` : ''}Снимок сделан в ${v.takenAt}; время на карточке считается само. Свежие записи придут с новой ссылкой.
          </div>`;
      })()
    : html`
        <div style="flex:none;padding:40px 20px 0;display:flex;flex-direction:column;gap:12px">
          <h1 style="margin:0;font-family:${SERIF};font-weight:400;font-size:32px;line-height:1.2">Ссылка не открылась</h1>
          <div style="font-size:15px;font-weight:500;line-height:21px;color:#5A5F7A">Похоже, ссылка обрезалась при пересылке. Попросите отправить её ещё раз.</div>
        </div>`;

  return html`
    <div class="plain" style="position:relative;width:100%;height:100%;background:#F1F3FB;overflow:hidden;font-family:${SANS};color:#14172E">
      ${topGlow(0.14)}
      <div class="scroll stack" style="position:relative;height:100%;display:flex;flex-direction:column;padding-bottom:24px">
        ${body}
        <div style="flex:none;margin:22px 20px 0">
          <button type="button" @click=${leave} style="width:100%;height:56px;border:1.5px solid #D7DAEC;border-radius:28px;background:#FFFFFF;color:#14172E;font-family:${SANS};font-size:16px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px">
            ${icon('moon', { size: 20 })}${getState().onboarded ? 'Открыть мою Дрёму' : 'Завести свою Дрёму'}
          </button>
        </div>
      </div>
    </div>`;
}
