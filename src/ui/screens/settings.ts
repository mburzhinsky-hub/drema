/** Настройки: ночной режим, отбой, имя, напоминания, данные, сведения о приложении. */
import { html, nothing, TemplateResult } from 'lit-html';
import { askClearDemo, askReset, downloadBackup, importFromFile, startDemo } from '../../app/manage';
import { go } from '../../app/router';
import { openSheet, ui } from '../../app/ui';
import { updateSettings } from '../../store/actions';
import { Derived } from '../../store/select';
import { getState } from '../../store/store';
import { icon } from '../icons';
import { SANS, SERIF } from '../parts';
import { backLink, topGlow } from '../shell';
import { danger, field, note, rowButton, toggle } from '../sheets/kit';

export const APP_VERSION = '1.0.0';

const eyebrow = (t: string): TemplateResult => html`<div style="margin:6px 4px -4px;font-size:12px;font-weight:700;letter-spacing:0.1em;color:#5A5F7A">${t}</div>`;
const card = (inner: TemplateResult): TemplateResult =>
  html`<div style="border-radius:28px;background:#FFFFFF;padding:6px 18px;display:flex;flex-direction:column;box-shadow:0 1px 2px rgba(20,23,46,0.04),0 16px 36px -22px rgba(34,31,102,0.3)">${inner}</div>`;

export function settingsScreen(d: Derived, _t: number): TemplateResult {
  const s = getState().settings;
  const demo = getState().demo;
  return html`
    <div class="plain" style="position:relative;width:100%;height:100%;background:#F1F3FB;overflow:hidden;font-family:${SANS};color:#14172E">
      ${topGlow(0.14)}
      <div class="scroll stack" style="position:relative;height:100%;display:flex;flex-direction:column;padding:24px 20px calc(28px + var(--sab, 0px));gap:14px">
        ${backLink('/')}
        <h1 style="margin:6px 0 0;font-family:${SERIF};font-weight:400;font-size:32px;line-height:1.2;letter-spacing:-0.01em">Настройки</h1>

        ${eyebrow('НОЧЬ')}
        ${card(html`
          <div style="border-bottom:1px solid #E9ECF5">${toggle('st-night', 'Ночной режим сам', `С ${s.nightFrom} до ${s.nightTo}: тёмный экран и крупные кнопки`, s.nightAuto, (v) => updateSettings({ nightAuto: v }))}</div>
          ${s.nightAuto
            ? html`<div style="display:flex;gap:10px;padding:12px 0">
                ${field({ id: 'st-from', label: 'С', type: 'time', value: s.nightFrom, onInput: (v) => v && updateSettings({ nightFrom: v }) })}
                ${field({ id: 'st-to', label: 'До', type: 'time', value: s.nightTo, onInput: (v) => v && updateSettings({ nightTo: v }) })}
              </div>`
            : nothing}
          ${rowButton({ icon: 'moon', bg: '#E6E6FB', fg: '#3F3CBB', title: 'Открыть ночной режим сейчас', last: true, onClick: () => { ui.nightAuto = false; go('/night'); } })}
        `)}

        ${eyebrow('РЕЖИМ')}
        ${card(html`<div style="padding:12px 0;display:flex;flex-direction:column;gap:6px">
          ${field({ id: 'st-bed', label: 'Желаемый отбой', type: 'time', value: s.bedtime ?? '', onInput: (v) => updateSettings({ bedtime: v || undefined }) })}
          ${note('Если пусто, считаем по последним ночам. Если задать, прогноз вечернего сна будет стараться вести к этому времени.')}
        </div>`)}

        ${eyebrow('ВЫ')}
        ${card(html`
          <div style="border-bottom:1px solid #E9ECF5">${rowButton({ icon: 'people', bg: '#FFF0C2', fg: '#6B4E00', title: 'Как вас подписывать', sub: s.userName, last: true, onClick: () => openSheet({ kind: 'profile' }) })}</div>
          ${rowButton({ icon: 'bell', bg: '#E0EEFA', fg: '#1F5E8C', title: 'Напоминания', sub: 'Окно сна, кормление, затянувшийся сон', last: true, onClick: () => openSheet({ kind: 'reminders' }) })}
        `)}

        ${eyebrow('ДАННЫЕ')}
        ${card(html`
          <div style="border-bottom:1px solid #E9ECF5">${rowButton({ icon: 'doc', bg: '#DDF1E8', fg: '#1E6B4C', title: 'Сохранить копию', sub: 'Файл с записями — на случай смены телефона', last: true, onClick: downloadBackup })}</div>
          <label style="position:relative;width:100%;min-height:64px;${demo ? 'border-bottom:1px solid #E9ECF5;' : ''}display:flex;align-items:center;gap:14px;cursor:pointer">
            <span style="width:40px;height:40px;border-radius:14px;background:#DAF1F4;color:#12687A;display:flex;align-items:center;justify-content:center;flex:none">${icon('share', { size: 22 })}</span>
            <span style="flex:1;display:flex;flex-direction:column;gap:1px"><span style="font-size:16px;font-weight:600;line-height:21px">Загрузить копию</span><span style="font-size:13px;font-weight:500;line-height:18px;color:#5A5F7A">Заменит данные на этом телефоне</span></span>
            <input type="file" accept="application/json,.json" aria-label="Загрузить копию" style="position:absolute;inset:0;opacity:0;cursor:pointer" @change=${(e: Event) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void importFromFile(f); (e.target as HTMLInputElement).value = ''; }} />
          </label>
          ${demo
            ? rowButton({ icon: 'eye', bg: '#FDE8E2', fg: '#A8341F', title: 'Убрать примерные данные', sub: `Сейчас показана ${d.child.name} с примерными записями`, last: true, onClick: askClearDemo })
            : ''}
        `)}
        ${!demo && getState().children.every((c) => c.id !== 'demo-mila')
          ? html`<button type="button" @click=${startDemo} style="min-height:52px;border:1.5px solid #D7DAEC;border-radius:26px;background:#FFFFFF;color:#14172E;font-family:${SANS};font-size:16px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px">${icon('eye', { size: 20 })}Показать на примере</button>`
          : nothing}
        ${danger('Стереть всё', askReset, { icon: 'trash' })}

        ${eyebrow('О ПРИЛОЖЕНИИ')}
        ${card(html`<div style="padding:12px 0;display:flex;flex-direction:column;gap:10px;font-size:14px;font-weight:500;line-height:20px;color:#14172E">
          <div><strong>Дрёма ${APP_VERSION}.</strong> Записи хранятся только на этом устройстве.</div>
          <div style="color:#5A5F7A">Нормы окон бодрствования и сна — по возрасту, на основе консенсуса Американской академии медицины сна (AASM, 2016) и рекомендаций детских клиник; затем прогноз подстраивается под ритм вашего малыша. Подробности расчёта — в документе MECHANICS.md в репозитории.</div>
          <div style="color:#5A5F7A">Прогноз — ориентир, а не медицинская рекомендация. Если малыш плохо спит или ест, у него температура или вы волнуетесь — обратитесь к педиатру.</div>
        </div>`)}
        ${card(html`${rowButton({ icon: 'doc', bg: '#E6E6FB', fg: '#3F3CBB', title: 'Сведения об экране', sub: 'Для поддержки, если что-то отображается не так', last: true, onClick: () => openSheet({ kind: 'diag' }) })}`)}
      </div>
    </div>`;
}
