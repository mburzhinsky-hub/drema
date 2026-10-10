/** Корень приложения: маршруты, охранники, перерисовка, шторки и уведомления. */
import { html, nothing, render, TemplateResult } from 'lit-html';
import { explain } from '../engine/explain';
import { backtest, inNightWindow, live } from '../engine/predict';
import { MIN, DAY, addDays, isoDate, minutesOfDay, now, parseHM, startOfDay } from '../engine/time';
import { periodStats } from '../engine/week';
import { activeChild } from '../store/actions';
import { derive, Derived } from '../store/select';
import { AppState } from '../store/state';
import { getState, subscribe } from '../store/store';
import { dayScreen } from '../ui/screens/day';
import { familyScreen } from '../ui/screens/family';
import { homeScreen } from '../ui/screens/home';
import { nightScreen } from '../ui/screens/night';
import { onboardingScreen } from '../ui/screens/onboarding';
import { reportScreen } from '../ui/screens/report';
import { settingsScreen } from '../ui/screens/settings';
import { sleepingScreen } from '../ui/screens/sleeping';
import { splashScreen } from '../ui/screens/splash';
import { viewScreen } from '../ui/screens/view';
import { whyScreen } from '../ui/screens/why';
import { sheetView } from '../ui/sheets';
import { icon } from '../ui/icons';
import * as F from './flows';
import * as M from './manage';
import * as S from './sharing';
import { Route, RouteName, go, parseHash } from './router';
import { Toast, closeSheet, hideToast, invalidate, openSheet, renderNow, setRenderer, ui } from './ui';
import { TimelineRow } from '../engine/day';

export interface StartOptions {
  /** Проверочный режим: часы заморожены, охранники и автоночь выключены. */
  fixture: boolean;
}

let root: HTMLElement;
let fixture = false;
let lastRouteName: RouteName | '' = '';

/** Какие маршруты рисуются без нижней навигации. */
const NO_NAV: ReadonlySet<RouteName> = new Set(['sleeping', 'night', 'welcome', 'onboarding', 'settings', 'why', 'view']);
const THEME: Partial<Record<RouteName, string>> = { sleeping: '#1A1850', night: '#0B0D1C', welcome: '#221F66' };
/**
 * Цвет полосы под строкой состояния на iPhone с вырезом, когда приложение открыто с экрана «Домой».
 * Статус-бар там белый и полупрозрачный, поэтому на светлых экранах полоса тёмная, а на тёмных совпадает с экраном:
 * ночью сверху не вспыхивает белое. Без выреза полоса нулевой высоты и ничего не меняет.
 */
const TONE: Partial<Record<RouteName, string>> = { sleeping: '#1A1850', night: '#0B0D1C', welcome: '#1A1850' };
const TONE_LIGHT = '#221F66';
/** Цвет страницы за краями приложения: совпадает с фоном экрана. */
const PAGE_BG: Partial<Record<RouteName, string>> = { sleeping: '#1A1850', night: '#0B0D1C', welcome: '#1A1850' };

/** Ночь «принадлежит» дате, в которую началась: для 03:00 это вчера. */
export function nightKey(t: number, nightTo: string): string {
  const to = parseHM(nightTo);
  const crossing = minutesOfDay(t) < to && to <= 12 * 60;
  return isoDate(crossing ? addDays(startOfDay(t), -1) : startOfDay(t));
}

/** Куда перенаправить, если текущий маршрут сейчас недоступен. null — остаёмся. */
export function guard(route: Route, s: AppState, d: Derived | null, t: number): string | null {
  const open = route.name === 'welcome' || route.name === 'onboarding' || route.name === 'view';
  if (route.name === 'view') return null;
  if (!s.onboarded || !d) return open ? null : '/welcome';
  if (route.name === 'welcome' || route.name === 'onboarding') return '/';
  if (route.name === 'sleeping' && !d.active) return '/';
  if (route.name === 'why' && !d.forecast) return '/';
  if (route.name === 'home' && s.settings.nightAuto && inNightWindow(t, s.settings) && ui.nightDismissed !== nightKey(t, s.settings.nightTo)) {
    ui.nightAuto = true;
    return '/night';
  }
  if (route.name === 'night' && ui.nightAuto && !inNightWindow(t, s.settings)) {
    ui.nightAuto = false;
    return '/';
  }
  return null;
}

// ───────────────────────── действия экранов ─────────────────────────

const homeActions = {
  startSleep: () => F.quickSleep(),
  wake: () => F.quickWake(),
  openFeed: F.openFeed,
  openDiaper: F.openDiaper,
  openMore: F.openMore,
  openChild: M.openChildList,
  openReminders: () => openSheet({ kind: 'reminders' }),
  openEvent: F.openEvent,
};

const dayActions = {
  shift(days: number) {
    ui.dayOffset = Math.min(0, Math.max(-400, ui.dayOffset + days));
    invalidate();
  },
  setTab(tab: 'day' | 'week') {
    ui.dayTab = tab;
    invalidate();
  },
  openRow(r: TimelineRow) {
    const e = getState().events.find((x) => x.id === r.eventId);
    if (!e) return;
    if (e.type === 'sleep') F.openSleepEdit(e.id);
    else F.openEvent(e);
  },
  pickDay(dayStart: number) {
    ui.dayOffset = Math.round((dayStart - startOfDay(now())) / DAY);
    ui.dayTab = 'day';
    invalidate();
  },
};

const nightActions = (d: Derived) => ({
  feed: F.openFeed,
  diaper: F.openDiaper,
  toggleSleep: () => (d.active ? F.quickWake(true) : F.quickSleep(true)),
  more: F.openMore,
  voice: F.openVoice,
  exit() {
    ui.nightDismissed = nightKey(now(), getState().settings.nightTo);
    ui.nightAuto = false;
    go('/');
  },
});

const reportActions = {
  setRange(r: 'week' | 'month') {
    ui.reportRange = r;
    invalidate();
  },
  setQuestion(q: string) {
    ui.reportQuestion = q;
    invalidate();
  },
  send: () => openSheet({ kind: 'share-report' }),
  pdf: S.printReport,
};

const familyActions = {
  openMember: M.openMember,
  openProfile: () => openSheet({ kind: 'profile' }),
  invite: () => openSheet({ kind: 'invite' }),
  shareTelegram: () => S.shareInvite('telegram'),
  shareMax: () => S.shareInvite('max'),
  copyLink: () => S.shareInvite('copy'),
};

// ───────────────────────── экран по маршруту ─────────────────────────

function screenFor(route: Route, s: AppState, d: Derived | null, t: number): TemplateResult {
  switch (route.name) {
    case 'welcome':
      return splashScreen({ start: () => go('/onboarding'), login: () => openSheet({ kind: 'login' }) });
    case 'onboarding':
      return onboardingScreen();
    case 'view':
      return viewScreen(route.arg, t);
    default:
      break;
  }
  if (!d) return html``;
  switch (route.name) {
    case 'sleeping':
      return d.active
        ? sleepingScreen(d, d.active, t, { wake: () => F.quickWake(), editTime: () => d.active && F.openSleepEdit(d.active.id) })
        : html``;
    case 'night':
      return nightScreen(d, t, nightActions(d));
    case 'day':
      return dayScreen(d, t, ui.dayOffset, ui.dayTab, dayActions);
    case 'why':
      return d.forecast ? whyScreen(d, t, live(d.forecast, t), explain(d.forecast, d.child.gender), backtest(d.ctx)) : html``;
    case 'family':
      return familyScreen(d, t, s.members, familyActions);
    case 'report': {
      const n = ui.reportRange === 'month' ? 30 : 7;
      const ps = periodStats(d.events, d.child.id, startOfDay(t), n, t);
      return reportScreen(ps, ui.reportRange, ui.reportQuestion, reportActions);
    }
    case 'settings':
      return settingsScreen(d, t);
    default:
      return homeScreen(d, t, homeActions, root.clientHeight || 844);
  }
}

const toastView = (tst: Toast | null, high: boolean, top: boolean): TemplateResult => html`
  <div aria-live="polite" role="status">
    ${tst
      ? html`<div class="toast ${top ? 'top' : tst.high || high ? 'high' : ''}" data-id=${tst.id}>
          <span style="flex:1">${tst.text}</span>
          ${tst.action
            ? html`<button type="button" @click=${() => { const run = tst.action!.run; hideToast(); run(); }} style="min-height:44px;border:0;border-radius:22px;background:rgba(255,255,255,0.14);color:#FFD66B;padding:0 16px;font-size:15px;font-weight:700">${tst.action.label}</button>`
            : nothing}
          <button type="button" @click=${hideToast} aria-label="Закрыть" style="width:44px;height:44px;border:0;border-radius:22px;background:transparent;color:#C9C8F5;display:flex;align-items:center;justify-content:center">${icon('close', { size: 20 })}</button>
        </div>`
      : nothing}
  </div>`;

let lastSheet: unknown = null;

function draw(): void {
  const s = getState();
  const t = now();
  const d = derive(s, t);

  let route = parseHash(location.hash);
  if (!fixture) {
    for (let i = 0; i < 3; i++) {
      const to = guard(route, s, d, t);
      if (!to) break;
      history.replaceState(null, '', `#${to}`);
      route = parseHash(location.hash);
    }
  }
  if (route.name !== lastRouteName) {
    if (route.name !== 'day') {
      ui.dayOffset = 0;
      ui.dayTab = 'day';
    }
    lastRouteName = route.name;
    const theme = document.querySelector('meta[name="theme-color"]');
    theme?.setAttribute('content', THEME[route.name] ?? '#F1F3FB');
    document.documentElement.style.setProperty('--page-bg', PAGE_BG[route.name] ?? '#F1F3FB');
  }

  const sheet = ui.sheet;
  const tpl = html`
    <div style="position:relative;width:100%;height:100%;overflow:hidden">
      <div class="screen" style="--tone:${TONE[route.name] ?? TONE_LIGHT}" ?inert=${!!sheet}>${screenFor(route, s, d, t)}</div>
      ${sheet
        ? html`<div class="sheet-backdrop" @click=${closeSheet}></div>${sheetView(sheet)}`
        : nothing}
      ${toastView(ui.toast, NO_NAV.has(route.name), !!sheet)}
    </div>`;
  render(tpl, root);

  // Фокус уходит на шторку, только когда она открылась (или сменилась), и только если он ещё не внутри неё.
  // Состояние шторки обновляется новой копией на каждую набранную букву: без проверки фокус на каждой букве
  // перескакивал бы с поля на шторку, и клавиатура закрывалась бы (текст вводился по одной букве).
  if (sheet && sheet !== lastSheet) {
    const el = root.querySelector<HTMLElement>('.sheet');
    if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
  }
  lastSheet = sheet;
}

// ───────────────────────── запуск ─────────────────────────

let lastMinute = -1;

function tick(): void {
  if (fixture) return;
  const t = now();
  const s = getState();
  const d = derive(s, t);
  const route = parseHash(location.hash).name;
  const seconds = !!d?.active && (route === 'home' || route === 'sleeping' || route === 'night');
  const minute = Math.floor(t / MIN);
  if (seconds || minute !== lastMinute) {
    lastMinute = minute;
    invalidate();
  }
}

export function start(opts: StartOptions): void {
  fixture = opts.fixture;
  root = document.getElementById('app')!;
  setRenderer(draw);
  window.addEventListener('hashchange', invalidate);
  subscribe(invalidate);
  window.addEventListener('resize', invalidate);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') invalidate();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ui.sheet) closeSheet();
  });

  if (!fixture) {
    // Холодный старт: если малыш спит, сразу показываем экран сна.
    const s = getState();
    const d = derive(s, now());
    if (s.onboarded && d?.active && parseHash(location.hash).name === 'home' && !(s.settings.nightAuto && inNightWindow(now(), s.settings))) {
      history.replaceState(null, '', '#/sleeping');
    }
    setInterval(tick, 1000);
  }
  renderNow();
}

export { activeChild };
