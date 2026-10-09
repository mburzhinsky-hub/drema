import { html, svg, TemplateResult } from 'lit-html';
import { feedLabel, feedsOf, lastFeed, typicalFeedInterval } from '../../engine/feed';
import { fmtDurWords, fmtDurWordsGen } from '../../engine/format';
import { feedRingDash } from '../../engine/geometry';
import { fmtDur } from '../../engine/format';
import { hm } from '../../engine/time';
import { Derived } from '../../store/select';
import { Icon, icon } from '../icons';
import { SANS, SERIF, durText } from '../parts';

export interface NightActions {
  feed(): void;
  diaper(): void;
  toggleSleep(): void;
  more(): void;
  voice(): void;
  exit(): void;
}

const tile = (bg: string, fg: string, ring: string, shine: number, label: string, ic: Icon, onClick: () => void): TemplateResult => html`
  <button type="button" @click=${onClick} style="height:136px;border:0;border-radius:30px;background:${bg};color:${fg};font-family:${SANS};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:0;box-shadow:inset 0 1px 0 rgba(255,255,255,${shine})">
    <span style="width:56px;height:56px;border-radius:28px;background:${ring};display:flex;align-items:center;justify-content:center">${ic}</span>
    <span style="font-size:17px;font-weight:700">${label}</span>
  </button>`;

export function nightScreen(d: Derived, t: number, a: NightActions): TemplateResult {
  const feeds = feedsOf(d.events, d.child.id);
  const lf = lastFeed(feeds, t);
  const typical = typicalFeedInterval(feeds, d.norm, t);
  const since = lf ? Math.max(0, (t - lf.t) / 60000) : 0;
  const sinceShown = Math.floor(since + 1e-6);
  const asleep = !!d.active;

  const subtitle = asleep && d.active ? `Спит с ${hm(d.active.t)} · ${fmtDur((t - d.active.t) / 60000)}` : 'Ночной режим · экран приглушён';

  const aria = lf
    ? `${fmtDurWords(sinceShown)} из обычных ${fmtDurWordsGen(typical.minutes)} между кормлениями`
    : 'Кормлений пока нет';

  return html`
    <div style="position:relative;width:100%;height:100%;box-sizing:border-box;background:#0B0D1C;overflow:hidden;display:flex;flex-direction:column;font-family:${SANS};color:#ECEBFF">
      <div style="position:absolute;left:0;top:0;width:100%;height:420px;background:radial-gradient(circle at 50% 0%, rgba(75,72,214,0.30) 0%, rgba(75,72,214,0) 70%)"></div>

      <div style="position:relative;flex:none;padding:24px 20px 0;display:flex;align-items:center;gap:12px">
        <div style="width:44px;height:44px;border-radius:22px;background:#151833;border:1px solid rgba(255,196,107,0.25);color:#FFC46B;display:flex;align-items:center;justify-content:center">${icon('moon', { fo: 0.22 })}</div>
        <div style="display:flex;flex-direction:column;gap:1px"><div style="font-size:17px;font-weight:700;line-height:22px">${d.child.name}</div><div style="font-size:13px;font-weight:500;line-height:18px;color:#A3A6C9">${subtitle}</div></div>
      </div>

      <div style="position:relative;flex:none;margin:20px 20px 0;box-sizing:border-box;border-radius:32px;background:linear-gradient(160deg,#1E2148 0%,#151833 100%);border:1px solid rgba(255,196,107,0.22);padding:20px 20px 20px 22px;display:flex;align-items:center;justify-content:space-between;box-shadow:inset 0 1px 0 rgba(255,255,255,0.06),0 26px 44px -26px rgba(255,196,107,0.30)">
        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="font-size:12px;font-weight:700;letter-spacing:0.1em;color:#A3A6C9">С ПОСЛЕДНЕГО КОРМЛЕНИЯ</div>
          ${lf
            ? html`<div style="font-family:${SERIF};font-weight:400;font-size:41px;line-height:1.15;letter-spacing:-0.01em;white-space:nowrap;color:#FFC46B;text-shadow:0 0 28px rgba(255,196,107,0.45)">${durText(sinceShown, false)}</div>
                <div style="font-size:14px;font-weight:500;color:#A3A6C9">${d.w.fed} в ${hm(lf.t)}${lf.how === 'bottle' && lf.ml ? ` · ${lf.ml} мл` : lf.how !== 'bottle' ? ` · ${feedLabel(lf).split(' · ')[0].toLowerCase()}` : ''}</div>`
            : html`<div style="font-family:${SERIF};font-weight:400;font-size:30px;line-height:1.2;color:#FFC46B;text-shadow:0 0 28px rgba(255,196,107,0.45)">Нет записей</div>
                <div style="font-size:14px;font-weight:500;color:#A3A6C9">Нажмите «Кормление»</div>`}
        </div>
        <div style="position:relative;width:76px;height:76px;flex:none">
          <svg width="76" height="76" viewBox="0 0 80 80" fill="none" role="img" aria-label=${aria}>
            <circle cx="40" cy="40" r="32" stroke="#FFFFFF" stroke-opacity="0.10" stroke-width="7"/>
            ${lf ? svg`<circle cx="40" cy="40" r="32" stroke="#FFC46B" stroke-width="7" stroke-linecap="round" stroke-dasharray="${feedRingDash(since, typical.minutes)} 201.1" transform="rotate(-90 40 40)" style="filter:drop-shadow(0 0 5px rgba(255,196,107,0.7))"/>` : ''}
          </svg>
          <div style="position:absolute;left:0;top:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;color:#FFC46B">${icon('bottle', { size: 26, fo: 0.22 })}</div>
        </div>
      </div>

      <div style="position:relative;flex:none;margin:14px 20px 0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">
        ${tile('linear-gradient(180deg,#462C27 0%,#331F1C 100%)', '#FFB4A3', 'rgba(255,180,163,0.16)', 0.1, 'Кормление', icon('bottle', { size: 32, sw: 1.6, fo: 0.22 }), a.feed)}
        ${tile('linear-gradient(180deg,#183830 0%,#112822 100%)', '#8FD9B8', 'rgba(143,217,184,0.16)', 0.09, 'Подгузник', icon('diaper', { size: 32, sw: 1.6, fo: 0.22 }), a.diaper)}
        ${tile('linear-gradient(180deg,#2E3180 0%,#202262 100%)', '#C5C4FF', 'rgba(197,196,255,0.16)', 0.12, asleep ? d.w.wokeUp : d.w.fellAsleep, asleep ? icon('sun', { size: 32, sw: 1.6, fo: 0.22 }) : icon('moon', { size: 32, sw: 1.6, fo: 0.22 }), a.toggleSleep)}
        ${tile('linear-gradient(180deg,#252954 0%,#1A1D3B 100%)', '#B9BCDD', 'rgba(185,188,221,0.14)', 0.08, 'Ещё', icon('plus', { size: 32 }), a.more)}
      </div>

      <div style="position:relative;flex:none;margin:16px 20px 0;display:flex;flex-direction:column;gap:10px;align-items:center">
        <button type="button" @click=${a.voice} style="width:100%;height:76px;box-sizing:border-box;border:0;border-radius:38px;background:linear-gradient(180deg,#5A57EC 0%,#3F3CBB 100%);color:#FFFFFF;font-family:${SANS};font-size:18px;font-weight:700;display:flex;align-items:center;gap:14px;padding:0 20px 0 14px;text-align:left;box-shadow:inset 0 1px 0 rgba(255,255,255,0.32),0 0 46px -6px rgba(90,87,236,0.75)">
          <span style="width:48px;height:48px;border-radius:24px;background:rgba(255,255,255,0.18);display:flex;align-items:center;justify-content:center;flex:none">${icon('mic', { size: 26 })}</span>
          <span style="flex:1">Сказать вслух</span>
          <svg width="44" height="28" viewBox="0 0 44 28" fill="none" aria-hidden="true"><rect x="2" y="10" width="4" height="8" rx="2" fill="#FFFFFF" fill-opacity="0.55"/><rect x="10" y="5" width="4" height="18" rx="2" fill="#FFFFFF" fill-opacity="0.8"/><rect x="18" y="1" width="4" height="26" rx="2" fill="#FFFFFF"/><rect x="26" y="6" width="4" height="16" rx="2" fill="#FFFFFF" fill-opacity="0.8"/><rect x="34" y="11" width="4" height="6" rx="2" fill="#FFFFFF" fill-opacity="0.55"/></svg>
        </button>
        <div style="font-size:14px;font-weight:500;color:#A3A6C9">Например: «покормила, 120 мл»</div>
      </div>

      <div style="flex:1"></div>

      <div style="position:relative;flex:none;padding:0 20px 28px;display:flex;justify-content:center">
        <button type="button" @click=${a.exit} style="min-height:48px;border:0;background:transparent;color:#A3A6C9;font-family:${SANS};font-size:15px;font-weight:600;display:flex;align-items:center;gap:8px;padding:0 16px">
          ${icon('sun', { size: 20 })}
          Выйти из ночного режима
        </button>
      </div>
    </div>`;
}
