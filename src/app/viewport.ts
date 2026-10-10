/**
 * Привязка приложения к видимой области экрана.
 *
 * В Safari (и в приложении с экрана «Домой») клавиатура не меняет размер страницы, а накрывает её,
 * и браузер сам «подкручивает» страницу к полю ввода: экран уезжает вверх, а при мелком шрифте ещё и увеличивается.
 * Здесь страница закреплена (см. styles.css), а пока клавиатуры нет, приложение занимает всё окно целиком
 * (`inset: 0`, без чисел из JavaScript). Когда клавиатура открыта, приложение сжимается до видимой части.
 *
 * Числа `visualViewport` на iOS нельзя брать как есть: в режиме приложения высота видимой области бывает
 * меньше окна на высоту строки состояния даже без клавиатуры (на скриншотах это пустая полоса внизу).
 * Поэтому пока поле ввода не в фокусе, запоминаем «как выглядит экран без клавиатуры» (`Baseline`)
 * и считаем только отклонение от него.
 *
 * Бывает и хуже: в приложении с экрана «Домой» iOS может вообще не сообщить, что клавиатура выехала (размеры не меняются,
 * страница не двигается, клавиатура просто накрывает низ). Тогда, если поле в фокусе, а измерить нечего, высота клавиатуры
 * оценивается долей экрана (`KEYBOARD_SHARE`): шторка всё равно встаёт выше клавиатуры, и поле не прячется под ней.
 */

/** Видимая область, как её отдаёт браузер (`visualViewport`). */
export interface VisibleArea {
  height: number;
  offsetTop: number;
  /** Масштаб щипком: 1 — не увеличено. */
  scale?: number;
}

/** Как выглядит видимая область, когда клавиатуры нет. */
export interface Baseline {
  /** Высота видимой области. */
  height: number;
  /** Её сдвиг сверху. */
  top: number;
  /** Сколько окна остаётся под ней (на iOS в режиме приложения — высота строки состояния). */
  gap: number;
}

export interface Insets {
  /** Отступ приложения сверху, px. */
  top: number;
  /** Отступ снизу, px: приложение заканчивается над клавиатурой. */
  bottom: number;
  keyboard: boolean;
}

/** Клавиатура считается открытой, если видимая область стала ниже обычной больше чем на столько, px. */
export const KEYBOARD_MIN_PX = 120;
/**
 * Какую часть высоты занимает клавиатура iPhone вместе с полосой «вверх/вниз/готово» (по скриншоту с iPhone 14: 386 из 844 pt).
 * Используется, только когда браузер не сообщил реальную высоту.
 */
export const KEYBOARD_SHARE = 0.46;
/** Через сколько после фокуса, мс, считать, что браузер о клавиатуре не сообщит, и перейти к оценке. */
export const ESTIMATE_AFTER_MS = 350;
/** Допуск масштаба: при увеличенной щипком странице приложение не трогаем. */
const SCALE_EPS = 0.02;

const NO_INSETS: Insets = { top: 0, bottom: 0, keyboard: false };

export function baselineOf(layoutHeight: number, vv: VisibleArea | null): Baseline {
  if (!vv) return { height: layoutHeight, top: 0, gap: 0 };
  return { height: vv.height, top: vv.offsetTop, gap: Math.max(0, layoutHeight - vv.offsetTop - vv.height) };
}

/**
 * Где должно стоять приложение. Без клавиатуры — на всё окно (нулевые отступы).
 * С клавиатурой — от верха видимой области до верха клавиатуры, даже если iOS подкрутила страницу.
 */
export function appInsets(layoutHeight: number, vv: VisibleArea | null, base: Baseline): Insets {
  if (!vv) return NO_INSETS;
  if (vv.scale !== undefined && Math.abs(vv.scale - 1) > SCALE_EPS) return NO_INSETS;
  if (base.height - vv.height <= KEYBOARD_MIN_PX) return NO_INSETS;
  return {
    top: Math.max(0, Math.round(vv.offsetTop - base.top)),
    bottom: Math.max(0, Math.round(layoutHeight - (vv.offsetTop + vv.height + base.gap))),
    keyboard: true,
  };
}

/** Оценка отступов, когда клавиатура точно есть (поле в фокусе), а браузер её высоту не сообщил. */
export function estimatedInsets(layoutHeight: number): Insets {
  return { top: 0, bottom: Math.round(layoutHeight * KEYBOARD_SHARE), keyboard: true };
}

/** Оценка нужна только на телефоне с сенсорным экраном: на компьютере поле в фокусе не значит «клавиатура на экране». */
export function canEstimate(win: Window): boolean {
  if (typeof win.matchMedia !== 'function') return false;
  return win.matchMedia('(pointer: coarse)').matches && win.matchMedia('(max-width: 559px)').matches;
}

// ───────────── масштаб страницы ─────────────

/** Размеры экрана устройства и окна страницы, как их отдаёт браузер. */
export interface ScreenGeometry {
  screenWidth: number;
  screenHeight: number;
  innerWidth: number;
  innerHeight: number;
}

/** Экран короче этого, px, считается телефоном: на планшетах и компьютерах масштаб страницы не трогаем. */
const PHONE_SHORT_SIDE = 500;
/** Разница меньше этого — не масштаб, а погрешность (панели браузера, безопасные зоны). */
const ZOOM_TOLERANCE = 0.08;

/**
 * Во сколько раз надо увеличить приложение, чтобы оно выглядело так, как нарисовано (390 px по ширине).
 * Браузер может показывать страницу мельче или крупнее, чем 100 % (масштаб страницы для сайта в Safari,
 * размер текста в Chrome): тогда окно оказывается шире или уже 390 px, и вся вёрстка выглядит мельче или крупнее задуманного.
 * 1 — всё как задумано или устройство не телефон.
 */
export function layoutScale(g: ScreenGeometry): number {
  const vals = [g.screenWidth, g.screenHeight, g.innerWidth, g.innerHeight];
  if (vals.some((v) => !Number.isFinite(v) || v <= 0)) return 1;
  const short = Math.min(g.screenWidth, g.screenHeight);
  if (short > PHONE_SHORT_SIDE) return 1;
  // iOS отдаёт размеры экрана портретными при любом повороте, поэтому ширину окна сравниваем с нужной стороной.
  const portrait = g.innerHeight >= g.innerWidth;
  const expected = portrait ? short : Math.max(g.screenWidth, g.screenHeight);
  const z = g.innerWidth / expected;
  if (Math.abs(z - 1) < ZOOM_TOLERANCE) return 1;
  return Math.round(Math.min(2, Math.max(0.5, z)) * 1000) / 1000;
}

/** Какие поля вводят текст: у кнопок, флажков и файлов клавиатуры нет. */
const TEXTUAL = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number', 'date', 'time', 'datetime-local', '']);

export function isTextField(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  return el instanceof HTMLInputElement && TEXTUAL.has(el.type) && !el.readOnly;
}

export function startViewport(win: Window = window, doc: Document = document): () => void {
  const html = doc.documentElement;
  const vv = win.visualViewport;
  let frame = 0;
  const layoutHeight = (): number => html.clientHeight || win.innerHeight;
  const area = (): VisibleArea | null => (vv ? { height: vv.height, offsetTop: vv.offsetTop, scale: vv.scale } : null);
  let base = baselineOf(layoutHeight(), area());
  /** Выравнивание масштаба страницы: --z на <html>; при 1 свойство убирается, и вёрстка остаётся как есть. */
  const scale = (): void => {
    const z = win.screen
      ? layoutScale({ screenWidth: win.screen.width, screenHeight: win.screen.height, innerWidth: win.innerWidth, innerHeight: win.innerHeight })
      : 1;
    if (z === 1) html.style.removeProperty('--z');
    else html.style.setProperty('--z', String(z));
  };
  /** Браузер молчит о клавиатуре, а поле в фокусе дольше ESTIMATE_AFTER_MS: считаем высоту клавиатуры по доле экрана. */
  let estimating = false;

  const apply = (): void => {
    frame = 0;
    const lh = layoutHeight();
    const now = area();
    const typing = isTextField(doc.activeElement);
    // Пока поле ввода не в фокусе, клавиатуры нет: это и есть «обычный» вид экрана (поворот, адресная строка, строка состояния).
    if (!typing) {
      base = baselineOf(lh, now);
      estimating = false;
    }
    // Измеренное важнее оценки: как только браузер сообщил реальные числа, берём их.
    scale();
    const measured = appInsets(lh, now, base);
    const ins = !measured.keyboard && estimating ? estimatedInsets(lh) : measured;
    html.style.setProperty('--app-top', `${ins.top}px`);
    html.style.setProperty('--app-bottom', `${ins.bottom}px`);
    html.classList.toggle('kb', ins.keyboard);
    // Страница закреплена, но iOS всё равно пытается её подкрутить: возвращаем на место.
    if (win.scrollX !== 0 || win.scrollY !== 0) win.scrollTo(0, 0);
    if (doc.scrollingElement && doc.scrollingElement.scrollTop !== 0) doc.scrollingElement.scrollTop = 0;
  };
  const schedule = (): void => {
    if (!frame) frame = win.requestAnimationFrame(apply);
  };

  /** Клавиатура выезжает ~0,3 с: после этого прокручиваем поле в видимую часть внутри шторки, а не всей страницы. */
  const reveal = (): void => {
    const el = doc.activeElement;
    if (isTextField(el)) el.scrollIntoView({ block: 'center', inline: 'nearest' });
  };
  const onFocusIn = (e: FocusEvent): void => {
    schedule();
    if (isTextField(e.target as Element)) {
      win.setTimeout(() => {
        if (isTextField(doc.activeElement) && canEstimate(win)) estimating = true;
        apply();
        reveal();
      }, ESTIMATE_AFTER_MS);
    }
  };

  html.classList.add('vv');
  vv?.addEventListener('resize', schedule);
  vv?.addEventListener('scroll', schedule);
  win.addEventListener('resize', schedule);
  win.addEventListener('orientationchange', schedule);
  win.addEventListener('scroll', schedule, { passive: true });
  // Клавиатура уезжает не мгновенно: пересчитываем ещё раз, когда она точно ушла.
  const onFocusOut = (): void => {
    schedule();
    win.setTimeout(schedule, 450);
  };
  doc.addEventListener('focusin', onFocusIn);
  doc.addEventListener('focusout', onFocusOut);
  apply();

  return () => {
    vv?.removeEventListener('resize', schedule);
    vv?.removeEventListener('scroll', schedule);
    win.removeEventListener('resize', schedule);
    win.removeEventListener('orientationchange', schedule);
    win.removeEventListener('scroll', schedule);
    doc.removeEventListener('focusin', onFocusIn);
    doc.removeEventListener('focusout', onFocusOut);
  };
}
