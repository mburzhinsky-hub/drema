/** Повторяющиеся детали фирменного стиля: двоеточие-«ё», числа с мелкими единицами, звёзды. */
import { html, svg, TemplateResult } from 'lit-html';
import { styleMap } from 'lit-html/directives/style-map.js';

export const SERIF = "'Yeseva One',Georgia,serif";
export const SANS = "'Nunito',system-ui,sans-serif";

/** Два жёлтых огонька вместо двоеточия. glow — свечение на тёмном фоне. */
export function colon(color: string, glow: boolean): TemplateResult {
  const shadow = glow ? 'box-shadow:0 0 0.22em rgba(255,214,107,0.85);' : '';
  const dot = (top: string): string =>
    `position:absolute;left:0.06em;top:${top};width:0.15em;height:0.15em;border-radius:50%;background:${color};${shadow}`;
  return html`<span aria-hidden="true" style="display:inline-block;position:relative;width:0.27em;height:0.62em;margin:0 0.02em"><i style=${dot('0.1em')}></i><i style=${dot('0.4em')}></i></span>`;
}

/** «14:20» с огоньками вместо двоеточия. Любые другие символы остаются как есть. */
export function timeText(text: string, color = '#FFD66B', glow = true): TemplateResult {
  const parts = text.split(':');
  const out: Array<TemplateResult | string> = [];
  parts.forEach((p, i) => {
    if (i > 0) out.push(colon(color, glow));
    out.push(p);
  });
  return html`<span role="img" aria-label=${text} style="white-space:nowrap">${out}</span>`;
}

/** Мелкая единица рядом с крупным числом: «10 ч 02 мин». */
export const unit = (label: string): TemplateResult =>
  html`<span style="font-family:${SANS};font-size:0.46em;font-weight:700;letter-spacing:0.01em;margin:0 0.5em 0 0.32em">${label}</span>`;

/** Крупная длительность: часы и минуты цифрами с единицами. pad — минуты всегда двумя цифрами. */
export function durText(totalMin: number, pad: boolean): TemplateResult {
  const t = Math.max(0, Math.round(totalMin));
  const h = Math.floor(t / 60);
  const m = t % 60;
  const mm = pad && h > 0 ? String(m).padStart(2, '0') : String(m);
  if (h === 0) return html`${m}${unit('мин')}`;
  if (m === 0 && !pad) return html`${h}${unit('ч')}`;
  return html`${h}${unit('ч')}${mm}${unit('мин')}`;
}

/** Мелкие звёзды на тёмных карточках. */
export const stars = (spec: Array<[number, number, number, number]>): TemplateResult[] =>
  spec.map(([cx, cy, r, o]) => svg`<circle cx=${cx} cy=${cy} r=${r} fill="#FFFFFF" fill-opacity=${o} />`);

/** Четырёхконечная искра. */
export const sparkle = (x: number, y: number): TemplateResult => {
  const d = `M${x} ${y - 6}Q${x} ${y} ${x + 6} ${y}Q${x} ${y} ${x} ${y + 6}Q${x} ${y} ${x - 6} ${y}Q${x} ${y} ${x} ${y - 6}Z`;
  return svg`<path d=${d} fill="#FFD66B" />`;
};

export { styleMap };

/** Первая буква имени для аватара. */
export const initial = (name: string): string => (name.trim()[0] ?? '·').toUpperCase();
