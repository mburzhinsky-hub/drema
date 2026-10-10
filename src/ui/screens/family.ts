import { html, svg, TemplateResult } from 'lit-html';
import { fmtDur } from '../../engine/format';
import { progressPct } from '../../engine/geometry';
import { Member } from '../../engine/model';
import { computeOutlook, live } from '../../engine/predict';
import { hm } from '../../engine/time';
import { Derived } from '../../store/select';
import { icon } from '../icons';
import { SANS, SERIF, initial } from '../parts';
import { cardRings, navBar, topGlow } from '../shell';

export interface FamilyActions {
  openMember(m: Member): void;
  openProfile(): void;
  invite(): void;
  shareTelegram(): void;
  shareMax(): void;
  copyLink(): void;
}

export const ROLE_LABEL = { owner: 'Владелец', editor: 'Может записывать', viewer: 'Только смотрит' } as const;

const AVATAR = [
  { bg: '#E6E6FB', fg: '#3F3CBB' },
  { bg: '#FFF0C2', fg: '#6B4E00' },
  { bg: '#DDF1E8', fg: '#1E6B4C' },
  { bg: '#FDE8E2', fg: '#A8341F' },
];

function memberRow(m: Member, i: number, last: boolean, you: string, a: FamilyActions): TemplateResult {
  const owner = m.role === 'owner';
  const av = owner
    ? 'background:#3F3CBB;color:#FFFFFF;box-shadow:inset 0 1px 0 rgba(255,255,255,0.3),0 8px 14px -8px rgba(63,60,187,0.8)'
    : `background:${AVATAR[(i - 1) % AVATAR.length].bg};color:${AVATAR[(i - 1) % AVATAR.length].fg}`;
  const sub =
    m.role === 'viewer'
      ? html`<span style="font-size:13px;font-weight:500;line-height:18px;color:#5A5F7A;display:flex;align-items:center;gap:5px">${icon('eye', { size: 15, sw: 1.9 })}${ROLE_LABEL.viewer}</span>`
      : html`<span style="font-size:13px;font-weight:500;line-height:18px;color:#5A5F7A">${ROLE_LABEL[m.role]}</span>`;
  return html`
    <button type="button" @click=${() => (owner ? a.openProfile() : a.openMember(m))} style="width:100%;min-height:64px;border:0;${last ? '' : 'border-bottom:1px solid #E9ECF5;'}background:transparent;padding:0;display:flex;align-items:center;gap:14px;text-align:left;font-family:${SANS};color:#14172E">
      <span style="width:40px;height:40px;border-radius:20px;${av};display:flex;align-items:center;justify-content:center;font-family:${SERIF};font-weight:400;font-size:18px;flex:none">${initial(m.name)}</span>
      <span style="flex:1;display:flex;flex-direction:column;gap:1px"><span style="font-size:16px;font-weight:600;line-height:21px">${m.name}${owner ? ` (${you})` : ''}</span>${sub}</span>
      ${owner ? '' : icon('chevR', { size: 18, stroke: '#5A5F7A' })}
    </button>`;
}

const share = (flex: string, ic: TemplateResult | ReturnType<typeof icon>, label: string, onClick: () => void): TemplateResult => html`
  <button type="button" @click=${onClick} style="flex:${flex};min-height:44px;border:1.5px solid #D7DAEC;border-radius:22px;background:#FFFFFF;color:#14172E;font-family:${SANS};font-size:14px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:6px;padding:0">${ic}${label}</button>`;

/** Что показывает карточка «так увидит бабушка»: одинаково для предпросмотра и для страницы по ссылке. */
export interface ViewerModel {
  title: string;
  sub: string;
  /** Заполнение шкалы, %; null — шкалы нет. */
  pct: number | null;
  aria: string;
  icon: 'moon' | 'sun' | 'clock';
}

export function viewerFromDerived(d: Derived, t: number): ViewerModel {
  const s = d.active;
  if (s) {
    const out = computeOutlook(d.ctx, s);
    const min = Math.max(0, (t - s.t) / 60000);
    const ref = out.range ? out.range[1] : out.ringScaleMin;
    return {
      title: `${d.child.name} ${d.w.sleepsNow}`,
      sub: `с ${hm(s.t)} · уже ${fmtDur(Math.floor(min + 1e-6))}`,
      pct: progressPct(min, ref),
      aria: out.range
        ? `Сон идёт ${fmtDur(Math.floor(min))} из обычных ${fmtDur(out.range[1])}`
        : `Сон идёт ${fmtDur(Math.floor(min))}`,
      icon: 'moon',
    };
  }
  if (d.forecast) {
    const lf = live(d.forecast, t);
    return {
      title: `${d.child.name} не спит`,
      sub: `с ${hm(lf.wakeAt)} · уже ${fmtDur(Math.floor(lf.awakeMin + 1e-6))}`,
      pct: progressPct(lf.awakeMin, lf.windowMin),
      aria: `Бодрствует ${fmtDur(Math.floor(lf.awakeMin))}, следующий сон около ${hm(lf.predictedAt)}`,
      icon: 'sun',
    };
  }
  return { title: d.child.name, sub: 'Свежих записей пока нет', pct: null, aria: '', icon: 'clock' };
}

/** Что увидит человек, открывший ссылку-приглашение. */
export function viewerCard(d: Derived, t: number): TemplateResult {
  return viewerCardView(viewerFromDerived(d, t));
}

export function viewerCardView(m: ViewerModel): TemplateResult {
  const { title, sub, aria } = m;
  const pct = m.pct ?? 0;
  const ic = m.icon === 'moon' ? icon('moon', { size: 28, fo: 0.9 }) : m.icon === 'sun' ? icon('sun', { size: 28, fo: 0.9 }) : icon('clock', { size: 28, fo: 0.3 });
  return html`
    <div style="flex:none;position:relative;margin:8px 20px 0;box-sizing:border-box;border-radius:32px;background:#221F66;color:#FFFFFF;padding:20px;overflow:hidden;display:flex;flex-direction:column;gap:16px;box-shadow:0 26px 46px -26px rgba(34,31,102,0.75)">
      ${cardRings(350, 150, svg`<circle cx="330" cy="10" r="100" stroke="#FFFFFF" stroke-opacity="0.06" stroke-width="2"/><circle cx="330" cy="10" r="62" stroke="#FFFFFF" stroke-opacity="0.06" stroke-width="2"/><circle cx="200" cy="22" r="1.2" fill="#FFFFFF" fill-opacity="0.6"/><circle cx="288" cy="120" r="1" fill="#FFFFFF" fill-opacity="0.5"/>`)}
      <div style="position:relative;display:flex;align-items:center;gap:16px">
        <div style="width:56px;height:56px;border-radius:28px;background:rgba(255,255,255,0.12);color:#FFD66B;display:flex;align-items:center;justify-content:center;flex:none;box-shadow:0 0 22px rgba(255,214,107,0.28)">${ic}</div>
        <div style="min-width:0;display:flex;flex-direction:column;gap:3px">
          <div style="font-family:${SERIF};font-weight:400;font-size:25px;line-height:1.2;letter-spacing:0;text-shadow:0 0 22px rgba(179,177,255,0.5)">${title}</div>
          <div style="font-size:15px;font-weight:500;color:#C9C8F5">${sub}</div>
        </div>
      </div>
      ${aria
        ? html`<div role="img" aria-label=${aria} style="position:relative;height:8px;border-radius:4px;background:rgba(255,255,255,0.14)"><div style="width:${pct}%;height:8px;border-radius:4px;background:#B3B1FF;box-shadow:0 0 12px rgba(179,177,255,0.7)"></div></div>`
        : ''}
    </div>`;
}

export function familyScreen(d: Derived, t: number, members: Member[], a: FamilyActions): TemplateResult {
  const viewer = members.find((m) => m.role === 'viewer');
  return html`
    <div style="position:relative;width:100%;height:100%;box-sizing:border-box;background:#F1F3FB;overflow:hidden;font-family:${SANS};color:#14172E">
      ${topGlow(0.14)}
      <div style="position:relative;height:100%;display:flex;flex-direction:column">
        <div class="scroll" style="flex:1;min-height:0;display:flex;flex-direction:column">
          <div style="flex:none;padding:28px 20px 0">
            <h1 style="margin:0;font-family:${SERIF};font-weight:400;font-size:32px;line-height:1.2;letter-spacing:-0.01em">Семья</h1>
          </div>

          <div style="flex:none;margin:16px 20px 0;box-sizing:border-box;border-radius:28px;background:#FFFFFF;padding:6px 18px;display:flex;flex-direction:column;box-shadow:0 1px 2px rgba(20,23,46,0.04),0 16px 36px -22px rgba(34,31,102,0.3)">
            ${members.map((m, i) => memberRow(m, i, i === members.length - 1, 'вы', a))}
          </div>

          <div style="flex:none;margin:16px 20px 0">
            <button type="button" @click=${a.invite} style="width:100%;height:60px;border:0;border-radius:30px;background:#3F3CBB;color:#FFFFFF;font-family:${SANS};font-size:17px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:inset 0 1px 0 rgba(255,255,255,0.28),0 18px 28px -14px rgba(63,60,187,0.85)">
              ${icon('link', { size: 22, sw: 1.85 })}
              Пригласить по ссылке
            </button>
          </div>
          <div style="flex:none;margin:12px 20px 0;display:flex;gap:8px">
            ${share('1', icon('send', { size: 18 }), 'Telegram', a.shareTelegram)}
            ${share('1', icon('send', { size: 18 }), 'Max', a.shareMax)}
            ${share('1.3', icon('doc', { size: 18 }), 'Скопировать', a.copyLink)}
          </div>

          <div style="flex:none;margin:20px 20px 0;font-size:12px;font-weight:700;letter-spacing:0.1em;color:#5A5F7A">ТАК УВИДИТ ${(viewer?.name ?? 'Бабушка').toUpperCase()}</div>
          ${viewerCard(d, t)}
          <div style="flex:none;margin:10px 20px 16px;font-size:13px;font-weight:400;line-height:18px;color:#5A5F7A">Ссылка открывается без регистрации и без установки приложения.</div>
        </div>
        ${navBar('family')}
      </div>
    </div>`;
}
