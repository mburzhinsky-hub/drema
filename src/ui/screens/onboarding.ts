/** Первое знакомство: имя, дата рождения, кто это. Всё остальное приложение подстроит само. */
import { html, TemplateResult } from 'lit-html';
import { startDemo, validateChild } from '../../app/manage';
import { go } from '../../app/router';
import { invalidate } from '../../app/ui';
import { isoDate, now } from '../../engine/time';
import { addChild } from '../../store/actions';
import { icon } from '../icons';
import { SANS, SERIF } from '../parts';
import { backLink, topGlow } from '../shell';
import { errorLine, field, primary, secondary, segmented } from '../sheets/kit';

const form = { name: '', birth: '', gender: 'f' as 'f' | 'm', error: '' };

const patch = (p: Partial<typeof form>): void => {
  Object.assign(form, p, p.error === undefined ? { error: '' } : {});
  invalidate();
};

function submit(): void {
  const err = validateChild(form.name, form.birth);
  if (err) return patch({ error: err });
  addChild(form.name, form.birth, form.gender);
  form.name = '';
  form.birth = '';
  go('/');
}

export function onboardingScreen(): TemplateResult {
  return html`
    <div class="plain" style="position:relative;width:100%;height:100%;background:#F1F3FB;overflow:hidden;font-family:${SANS};color:#14172E">
      ${topGlow(0.16)}
      <div class="scroll stack" style="position:relative;height:100%;display:flex;flex-direction:column;padding:24px 20px calc(24px + var(--sab, 0px));gap:16px">
        ${backLink('/welcome')}
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:6px">
          <h1 style="margin:0;font-family:${SERIF};font-weight:400;font-size:32px;line-height:1.2;letter-spacing:-0.01em">Как зовут малыша?</h1>
          <div style="font-size:15px;font-weight:500;line-height:21px;color:#5A5F7A">Возраст нужен, чтобы считать окна сна: у малышей они разные — от 45 минут до трёх с половиной часов.</div>
        </div>
        <form @submit=${(e: Event) => { e.preventDefault(); submit(); }} style="display:flex;flex-direction:column;gap:16px" novalidate>
          ${field({ id: 'o-name', label: 'Имя', value: form.name, maxlength: 30, placeholder: 'Например, Мила', autocomplete: 'off', onInput: (v) => patch({ name: v }) })}
          ${field({ id: 'o-birth', label: 'Дата рождения', type: 'date', value: form.birth, max: isoDate(now()), onInput: (v) => patch({ birth: v }) })}
          ${segmented('Кто это', [{ value: 'f', label: 'Девочка' }, { value: 'm', label: 'Мальчик' }], form.gender, (v) => patch({ gender: v }))}
          ${errorLine(form.error)}
          <div style="display:flex;flex-direction:column;gap:10px;margin-top:6px">
            ${primary('Начать', submit, { icon: 'check' })}
            ${secondary('Сначала посмотреть на примере', startDemo, { icon: 'eye' })}
          </div>
        </form>
        <div style="display:flex;gap:10px;align-items:flex-start;font-size:13px;font-weight:500;line-height:19px;color:#5A5F7A;margin-top:4px">
          ${icon('info', { size: 18 })}
          <span>Записи хранятся на этом телефоне и никуда не отправляются. Регистрация не нужна.</span>
        </div>
      </div>
    </div>`;
}
