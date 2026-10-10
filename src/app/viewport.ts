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

  const apply = (): void => {
    frame = 0;
    const lh = layoutHeight();
    const now = area();
    // Пока поле ввода не в фокусе, клавиатуры нет: это и есть «обычный» вид экрана (поворот, адресная строка, строка состояния).
    if (!isTextField(doc.activeElement)) base = baselineOf(lh, now);
    const ins = appInsets(lh, now, base);
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
        apply();
        reveal();
      }, 350);
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
