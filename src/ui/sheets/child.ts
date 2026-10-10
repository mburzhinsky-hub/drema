/** Шторка детей: список, добавление, правка. */
import { html, nothing, TemplateResult } from 'lit-html';
import { askDeleteChild, openChildEdit, openChildNew, patchChild, pickChild, saveChild } from '../../app/manage';
import { go } from '../../app/router';
import { ChildSheet, closeSheet } from '../../app/ui';
import { ageInfo } from '../../engine/age';
import { isoDate, now } from '../../engine/time';
import { getState } from '../../store/store';
import { icon } from '../icons';
import { SANS, SERIF, initial } from '../parts';
import { danger, errorLine, field, frame, primary, secondary, segmented } from './kit';

function list(): TemplateResult {
  const s = getState();
  const t = now();
  return frame({
    title: 'Малыши',
    body: html`
      <div style="border-radius:24px;background:var(--s-card);padding:6px 16px;display:flex;flex-direction:column">
        ${s.children.map((c, i) => {
          const on = c.id === s.activeChildId;
          return html`
            <div style="display:flex;align-items:center;gap:6px;${i === s.children.length - 1 ? '' : 'border-bottom:1px solid var(--s-line);'}">
              <button type="button" @click=${() => pickChild(c.id)} aria-current=${on ? 'true' : 'false'} style="flex:1;min-width:0;min-height:64px;border:0;background:transparent;color:var(--s-fg);padding:0;display:flex;align-items:center;gap:14px;text-align:left;font-family:${SANS}">
                <span style="position:relative;flex:none;width:44px;height:44px;border-radius:22px;background:var(--s-soft);color:var(--s-accent);display:flex;align-items:center;justify-content:center;font-family:${SERIF};font-size:20px;flex:none">${initial(c.name)}${on ? html`<span style="position:absolute;right:-1px;bottom:-1px;width:14px;height:14px;border-radius:7px;background:#FFD66B;border:2.5px solid var(--s-card)"></span>` : nothing}</span>
                <span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:1px"><span style="font-size:16px;font-weight:600;line-height:21px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.name}</span><span style="font-size:13px;font-weight:500;line-height:18px;color:var(--s-muted)">${ageInfo(c.birth, t).label}${on ? ' · сейчас выбран' : ''}</span></span>
              </button>
              <button type="button" @click=${() => openChildEdit(c.id)} aria-label="Изменить: ${c.name}" style="flex:none;width:44px;height:44px;border:0;border-radius:22px;background:transparent;color:var(--s-muted);display:flex;align-items:center;justify-content:center">${icon('pencil', { size: 20 })}</button>
            </div>`;
        })}
      </div>`,
    footer: html`${primary('Добавить малыша', openChildNew, { icon: 'plus' })}${secondary('Настройки', () => { closeSheet(); go('/settings'); }, { icon: 'sliders' })}`,
  });
}

export function childSheet(sh: ChildSheet): TemplateResult {
  if (sh.mode === 'list') return list();
  const today = isoDate(now());
  return frame({
    title: sh.mode === 'new' ? 'Новый малыш' : 'Малыш',
    body: html`
      ${field({ id: 'c-name', label: 'Имя', value: sh.name, maxlength: 30, autocomplete: 'off', placeholder: 'Например, Мила', onInput: (v) => patchChild({ name: v }) })}
      ${field({ id: 'c-birth', label: 'Дата рождения', type: 'date', value: sh.birth, max: today, onInput: (v) => patchChild({ birth: v }) })}
      ${segmented('Кто это', [{ value: 'f', label: 'Девочка' }, { value: 'm', label: 'Мальчик' }], sh.gender, (v) => patchChild({ gender: v }))}
      ${errorLine(sh.error)}
    `,
    footer: html`${primary(sh.mode === 'new' ? 'Добавить' : 'Сохранить', saveChild, { icon: 'check' })}${sh.mode === 'edit' && sh.editId ? danger('Удалить малыша', () => askDeleteChild(sh.editId!), { icon: 'trash' }) : nothing}`,
  });
}
