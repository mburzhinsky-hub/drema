/** Остальные шторки: «Ещё», напоминания, отправка выписки, приглашение, профиль, вход, участник, подтверждение. */
import { html, nothing, TemplateResult } from 'lit-html';
import { openEntry, openVoice } from '../../app/flows';
import { addInvitee, deleteMember, patchMember, saveMember, saveProfile, submitLogin, importFromFile } from '../../app/manage';
import { notifPermission, requestNotifications } from '../../app/reminders';
import { currentReport } from '../../app/reportData';
import { copyText, inviteLink, shareInvite, shareReport } from '../../app/sharing';
import { ConfirmSheet, MemberSheet, SimpleSheet, closeSheet, invalidate, showToast, ui } from '../../app/ui';
import { ROLE_LABEL } from '../screens/family';
import { Role } from '../../engine/model';
import { activeChild, updateSettings } from '../../store/actions';
import { getState } from '../../store/store';
import { icon } from '../icons';
import { TYPE_STYLE } from '../palette';
import { SANS } from '../parts';
import { card, chips, danger, errorLine, field, frame, note, primary, quiet, rowButton, secondary, segmented, textarea, toggle } from './kit';

// ───────────────────────── «Ещё» ─────────────────────────

const MORE: Array<{ type: 'temp' | 'med' | 'bath' | 'walk' | 'growth' | 'note'; title: string; sub: string }> = [
  { type: 'temp', title: 'Температура', sub: 'Измерили градусник' },
  { type: 'med', title: 'Лекарство', sub: 'Название и доза' },
  { type: 'bath', title: 'Купание', sub: 'Одно нажатие' },
  { type: 'walk', title: 'Прогулка', sub: 'Сколько гуляли' },
  { type: 'growth', title: 'Рост и вес', sub: 'После взвешивания' },
  { type: 'note', title: 'Заметка', sub: 'Что хотите запомнить' },
];

export function moreSheet(): TemplateResult {
  const rows = MORE.map((m, i) =>
    rowButton({
      icon: TYPE_STYLE[m.type].icon,
      bg: TYPE_STYLE[m.type].bg,
      fg: TYPE_STYLE[m.type].fg,
      title: m.title,
      sub: m.sub,
      last: i === MORE.length - 1,
      onClick: () => openEntry(m.type),
    }),
  );
  return frame({
    title: 'Записать',
    body: html`${card(html`${rows}`)}
      <button type="button" @click=${() => { closeSheet(); openVoice(); }} style="min-height:60px;border:0;border-radius:30px;background:var(--s-soft);color:var(--s-accent);font-family:${SANS};font-size:16px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:10px">${icon('mic', { size: 22 })}Сказать вслух</button>`,
  });
}

// ───────────────────────── напоминания ─────────────────────────

export function remindersSheet(): TemplateResult {
  const r = getState().settings.reminders;
  const perm = notifPermission();
  const set = (p: Partial<typeof r>): void => updateSettings({ reminders: { ...r, ...p } });
  const permNote =
    perm === 'granted'
      ? 'Уведомления разрешены. Они придут, пока Дрёма открыта или свёрнута.'
      : perm === 'denied'
        ? 'Уведомления запрещены в настройках браузера. Напоминания будут появляться только внутри приложения.'
        : perm === 'unsupported'
          ? 'Этот браузер не умеет показывать уведомления. Напоминания будут появляться внутри приложения.'
          : 'Чтобы напоминания приходили, когда экран выключен, разрешите уведомления.';
  return frame({
    title: 'Напоминания',
    body: html`
      ${card(html`
        <div style="border-bottom:1px solid var(--s-line)">${toggle('r-window', 'Скоро окно сна', 'Напомним заранее, когда пора укладывать', r.window.on, (v) => set({ window: { ...r.window, on: v } }))}</div>
        ${r.window.on
          ? html`<div style="padding:4px 0 12px;display:flex;flex-direction:column;gap:8px;border-bottom:1px solid var(--s-line)">
              <span style="font-size:13px;font-weight:600;color:var(--s-muted)">За сколько минут до начала окна</span>
              ${chips('За сколько минут', [5, 10, 15, 20].map((v) => ({ value: v, label: `${v} мин` })), r.window.lead, (v) => set({ window: { ...r.window, lead: v } }))}
            </div>`
          : nothing}
        <div style="border-bottom:1px solid var(--s-line)">${toggle('r-feed', 'Пора кормить', 'Когда прошёл обычный промежуток', r.feed.on, (v) => set({ feed: { on: v } }))}</div>
        ${toggle('r-wake', 'Дневной сон затянулся', 'Если спит заметно дольше обычного', r.wake.on, (v) => set({ wake: { on: v } }))}
      `)}
      ${notifPermission() === 'default'
        ? primary('Разрешить уведомления', async () => { await requestNotifications(); invalidate(); }, { icon: 'bell' })
        : nothing}
      ${note(permNote)}
      ${note('Закрытое приложение уведомить не может: браузер не разрешает запускать код по времени. Чтобы напоминания приходили всегда, нужен сервер — он подключается в настройках, когда появится.')}
    `,
  });
}

// ───────────────────────── выписка врачу ─────────────────────────

export function shareReportSheet(): TemplateResult {
  const r = currentReport();
  return frame({
    title: 'Отправить врачу',
    body: html`
      <div style="border-radius:20px;background:var(--s-card);padding:14px 16px;max-height:240px;overflow:auto;font-size:13px;font-weight:500;line-height:19px;white-space:pre-wrap;color:var(--s-fg)" tabindex="0" aria-label="Текст выписки">${r?.text ?? 'Нет данных'}</div>
      ${note('Уйдёт обычным текстом — его можно вставить в любой чат или письмо.')}`,
    footer: html`
      ${primary('Telegram', () => void shareReport('telegram'), { icon: 'send' })}
      ${secondary('Поделиться…', () => void shareReport('native'), { icon: 'share' })}
      ${secondary('Скопировать текст', () => void shareReport('copy'), { icon: 'doc' })}`,
  });
}

// ───────────────────────── приглашение ─────────────────────────

let inviteName = '';

export function inviteSheet(): TemplateResult {
  const inv = inviteLink();
  const name = activeChild()?.name ?? 'малыш';
  const add = (): void => {
    if (inviteName.trim()) {
      addInvitee(inviteName, 'viewer');
      showToast(`${inviteName.trim()} добавлен в список семьи`);
      inviteName = '';
    }
  };
  return frame({
    title: 'Пригласить по ссылке',
    body: html`
      <div style="font-size:15px;font-weight:500;line-height:21px">Человек увидит, спит ли ${name}, как давно, и когда ждать следующий сон. Ссылка открывается без регистрации и установки.</div>
      ${field({ id: 'i-name', label: 'Кого приглашаете (по желанию)', value: inviteName, placeholder: 'Например, Бабушка', maxlength: 30, onInput: (v) => { inviteName = v; } })}
      <div style="display:flex;flex-direction:column;gap:6px">
        <label for="i-link" style="font-size:12px;font-weight:700;letter-spacing:0.1em;color:var(--s-muted)">ССЫЛКА</label>
        <input id="i-link" class="field" readonly .value=${inv?.link ?? ''} @focus=${(e: Event) => (e.target as HTMLInputElement).select()} />
      </div>
      ${note('Это снимок на сейчас: у открывшего он обновляется сам по времени, но новые записи не приходят. Чтобы показать свежие, отправьте новую ссылку. Живой общий доступ и права «записывать» появятся вместе с сервером.')}`,
    footer: html`
      ${primary('Telegram', () => { add(); void shareInvite('telegram'); }, { icon: 'send' })}
      ${secondary('Поделиться…', () => { add(); void shareInvite('native'); }, { icon: 'share' })}
      ${secondary('Скопировать ссылку', async () => { add(); if (inv && (await copyText(inv.link))) showToast('Ссылка скопирована'); }, { icon: 'link' })}`,
  });
}

// ───────────────────────── профиль ─────────────────────────

let profileName = '';
let profileFor = '';

export function profileSheet(): TemplateResult {
  const cur = getState().settings.userName;
  if (profileFor !== cur) {
    profileFor = cur;
    profileName = cur;
  }
  return frame({
    title: 'Ваш профиль',
    body: html`
      ${field({ id: 'p-name', label: 'Как вас подписывать', value: profileName, maxlength: 30, onInput: (v) => { profileName = v; } })}
      ${note('Под этим именем записи появляются в журнале: «Мама», «Папа», «Бабушка».')}`,
    footer: html`${primary('Сохранить', () => saveProfile(profileName), { icon: 'check' })}`,
  });
}

// ───────────────────────── вход ─────────────────────────

export function loginSheet(sh: SimpleSheet): TemplateResult {
  const text = ui.loginText;
  return frame({
    title: 'Вход',
    body: html`
      <div style="font-size:15px;font-weight:500;line-height:21px">Аккаунтов в Дрёме нет: записи хранятся на вашем телефоне, и это сделано намеренно — ничего не уходит на чужие серверы.</div>
      <div style="font-size:15px;font-weight:500;line-height:21px">Если у вас есть файл копии или ссылка-приглашение, загрузите их здесь.</div>
      ${textarea('l-text', 'Ссылка или содержимое копии', text, (v) => { ui.loginText = v; }, 'Вставьте сюда')}
      ${errorLine(sh.error)}
      <label style="min-height:52px;border:1.5px dashed var(--s-line);border-radius:26px;display:flex;align-items:center;justify-content:center;gap:8px;font-size:16px;font-weight:700;cursor:pointer">
        ${icon('doc', { size: 20 })}Выбрать файл копии
        <input type="file" accept="application/json,.json" style="position:absolute;opacity:0;width:1px;height:1px" @change=${(e: Event) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void importFromFile(f); }} />
      </label>`,
    footer: html`${primary('Войти', () => submitLogin(ui.loginText), { icon: 'check' })}`,
  });
}

// ───────────────────────── участник ─────────────────────────

export function memberSheet(sh: MemberSheet): TemplateResult {
  const roles: Array<{ value: Exclude<Role, 'owner'>; label: string }> = [
    { value: 'editor', label: 'Записывает' },
    { value: 'viewer', label: 'Смотрит' },
  ];
  return frame({
    title: 'Участник',
    body: html`
      ${field({ id: 'm-name', label: 'Имя', value: sh.name, maxlength: 30, onInput: (v) => patchMember({ name: v }) })}
      ${segmented('Роль', roles, sh.role === 'owner' ? 'editor' : sh.role, (v) => patchMember({ role: v }))}
      ${note(`${ROLE_LABEL[sh.role]}. Пока данные хранятся на этом телефоне, роль — только подпись в списке. Когда появится общий доступ, она определит права.`)}`,
    footer: html`${primary('Сохранить', saveMember, { icon: 'check' })}${danger('Убрать из списка', deleteMember, { icon: 'trash' })}`,
  });
}

// ───────────────────────── подтверждение ─────────────────────────

export function confirmSheet(sh: ConfirmSheet): TemplateResult {
  return frame({
    title: sh.title,
    body: html`<div style="font-size:15px;font-weight:500;line-height:22px">${sh.text}</div>`,
    footer: html`${sh.danger ? danger(sh.confirm, sh.run) : primary(sh.confirm, sh.run)}${quiet('Отмена', closeSheet)}`,
  });
}
