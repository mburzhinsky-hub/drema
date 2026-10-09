/** Детали шторок: рамка, поля, переключатели, кнопки. Цвета берутся из переменных, чтобы ночью шторки были тёмными. */
import { html, nothing, TemplateResult } from 'lit-html';
import { parseHash } from '../../app/router';
import { closeSheet } from '../../app/ui';
import { icon, IconName } from '../icons';
import { SANS, SERIF } from '../parts';

export const isDark = (): boolean => parseHash(location.hash).name === 'night';

export const LABEL = 'font-size:12px;font-weight:700;letter-spacing:0.1em;color:var(--s-muted)';

export interface FrameOpts {
  title: string;
  body: TemplateResult;
  footer?: TemplateResult;
  /** Всегда тёмная (голос). */
  dark?: boolean;
  onClose?: () => void;
}

/** Рамка шторки: ручка, заголовок, кнопка закрытия, прокручиваемое тело и закреплённый низ. */
export function frame({ title, body, footer, dark, onClose }: FrameOpts): TemplateResult {
  const close = onClose ?? closeSheet;
  const night = dark || isDark();
  return html`
    <div class="sheet ${night ? 'dark' : ''}" role="dialog" aria-modal="true" aria-labelledby="sheet-title" tabindex="-1">
      <div aria-hidden="true" style="flex:none;width:40px;height:5px;border-radius:3px;background:${night ? 'rgba(255,255,255,0.22)' : '#D7DAEC'};margin:10px auto 0"></div>
      <div style="flex:none;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 20px 2px 24px">
        <h2 id="sheet-title" style="margin:0;font-family:${SERIF};font-weight:400;font-size:24px;line-height:1.2;letter-spacing:0">${title}</h2>
        <button type="button" @click=${close} aria-label="Закрыть" style="flex:none;width:44px;height:44px;border:0;border-radius:22px;background:var(--s-card);color:var(--s-fg);display:flex;align-items:center;justify-content:center">${icon('close', { size: 20 })}</button>
      </div>
      <div class="scroll" style="flex:1 1 auto;min-height:0;padding:10px 20px 12px;display:flex;flex-direction:column;gap:14px">${body}</div>
      ${footer
        ? html`<div style="flex:none;padding:10px 20px calc(22px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:8px">${footer}</div>`
        : html`<div style="flex:none;height:calc(10px + env(safe-area-inset-bottom))"></div>`}
    </div>`;
}

// ───────────────────────── кнопки ─────────────────────────

interface BtnOpts {
  icon?: IconName;
  disabled?: boolean;
  type?: 'button' | 'submit';
}

export const primary = (label: string, onClick: () => void, o: BtnOpts = {}): TemplateResult => html`
  <button type="button" @click=${onClick} ?disabled=${o.disabled} style="height:60px;border:0;border-radius:30px;background:var(--s-accent);color:#FFFFFF;font-family:${SANS};font-size:17px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:10px;padding:0 20px;opacity:${o.disabled ? 0.5 : 1};box-shadow:inset 0 1px 0 rgba(255,255,255,0.28),0 18px 28px -14px rgba(63,60,187,0.85)">
    ${o.icon ? icon(o.icon, { size: 22, sw: 1.85 }) : nothing}${label}
  </button>`;

export const secondary = (label: string, onClick: () => void, o: BtnOpts = {}): TemplateResult => html`
  <button type="button" @click=${onClick} ?disabled=${o.disabled} style="min-height:52px;border:1.5px solid var(--s-line);border-radius:26px;background:var(--s-card);color:var(--s-fg);font-family:${SANS};font-size:16px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px;padding:0 20px;opacity:${o.disabled ? 0.5 : 1}">
    ${o.icon ? icon(o.icon, { size: 20 }) : nothing}${label}
  </button>`;

export const quiet = (label: string, onClick: () => void, o: BtnOpts = {}): TemplateResult => html`
  <button type="button" @click=${onClick} style="min-height:48px;border:0;border-radius:24px;background:transparent;color:var(--s-muted);font-family:${SANS};font-size:15px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px;padding:0 16px">
    ${o.icon ? icon(o.icon, { size: 20 }) : nothing}${label}
  </button>`;

export const danger = (label: string, onClick: () => void, o: BtnOpts = {}): TemplateResult => html`
  <button type="button" @click=${onClick} style="min-height:52px;border:0;border-radius:26px;background:var(--s-warn-bg);color:var(--s-warn-fg);font-family:${SANS};font-size:16px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px;padding:0 20px">
    ${o.icon ? icon(o.icon, { size: 20 }) : nothing}${label}
  </button>`;

// ───────────────────────── поля ─────────────────────────

export interface FieldOpts {
  id: string;
  label: string;
  value: string;
  onInput: (v: string) => void;
  type?: 'text' | 'number' | 'time' | 'date' | 'datetime-local';
  inputmode?: 'text' | 'numeric' | 'decimal';
  placeholder?: string;
  suffix?: string;
  max?: string;
  min?: string;
  maxlength?: number;
  autocomplete?: string;
  disabled?: boolean;
  hint?: string;
}

export function field(o: FieldOpts): TemplateResult {
  return html`
    <div style="display:flex;flex-direction:column;gap:6px;min-width:0;flex:1">
      <label for=${o.id} style=${LABEL}>${o.label.toUpperCase()}</label>
      <div style="position:relative">
        <input id=${o.id} class="field" type=${o.type ?? 'text'} inputmode=${o.inputmode ?? 'text'} .value=${o.value}
          placeholder=${o.placeholder ?? ''} max=${o.max ?? nothing} min=${o.min ?? nothing} maxlength=${o.maxlength ?? nothing}
          autocomplete=${o.autocomplete ?? 'off'} ?disabled=${o.disabled}
          style=${o.suffix ? 'padding-right:52px' : ''}
          @input=${(e: Event) => o.onInput((e.target as HTMLInputElement).value)} />
        ${o.suffix ? html`<span aria-hidden="true" style="position:absolute;right:16px;top:0;height:52px;display:flex;align-items:center;font-size:15px;font-weight:600;color:var(--s-muted)">${o.suffix}</span>` : nothing}
      </div>
      ${o.hint ? html`<div style="font-size:13px;font-weight:500;line-height:18px;color:var(--s-muted)">${o.hint}</div>` : nothing}
    </div>`;
}

export function textarea(id: string, label: string, value: string, onInput: (v: string) => void, placeholder = ''): TemplateResult {
  return html`
    <div style="display:flex;flex-direction:column;gap:6px">
      <label for=${id} style=${LABEL}>${label.toUpperCase()}</label>
      <textarea id=${id} class="field" rows="3" .value=${value} placeholder=${placeholder} @input=${(e: Event) => onInput((e.target as HTMLTextAreaElement).value)}></textarea>
    </div>`;
}

/** Выбор одного из нескольких: как переключатель «День / Неделя» в журнале. */
export function segmented<T extends string>(label: string, options: Array<{ value: T; label: string }>, current: T, onPick: (v: T) => void): TemplateResult {
  return html`
    <div role="radiogroup" aria-label=${label} style="height:48px;border-radius:24px;background:var(--s-seg);padding:4px;display:flex;gap:4px;flex:none">
      ${options.map((o) => {
        const on = o.value === current;
        return html`<button type="button" role="radio" aria-checked=${on ? 'true' : 'false'} @click=${() => onPick(o.value)}
          style="flex:1;border:0;border-radius:20px;background:${on ? 'var(--s-card)' : 'transparent'};color:${on ? 'var(--s-fg)' : 'var(--s-muted)'};font-family:${SANS};font-size:15px;font-weight:${on ? 700 : 600};${on ? 'box-shadow:0 2px 8px -2px rgba(20,23,46,.25)' : ''}">${o.label}</button>`;
      })}
    </div>`;
}

/** Быстрые значения: «60 90 120 150». */
export function chips<T extends string | number>(label: string, options: Array<{ value: T; label: string }>, current: T | null, onPick: (v: T) => void): TemplateResult {
  return html`
    <div role="group" aria-label=${label} style="display:flex;flex-wrap:wrap;gap:8px">
      ${options.map((o) => {
        const on = o.value === current;
        return html`<button type="button" aria-pressed=${on ? 'true' : 'false'} @click=${() => onPick(o.value)}
          style="min-height:44px;min-width:56px;padding:0 16px;border:1.5px solid ${on ? 'var(--s-accent)' : 'var(--s-line)'};border-radius:22px;background:${on ? 'var(--s-accent)' : 'var(--s-card)'};color:${on ? '#FFFFFF' : 'var(--s-fg)'};font-family:${SANS};font-size:15px;font-weight:700">${o.label}</button>`;
      })}
    </div>`;
}

/** Переключатель «вкл / выкл» с подписью. */
export function toggle(id: string, label: string, sub: string | undefined, on: boolean, onChange: (v: boolean) => void): TemplateResult {
  return html`
    <label for=${id} style="min-height:60px;display:flex;align-items:center;gap:14px;cursor:pointer">
      <span style="flex:1;display:flex;flex-direction:column;gap:1px">
        <span style="font-size:16px;font-weight:600;line-height:21px">${label}</span>
        ${sub ? html`<span style="font-size:13px;font-weight:500;line-height:18px;color:var(--s-muted)">${sub}</span>` : nothing}
      </span>
      <input id=${id} type="checkbox" role="switch" .checked=${on} @change=${(e: Event) => onChange((e.target as HTMLInputElement).checked)}
        style="position:absolute;opacity:0;width:1px;height:1px" />
      <span aria-hidden="true" style="flex:none;position:relative;width:52px;height:32px;border-radius:16px;background:${on ? 'var(--s-accent)' : 'var(--s-line)'};transition:background .15s">
        <span style="position:absolute;top:3px;left:${on ? 23 : 3}px;width:26px;height:26px;border-radius:13px;background:#FFFFFF;box-shadow:0 2px 6px rgba(20,23,46,0.3);transition:left .15s"></span>
      </span>
    </label>`;
}

export const errorLine = (text: string | undefined): TemplateResult | typeof nothing =>
  text
    ? html`<div role="alert" style="padding:11px 14px;border-radius:14px;background:var(--s-warn-bg);color:var(--s-warn-fg);font-size:14px;font-weight:600;line-height:19px">${text}</div>`
    : nothing;

export const note = (text: string | TemplateResult): TemplateResult =>
  html`<div style="font-size:13px;font-weight:500;line-height:19px;color:var(--s-muted)">${text}</div>`;

export const card = (inner: TemplateResult): TemplateResult =>
  html`<div style="border-radius:24px;background:var(--s-card);padding:6px 16px;display:flex;flex-direction:column">${inner}</div>`;

/** Ряд-кнопка внутри карточки: значок, подпись, стрелка. */
export function rowButton(o: { icon: IconName; bg: string; fg: string; title: string; sub?: string; onClick: () => void; last?: boolean }): TemplateResult {
  return html`
    <button type="button" @click=${o.onClick} style="width:100%;min-height:64px;border:0;${o.last ? '' : 'border-bottom:1px solid var(--s-line);'}background:transparent;color:var(--s-fg);padding:0;display:flex;align-items:center;gap:14px;text-align:left;font-family:${SANS}">
      <span style="width:40px;height:40px;border-radius:14px;background:${o.bg};color:${o.fg};display:flex;align-items:center;justify-content:center;flex:none">${icon(o.icon, { size: 22, fo: 0.22 })}</span>
      <span style="flex:1;display:flex;flex-direction:column;gap:1px"><span style="font-size:16px;font-weight:600;line-height:21px">${o.title}</span>${o.sub ? html`<span style="font-size:13px;font-weight:500;line-height:18px;color:var(--s-muted)">${o.sub}</span>` : nothing}</span>
      ${icon('chevR', { size: 18, stroke: 'currentColor', style: 'opacity:.55' })}
    </button>`;
}
