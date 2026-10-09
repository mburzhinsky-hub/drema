/** Общие части экранов: нижняя навигация, подложка-свечение, кнопка «назад», аватар. */
import { html, TemplateResult } from 'lit-html';
import { icon } from './icons';
import { SERIF } from './parts';
import { href } from '../app/router';

export type NavKey = 'home' | 'day' | 'report' | 'family';

interface NavDef {
  key: NavKey;
  path: string;
  label: string;
}

const NAV: NavDef[] = [
  { key: 'home', path: '/', label: 'Сегодня' },
  { key: 'day', path: '/day', label: 'Журнал' },
  { key: 'report', path: '/report', label: 'Отчёты' },
  { key: 'family', path: '/family', label: 'Семья' },
];

function navIcon(key: NavKey, active: boolean): TemplateResult {
  switch (key) {
    case 'home':
      return html`${icon('clock', active ? { sw: 1.85, fo: 0.16 } : {})}`;
    case 'day':
      return html`${icon('list', active ? { sw: 1.85 } : {})}`;
    case 'report':
      return html`${icon('bars', active ? { sw: 1.95 } : {})}`;
    case 'family':
      return html`${icon('people', active ? { sw: 1.85, fo: 0.16 } : {})}`;
  }
}

export function navBar(active: NavKey): TemplateResult {
  return html`
    <nav aria-label="Основная навигация" style="flex:none;height:84px;box-sizing:border-box;background:#FFFFFF;border-top:1px solid #E3E6F0;padding:8px 12px 20px;display:flex">
      ${NAV.map((n) => {
        const on = n.key === active;
        return html`<a href=${href(n.path)} aria-current=${on ? 'page' : 'false'} style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;text-decoration:none;color:${on ? '#3F3CBB' : '#5A5F7A'}">
          <span style="width:56px;height:30px;${on ? 'border-radius:15px;background:#E6E6FB;' : ''}display:flex;align-items:center;justify-content:center">${navIcon(n.key, on)}</span>
          <span style="font-size:12px;font-weight:${on ? 700 : 500}">${n.label}</span>
        </a>`;
      })}
    </nav>
  `;
}

/** Лёгкое свечение сверху, как на светлых экранах макета. */
export const topGlow = (alpha: number, h = 380, stop = 72): TemplateResult =>
  html`<div style="position:absolute;left:0;top:0;width:100%;height:${h}px;background:radial-gradient(circle at 50% 0%, rgba(63,60,187,${alpha}) 0%, rgba(63,60,187,0) ${stop}%);pointer-events:none"></div>`;

/** Круглая кнопка «назад» на светлых экранах. */
export const backLink = (path: string): TemplateResult =>
  html`<a href=${href(path)} aria-label="Назад" style="width:44px;height:44px;border:1px solid #E1E4F1;border-radius:22px;background:#FFFFFF;color:#14172E;display:flex;align-items:center;justify-content:center;text-decoration:none;box-shadow:0 8px 18px -12px rgba(34,31,102,0.35)">${icon('chevL')}</a>`;

/** Тёмная карточка с кольцами и звёздами сверху, как на «Журнале», «Почему» и «Отчёте». */
export const cardRings = (w: number, h: number, extra: TemplateResult | string = ''): TemplateResult =>
  html`<svg width=${w} height=${h} viewBox="0 0 ${w} ${h}" fill="none" aria-hidden="true" style="position:absolute;right:0;top:0">${extra}</svg>`;

export const eyebrow = (text: string, color = '#5A5F7A'): TemplateResult =>
  html`<div style="font-size:12px;font-weight:700;letter-spacing:0.1em;color:${color}">${text}</div>`;

export const screenH1 = (text: string | TemplateResult, size = 32): TemplateResult =>
  html`<h1 style="margin:0;font-family:${SERIF};font-weight:400;font-size:${size}px;line-height:1.2;letter-spacing:-0.01em">${text}</h1>`;
