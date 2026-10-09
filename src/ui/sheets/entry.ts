/** Шторка записи: кормление, подгузник, температура, лекарство, купание, прогулка, рост и вес, заметка. */
import { html, nothing, TemplateResult } from 'lit-html';
import { deleteEntry, patchEntry, submitEntry } from '../../app/flows';
import { EntrySheet } from '../../app/ui';
import { DiaperKind, FeedHow } from '../../engine/model';
import { getState } from '../../store/store';
import { icon } from '../icons';
import { TYPE_STYLE } from '../palette';
import { SANS, SERIF } from '../parts';
import { chips, danger, errorLine, field, frame, primary, segmented, textarea } from './kit';

const TITLES: Record<EntrySheet['type'], string> = {
  feed: 'Кормление',
  diaper: 'Подгузник',
  temp: 'Температура',
  med: 'Лекарство',
  bath: 'Купание',
  walk: 'Прогулка',
  growth: 'Рост и вес',
  note: 'Заметка',
};

/** Что давали недавно — для быстрых кнопок. */
function recentMeds(): string[] {
  const s = getState();
  const seen: string[] = [];
  const meds = s.events
    .filter((e) => e.type === 'med' && !e.deleted && e.childId === s.activeChildId)
    .sort((a, b) => b.t - a.t);
  for (const e of meds) {
    if (e.type === 'med' && !seen.includes(e.name)) seen.push(e.name);
    if (seen.length >= 4) break;
  }
  return seen;
}

const timeRow = (sh: EntrySheet): TemplateResult => html`
  <div style="display:flex;align-items:flex-end;gap:10px">
    ${field({ id: 'e-time', label: sh.editId ? 'Время' : 'Время (пусто — сейчас)', type: 'time', value: sh.time, onInput: (v) => patchEntry({ time: v }) })}
    ${sh.time && !sh.editId
      ? html`<button type="button" @click=${() => patchEntry({ time: '' })} style="flex:none;height:52px;padding:0 18px;border:1.5px solid var(--s-line);border-radius:26px;background:var(--s-card);color:var(--s-fg);font-family:${SANS};font-size:15px;font-weight:700">Сейчас</button>`
      : nothing}
  </div>`;

const DIAPERS: Array<{ kind: DiaperKind; label: string }> = [
  { kind: 'wet', label: 'Мокрый' },
  { kind: 'dirty', label: 'Грязный' },
  { kind: 'mixed', label: 'Оба' },
];

function diaperBody(sh: EntrySheet): TemplateResult {
  const st = TYPE_STYLE.diaper;
  return html`
    <div role="group" aria-label="Какой подгузник" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px">
      ${DIAPERS.map((d) => {
        const on = sh.editId && sh.diaper === d.kind;
        return html`<button type="button" aria-pressed=${on ? 'true' : 'false'} @click=${() => (sh.editId ? patchEntry({ diaper: d.kind }) : submitEntry(d.kind))}
          style="height:112px;border:${on ? '2px solid #1E6B4C' : '2px solid transparent'};border-radius:26px;background:${st.bg};color:${st.fg};font-family:${SANS};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:0;box-shadow:inset 0 1px 0 rgba(255,255,255,0.7)">
          ${icon('diaper', { size: 30 })}
          <span style="font-size:15px;font-weight:700">${d.label}</span>
        </button>`;
      })}
    </div>
    ${sh.editId ? nothing : html`<div style="font-size:13px;font-weight:500;color:var(--s-muted)">Нажмите — запишется сразу. Время можно поменять ниже до нажатия.</div>`}
    ${timeRow(sh)}`;
}

function feedBody(sh: EntrySheet): TemplateResult {
  const how: Array<{ value: FeedHow; label: string }> = [
    { value: 'bottle', label: 'Бутылочка' },
    { value: 'breast', label: 'Грудь' },
    { value: 'solid', label: 'Прикорм' },
  ];
  const ml = [60, 90, 120, 150, 180];
  return html`
    ${segmented('Как кормили', how, sh.how, (v) => patchEntry({ how: v }))}
    ${sh.how === 'bottle'
      ? html`${field({ id: 'e-ml', label: 'Объём', value: sh.ml, inputmode: 'numeric', suffix: 'мл', maxlength: 3, onInput: (v) => patchEntry({ ml: v.replace(/\D/g, '') }) })}
          ${chips('Быстрый объём', ml.map((v) => ({ value: v, label: String(v) })), Number(sh.ml) || null, (v) => patchEntry({ ml: String(v) }))}`
      : sh.how === 'breast'
        ? html`<div style="display:flex;gap:10px">
            ${field({ id: 'e-left', label: 'Левая', value: sh.left, inputmode: 'numeric', suffix: 'мин', maxlength: 2, onInput: (v) => patchEntry({ left: v.replace(/\D/g, '') }) })}
            ${field({ id: 'e-right', label: 'Правая', value: sh.right, inputmode: 'numeric', suffix: 'мин', maxlength: 2, onInput: (v) => patchEntry({ right: v.replace(/\D/g, '') }) })}
          </div>`
        : field({ id: 'e-food', label: 'Что дали', value: sh.food, placeholder: 'Например, гречневая каша', maxlength: 60, onInput: (v) => patchEntry({ food: v }) })}
    ${timeRow(sh)}`;
}

function tempBody(sh: EntrySheet): TemplateResult {
  const step = (d: number): void => {
    const cur = Number(sh.temp.replace(',', '.')) || 36.6;
    const next = Math.min(42, Math.max(34, Math.round((cur + d) * 10) / 10));
    patchEntry({ temp: next.toFixed(1) });
  };
  const round = 'flex:none;width:56px;height:56px;border:0;border-radius:28px;background:var(--s-card);color:var(--s-fg);display:flex;align-items:center;justify-content:center';
  return html`
    <div style="display:flex;align-items:center;justify-content:center;gap:16px;padding:6px 0">
      <button type="button" @click=${() => step(-0.1)} aria-label="Меньше на 0,1" style=${round}>${icon('minus')}</button>
      <div style="display:flex;align-items:baseline;gap:4px;font-family:${SERIF};font-size:52px;line-height:1.1">
        <input id="e-temp" inputmode="decimal" aria-label="Температура, градусов" .value=${sh.temp.replace('.', ',')} @input=${(e: Event) => patchEntry({ temp: (e.target as HTMLInputElement).value.replace(',', '.') })}
          style="width:112px;border:0;background:transparent;color:inherit;font:inherit;text-align:center;outline:none" />
        <span style="font-family:${SANS};font-size:18px;font-weight:700;color:var(--s-muted)">°C</span>
      </div>
      <button type="button" @click=${() => step(0.1)} aria-label="Больше на 0,1" style=${round}>${icon('plus')}</button>
    </div>
    ${timeRow(sh)}`;
}

function medBody(sh: EntrySheet): TemplateResult {
  const names = recentMeds();
  return html`
    ${field({ id: 'e-med', label: 'Что дали', value: sh.medName, placeholder: 'Название', maxlength: 60, onInput: (v) => patchEntry({ medName: v }) })}
    ${names.length ? chips('Недавнее', names.map((n) => ({ value: n, label: n })), sh.medName || null, (v) => patchEntry({ medName: v })) : nothing}
    ${field({ id: 'e-dose', label: 'Доза', value: sh.medDose, placeholder: 'Например, 1 капля или 2,5 мл', maxlength: 40, onInput: (v) => patchEntry({ medDose: v }) })}
    ${timeRow(sh)}`;
}

function walkBody(sh: EntrySheet): TemplateResult {
  return html`
    ${field({ id: 'e-min', label: 'Сколько длилась', value: sh.minutes, inputmode: 'numeric', suffix: 'мин', maxlength: 3, onInput: (v) => patchEntry({ minutes: v.replace(/\D/g, '') }) })}
    ${chips('Быстрая длительность', [20, 40, 60, 90].map((v) => ({ value: v, label: `${v}` })), Number(sh.minutes) || null, (v) => patchEntry({ minutes: String(v) }))}
    ${timeRow(sh)}`;
}

function growthBody(sh: EntrySheet): TemplateResult {
  return html`
    <div style="display:flex;gap:10px">
      ${field({ id: 'e-kg', label: 'Вес', value: sh.kg, inputmode: 'decimal', suffix: 'кг', maxlength: 5, placeholder: '6,9', onInput: (v) => patchEntry({ kg: v.replace(',', '.') }) })}
      ${field({ id: 'e-cm', label: 'Рост', value: sh.cm, inputmode: 'decimal', suffix: 'см', maxlength: 5, placeholder: '64', onInput: (v) => patchEntry({ cm: v.replace(',', '.') }) })}
    </div>
    ${timeRow(sh)}`;
}

export function entrySheet(sh: EntrySheet): TemplateResult {
  let body: TemplateResult;
  switch (sh.type) {
    case 'feed':
      body = feedBody(sh);
      break;
    case 'diaper':
      body = diaperBody(sh);
      break;
    case 'temp':
      body = tempBody(sh);
      break;
    case 'med':
      body = medBody(sh);
      break;
    case 'walk':
      body = walkBody(sh);
      break;
    case 'growth':
      body = growthBody(sh);
      break;
    case 'note':
      body = html`${textarea('e-text', 'Заметка', sh.text, (v) => patchEntry({ text: v }), 'Что хотите запомнить?')}${timeRow(sh)}`;
      break;
    default:
      body = html`<div style="font-size:15px;font-weight:500;line-height:21px;color:var(--s-muted)">Отметим купание${sh.editId ? '' : ' — время можно поменять'}.</div>${timeRow(sh)}`;
  }
  const showSave = !(sh.type === 'diaper' && !sh.editId);
  return frame({
    title: sh.editId ? `${TITLES[sh.type]}: правка` : TITLES[sh.type],
    body: html`${body}${errorLine(sh.error)}`,
    footer: html`
      ${showSave ? primary(sh.editId ? 'Сохранить' : 'Записать', () => submitEntry(), { icon: 'check' }) : nothing}
      ${sh.editId ? danger('Удалить запись', deleteEntry, { icon: 'trash' }) : nothing}`,
  });
}

