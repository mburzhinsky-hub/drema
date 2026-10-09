/** Отправка наружу: выписка врачу, приглашение, печать. Без сервера — через системное «Поделиться», Telegram и буфер обмена. */
import { html, render } from 'lit-html';
import { now } from '../engine/time';
import { derive } from '../store/select';
import { getState } from '../store/store';
import { currentReport } from './reportData';
import { makeSnapshot, snapshotLink } from './share';
import { closeSheet, showToast } from './ui';

export type ShareHow = 'telegram' | 'max' | 'copy' | 'native';

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

async function nativeShare(data: { title?: string; text?: string; url?: string }): Promise<'shared' | 'cancelled' | 'unsupported'> {
  if (typeof navigator.share !== 'function') return 'unsupported';
  try {
    await navigator.share(data);
    return 'shared';
  } catch (e) {
    return (e as DOMException)?.name === 'AbortError' ? 'cancelled' : 'unsupported';
  }
}

const openTelegram = (url: string, text: string): void => {
  const href = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  window.open(href, '_blank', 'noopener');
};

/** Выписка врачу. */
export async function shareReport(how: ShareHow): Promise<void> {
  const r = currentReport();
  if (!r) return;
  const title = r.doc.title;
  if (how === 'telegram') {
    // В Telegram уходит только текст: у выписки нет адреса.
    const href = `https://t.me/share/url?url=${encodeURIComponent(' ')}&text=${encodeURIComponent(r.text)}`;
    window.open(href, '_blank', 'noopener');
    closeSheet();
    return;
  }
  if (how === 'copy') {
    const ok = await copyText(r.text);
    closeSheet();
    showToast(ok ? 'Выписка скопирована — вставьте в чат с врачом' : 'Не удалось скопировать. Откройте «Поделиться».');
    return;
  }
  // «max» и «native»: у Max нет открытой ссылки для отправки, поэтому используем системное меню «Поделиться».
  const res = await nativeShare({ title, text: r.text });
  if (res === 'shared' || res === 'cancelled') {
    if (res === 'shared') closeSheet();
    return;
  }
  const ok = await copyText(r.text);
  closeSheet();
  showToast(ok ? 'Выписка скопирована — вставьте её в Max' : 'Не удалось поделиться. Скопируйте текст вручную.');
}

/** Ссылка «только смотреть» с текущим снимком. */
export function inviteLink(): { link: string; text: string } | null {
  const t = now();
  const d = derive(getState(), t);
  if (!d) return null;
  const link = snapshotLink(makeSnapshot(d, t));
  return { link, text: `Смотри, как сейчас ${d.child.name}: ${link}` };
}

export async function shareInvite(how: ShareHow): Promise<void> {
  const inv = inviteLink();
  if (!inv) return;
  const d = derive(getState(), now());
  const name = d?.child.name ?? 'малыш';
  if (how === 'telegram') {
    openTelegram(inv.link, `Смотри, как сейчас ${name}:`);
    return;
  }
  if (how === 'copy') {
    const ok = await copyText(inv.link);
    showToast(ok ? 'Ссылка скопирована' : 'Не удалось скопировать — выделите ссылку в окне приглашения');
    return;
  }
  const res = await nativeShare({ title: 'Дрёма', text: `Смотри, как сейчас ${name}:`, url: inv.link });
  if (res === 'unsupported') {
    const ok = await copyText(inv.link);
    showToast(ok ? (how === 'max' ? 'Ссылка скопирована — вставьте её в Max' : 'Ссылка скопирована') : 'Не удалось поделиться');
  }
}

/** Печать выписки: рисуем лист в скрытый блок, браузер сам предложит «Сохранить как PDF». */
export function printReport(): void {
  const r = currentReport();
  const host = document.getElementById('print-sheet');
  if (!r || !host) return;
  render(
    html`
      <h1>${r.doc.title}</h1>
      <p>${r.doc.heading}</p>
      ${r.doc.sections.map(
        (s) => html`
          <h2>${s.title}</h2>
          ${s.bullets ? html`<ul>${s.bullets.map((b) => html`<li>${b}</li>`)}</ul>` : ''}
          ${s.text ? html`<p>${s.text}</p>` : ''}
        `,
      )}
      <p class="foot">${r.doc.footer}</p>
    `,
    host,
  );
  const old = document.title;
  document.title = `Выписка — ${r.child.name}`;
  const restore = (): void => {
    document.title = old;
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);
  setTimeout(() => window.print(), 50);
}
