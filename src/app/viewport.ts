/**
 * Привязка приложения к видимой области экрана.
 *
 * В Safari (и в приложении с экрана «Домой») клавиатура не меняет размер страницы, а накрывает её,
 * и браузер сам «подкручивает» страницу к полю ввода: экран уезжает вверх, а при мелком шрифте ещё и увеличивается.
 * Здесь страница закреплена (см. styles.css), а размер и положение приложения всё время равны видимой области
 * (`visualViewport`): шторка с полем встаёт прямо над клавиатурой, ничего не прыгает.
 */

export interface Box {
  top: number;
  height: number;
}

/** Размер и сдвиг видимой области; null — браузер не умеет `visualViewport`. */
export interface VisibleArea {
  height: number;
  offsetTop: number;
}

/** Клавиатура считается открытой, если видимая область стала ниже окна больше чем на столько, px. */
export const KEYBOARD_MIN_PX = 120;

export function viewportBox(layoutHeight: number, vv: VisibleArea | null): Box {
  if (!vv) return { top: 0, height: Math.round(layoutHeight) };
  return { top: Math.max(0, Math.round(vv.offsetTop)), height: Math.max(0, Math.round(vv.height)) };
}

export const keyboardOpen = (layoutHeight: number, vv: VisibleArea | null): boolean => !!vv && layoutHeight - vv.height > KEYBOARD_MIN_PX;

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

  const apply = (): void => {
    frame = 0;
    const area = vv ? { height: vv.height, offsetTop: vv.offsetTop } : null;
    const box = viewportBox(win.innerHeight, area);
    html.style.setProperty('--vv-h', `${box.height}px`);
    html.style.setProperty('--vv-top', `${box.top}px`);
    html.classList.toggle('kb', keyboardOpen(win.innerHeight, area));
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
  doc.addEventListener('focusin', onFocusIn);
  doc.addEventListener('focusout', schedule);
  apply();

  return () => {
    vv?.removeEventListener('resize', schedule);
    vv?.removeEventListener('scroll', schedule);
    win.removeEventListener('resize', schedule);
    win.removeEventListener('orientationchange', schedule);
    win.removeEventListener('scroll', schedule);
    doc.removeEventListener('focusin', onFocusIn);
    doc.removeEventListener('focusout', schedule);
  };
}
