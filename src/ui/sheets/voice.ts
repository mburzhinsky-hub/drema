/** Шторка голосового ввода: слушаем, показываем, что поняли, и записываем после подтверждения. */
import { html, nothing, TemplateResult } from 'lit-html';
import { applyVoice, setVoiceText, speechSupported, toConfirm, toText, voiceParsed } from '../../app/flows';
import { VoiceSheet, closeSheet } from '../../app/ui';
import { describeAction, VoiceAction } from '../../engine/voice';
import { hm } from '../../engine/time';
import { activeChild } from '../../store/actions';
import { icon } from '../icons';
import { StyleKey, TYPE_STYLE } from '../palette';
import { SANS, SERIF } from '../parts';
import { errorLine, frame, note, primary, quiet, secondary, textarea } from './kit';

const KEY: Record<VoiceAction['kind'], StyleKey> = {
  'sleep-start': 'sleep',
  'sleep-end': 'wake',
  feed: 'feed',
  diaper: 'diaper',
  temp: 'temp',
  med: 'med',
  bath: 'bath',
  walk: 'walk',
  growth: 'growth',
  note: 'note',
};

const close = closeSheet;

function listening(sh: VoiceSheet): TemplateResult {
  return frame({
    title: 'Говорите',
    dark: true,
    onClose: close,
    body: html`
      <div style="display:flex;flex-direction:column;align-items:center;gap:18px;padding:12px 0 4px">
        <div class="listening" style="width:88px;height:88px;border-radius:44px;background:linear-gradient(180deg,#5A57EC 0%,#3F3CBB 100%);display:flex;align-items:center;justify-content:center;color:#FFFFFF;box-shadow:inset 0 1px 0 rgba(255,255,255,0.32),0 0 46px -6px rgba(90,87,236,0.75)">${icon('mic', { size: 38 })}</div>
        <div aria-live="polite" style="min-height:64px;text-align:center;font-family:${SERIF};font-size:24px;line-height:1.3;color:${sh.transcript ? '#FFFFFF' : '#A3A6C9'}">${sh.transcript || 'Например: «покормила, 120 мл»'}</div>
      </div>
      ${errorLine(sh.error)}`,
    footer: html`${primary('Готово', toConfirm, { icon: 'check' })}${quiet('Набрать вместо голоса', toText)}`,
  });
}

function typing(sh: VoiceSheet): TemplateResult {
  return frame({
    title: 'Что случилось?',
    dark: true,
    onClose: close,
    body: html`
      ${speechSupported() ? nothing : note('В этом браузере нет распознавания речи — наберите фразу, понимаем её так же.')}
      ${textarea('v-text', 'Фраза', sh.transcript, setVoiceText, 'Покормила в 14:20, 120 мл, потом сменила подгузник')}
      ${note('Можно несколько действий сразу и время: «уснула 20 минут назад», «в 2 часа дня покормили».')}
      ${errorLine(sh.error)}`,
    footer: html`${primary('Разобрать', toConfirm, { disabled: !sh.transcript.trim() })}`,
  });
}

function confirm(sh: VoiceSheet): TemplateResult {
  const gender = activeChild()?.gender ?? 'f';
  const { actions, unknown } = voiceParsed();
  const rows = [...actions].sort((a, b) => a.t - b.t);
  return frame({
    title: rows.length ? 'Записать?' : 'Не поняли',
    dark: true,
    onClose: close,
    body: html`
      <div style="font-size:14px;font-weight:500;line-height:20px;color:#A3A6C9">«${sh.transcript}»</div>
      ${rows.length
        ? html`<div role="list" style="display:flex;flex-direction:column;gap:8px">
            ${rows.map((a) => {
              const st = TYPE_STYLE[KEY[a.kind]];
              return html`<div role="listitem" style="min-height:56px;border-radius:20px;background:var(--s-card);padding:8px 14px;display:flex;align-items:center;gap:12px;font-family:${SANS}">
                <span style="width:36px;height:36px;border-radius:12px;background:${st.bg};color:${st.fg};display:flex;align-items:center;justify-content:center;flex:none">${icon(st.icon, { size: 20, fo: 0.22 })}</span>
                <span style="flex:1;font-size:16px;font-weight:600;line-height:21px">${describeAction(a, gender)}</span>
                <span style="font-size:15px;font-weight:600;color:var(--s-muted)">${hm(a.t)}</span>
              </div>`;
            })}
          </div>`
        : note('Ничего не распознали. Попробуйте сказать иначе: «покормила 120 мл», «уснула», «подгузник мокрый», «температура 37,2».')}
      ${unknown && rows.length ? note(`Не поняли: «${unknown}». Остальное запишем.`) : nothing}`,
    footer: html`${rows.length ? primary(rows.length > 1 ? `Записать всё (${rows.length})` : 'Записать', applyVoice, { icon: 'check' }) : nothing}${secondary('Исправить', toText)}`,
  });
}

export function voiceSheet(sh: VoiceSheet): TemplateResult {
  if (sh.phase === 'listening') return listening(sh);
  if (sh.phase === 'confirm') return confirm(sh);
  return typing(sh);
}
