/**
 * Сведения об экране для поддержки: как браузер видит окно, масштаб, безопасные зоны, видимую область.
 * Нужны, когда на конкретном телефоне что-то стоит не так (поля по краям, пустая полоса, уезжающий экран):
 * по этим числам видно причину, а не приходится гадать.
 */

export interface Row {
  label: string;
  value: string;
}

const px = (n: number | undefined): string => (n === undefined || Number.isNaN(n) ? '—' : `${Math.round(n * 10) / 10}`);
const size = (w: number | undefined, h: number | undefined): string => `${px(w)} × ${px(h)}`;

/** Безопасные зоны (вырез, индикатор «Домой»): их знает только браузер, поэтому меряем через пробный элемент. */
export function safeAreas(win: Window, doc: Document): { top: number; right: number; bottom: number; left: number } {
  const probe = doc.createElement('div');
  probe.style.cssText =
    'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
    'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  doc.body.appendChild(probe);
  const cs = win.getComputedStyle(probe);
  const out = { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
  probe.remove();
  return out;
}

/** Во сколько раз страница показана крупнее/мельче, чем при масштабе 100 % (в Safari: «Масштаб страницы»). */
export function pageZoom(screenWidth: number, innerWidth: number): number {
  if (!screenWidth || !innerWidth) return 1;
  return screenWidth / innerWidth;
}

export function screenInfo(win: Window = window, doc: Document = document): Row[] {
  const vv = win.visualViewport;
  const nav = win.navigator as Navigator & { standalone?: boolean };
  const standalone = nav.standalone === true || win.matchMedia?.('(display-mode: standalone)').matches === true;
  const inset = safeAreas(win, doc);
  const app = doc.getElementById('app')?.getBoundingClientRect();
  const html = doc.documentElement;
  const rootStyle = win.getComputedStyle(html);
  // iOS отдаёт ширину экрана портретной, поэтому берём меньшую сторону.
  const screenShort = Math.min(win.screen.width, win.screen.height);
  const innerShort = Math.min(win.innerWidth, win.innerHeight);
  const zoom = pageZoom(screenShort, innerShort);
  const meta = (name: string): string => doc.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ?? '—';
  const ua = /(iPhone|iPad|iPod).*?OS ([\d_]+)/.exec(win.navigator.userAgent);

  return [
    { label: 'Режим', value: standalone ? 'приложение с экрана «Домой»' : 'вкладка браузера' },
    { label: 'Система', value: ua ? `iOS ${ua[2]!.replace(/_/g, '.')}` : win.navigator.platform || '—' },
    { label: 'Экран устройства', value: `${size(win.screen.width, win.screen.height)} · плотность ${px(win.devicePixelRatio)}` },
    { label: 'Окно страницы', value: size(win.innerWidth, win.innerHeight) },
    { label: 'Масштаб страницы', value: `${Math.round(zoom * 100)} %${Math.abs(zoom - 1) > 0.03 ? ' (не 100 %: в Safari «аА» → «Масштаб страницы»)' : ''}` },
    { label: 'Видимая область', value: vv ? `${size(vv.width, vv.height)}, сдвиг ${px(vv.offsetTop)}, увеличение ${px(vv.scale)}` : 'не поддерживается' },
    { label: 'Корневой элемент', value: size(html.clientWidth, html.clientHeight) },
    { label: 'Приложение', value: app ? `${size(app.width, app.height)}, сверху ${px(app.top)}, снизу ${px(win.innerHeight - app.bottom)}` : '—' },
    { label: 'Безопасные зоны', value: `сверху ${px(inset.top)}, снизу ${px(inset.bottom)}, слева ${px(inset.left)}, справа ${px(inset.right)}` },
    { label: 'Отступы приложения', value: `${rootStyle.getPropertyValue('--app-top').trim() || '0px'} / ${rootStyle.getPropertyValue('--app-bottom').trim() || '0px'}` },
    { label: 'Клавиатура', value: html.classList.contains('kb') ? 'открыта' : 'закрыта' },
    { label: 'viewport', value: meta('viewport') },
    { label: 'Строка состояния', value: meta('apple-mobile-web-app-status-bar-style') },
  ];
}

export const screenInfoText = (rows: Row[]): string => ['Дрёма — сведения об экране', ...rows.map((r) => `${r.label}: ${r.value}`)].join('\n');
