/** Шторка правки сна: когда уснул и когда проснулся. */
import { html, nothing, TemplateResult } from 'lit-html';
import { deleteSleep, patchSleepSheet, saveSleepEdit } from '../../app/flows';
import { SleepEditSheet } from '../../app/ui';
import { fmtDur } from '../../engine/format';
import { MIN } from '../../engine/time';
import { activeChild } from '../../store/actions';
import { words } from '../../engine/words';
import { danger, errorLine, field, frame, note, primary, toggle } from './kit';

export function sleepEditSheet(sh: SleepEditSheet): TemplateResult {
  const w = words(activeChild()?.gender ?? 'f');
  const start = new Date(sh.start).getTime();
  const end = new Date(sh.end).getTime();
  const dur = !sh.ongoing && !Number.isNaN(start) && !Number.isNaN(end) && end > start ? fmtDur(Math.round((end - start) / MIN)) : '';
  return frame({
    title: 'Время сна',
    body: html`
      ${field({ id: 's-start', label: w.fellAsleep, type: 'datetime-local', value: sh.start, onInput: (v) => patchSleepSheet({ start: v }) })}
      ${sh.ongoing
        ? html`<div style="font-size:15px;font-weight:600;color:var(--s-muted)">Сон идёт — время пробуждения появится, когда нажмёте «${w.wokeUp}».</div>`
        : field({ id: 's-end', label: w.wokeUp, type: 'datetime-local', value: sh.end, onInput: (v) => patchSleepSheet({ end: v }) })}
      ${toggle('s-ongoing', 'Сон ещё идёт', undefined, sh.ongoing, (v) => patchSleepSheet({ ongoing: v }))}
      ${dur ? note(`Продолжительность: ${dur}`) : nothing}
      ${errorLine(sh.error)}
    `,
    footer: html`${primary('Сохранить', saveSleepEdit, { icon: 'check' })}${danger('Удалить сон', () => deleteSleep(sh.id), { icon: 'trash' })}`,
  });
}
