import { html, TemplateResult } from 'lit-html';
import { icon } from '../icons';
import { SANS, SERIF } from '../parts';

export interface SplashActions {
  start(): void;
  login(): void;
}

export const wordmark = (size: number, shadow = true): TemplateResult => html`<span role="img" aria-label="Дрёма" style="font-family:${SERIF};font-size:${size}px;line-height:1.1;color:#FFFFFF;white-space:nowrap;display:inline-block;${shadow ? 'text-shadow:0 0 36px rgba(179,177,255,0.5)' : ''}">Др<span aria-hidden="true" style="position:relative;display:inline-block">е<i style="position:absolute;left:0.085em;top:0.245em;width:0.115em;height:0.115em;border-radius:50%;background:#FFD66B;box-shadow:0 0 0.16em rgba(255,214,107,0.9);"></i><i style="position:absolute;left:0.285em;top:0.245em;width:0.115em;height:0.115em;border-radius:50%;background:#FFD66B;box-shadow:0 0 0.16em rgba(255,214,107,0.9);"></i></span>ма</span>`;

export const logoMark = (box: number): TemplateResult => html`
  <div style="width:${box}px;height:${box}px;border-radius:${Math.round(box * 0.2857)}px;background:#3F3CBB;display:flex;align-items:center;justify-content:center;box-shadow:inset 0 1px 0 rgba(255,255,255,0.3),0 30px 60px -16px rgba(111,106,255,0.9)">
    <svg width=${Math.round(box * 0.625)} height=${Math.round(box * 0.625)} viewBox="0 0 64 64" fill="none" aria-hidden="true"><circle cx="32" cy="32" r="22" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round" stroke-dasharray="104.2 34"/><circle cx="47.6" cy="16.4" r="5.5" fill="#FFD66B"/></svg>
  </div>`;

export function splashScreen(a: SplashActions): TemplateResult {
  return html`
    <div style="position:relative;width:100%;height:100%;box-sizing:border-box;background:linear-gradient(180deg,#1A1850 0%,#221F66 58%,#2D2993 100%);overflow:hidden;display:flex;flex-direction:column;font-family:${SANS};color:#FFFFFF">
      <div style="position:absolute;left:0;top:0;width:100%;height:700px;background:radial-gradient(circle at 50% 38%, rgba(123,116,255,0.40) 0%, rgba(123,116,255,0) 60%)"></div>
      <svg width="390" height="844" viewBox="0 0 390 844" fill="none" aria-hidden="true" style="position:absolute;left:50%;margin-left:-195px;top:0">
        <circle cx="195" cy="330" r="120" stroke="#FFFFFF" stroke-opacity="0.08" stroke-width="1.5"/>
        <circle cx="195" cy="330" r="190" stroke="#FFFFFF" stroke-opacity="0.06" stroke-width="1.5"/>
        <circle cx="195" cy="330" r="260" stroke="#FFFFFF" stroke-opacity="0.045" stroke-width="1.5"/>
        <circle cx="195" cy="330" r="330" stroke="#FFFFFF" stroke-opacity="0.03" stroke-width="1.5"/>
        <circle cx="40" cy="90" r="1.3" fill="#FFFFFF" fill-opacity="0.7"/><circle cx="120" cy="60" r="1" fill="#FFFFFF" fill-opacity="0.5"/><circle cx="330" cy="110" r="1.6" fill="#FFFFFF" fill-opacity="0.6"/><circle cx="360" cy="230" r="1" fill="#FFFFFF" fill-opacity="0.5"/><circle cx="24" cy="300" r="1.1" fill="#FFFFFF" fill-opacity="0.5"/><circle cx="80" cy="430" r="1.4" fill="#FFFFFF" fill-opacity="0.5"/><circle cx="350" cy="470" r="1.2" fill="#FFFFFF" fill-opacity="0.45"/><circle cx="300" cy="600" r="1" fill="#FFFFFF" fill-opacity="0.4"/><circle cx="60" cy="640" r="1.3" fill="#FFFFFF" fill-opacity="0.4"/><circle cx="210" cy="40" r="1" fill="#FFFFFF" fill-opacity="0.5"/><circle cx="260" cy="150" r="1" fill="#FFFFFF" fill-opacity="0.4"/><circle cx="18" cy="520" r="1" fill="#FFFFFF" fill-opacity="0.4"/>
        <path d="M318 214Q318 222 326 222Q318 222 318 230Q318 222 310 222Q318 222 318 214Z" fill="#FFD66B"/>
      </svg>
      <div style="position:relative;flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;padding-top:40px">
        ${logoMark(112)}
        <div style="display:flex;flex-direction:column;align-items:center;gap:8px">
          ${wordmark(88)}
          <div style="font-size:18px;font-weight:600;color:#C9C8F5">Знает, когда спать</div>
        </div>
      </div>
      <div style="position:relative;flex:none;padding:0 20px 40px;display:flex;flex-direction:column;gap:6px">
        <button type="button" @click=${a.start} style="height:64px;box-sizing:border-box;border:0;border-radius:32px;background:#FFFFFF;color:#1A1850;font-family:${SANS};font-size:18px;font-weight:800;display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:inset 0 -3px 0 rgba(26,24,80,0.07),0 20px 36px -14px rgba(179,177,255,0.6)">Начать
          ${icon('chevR', { size: 22, sw: 2 })}
        </button>
        <button type="button" @click=${a.login} style="height:52px;border:0;background:transparent;color:#E4E3FB;font-family:${SANS};font-size:16px;font-weight:600">Уже есть аккаунт? <span style="color:#FFD66B;font-weight:700">Войти</span></button>
      </div>
    </div>`;
}
