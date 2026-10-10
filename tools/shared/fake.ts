/**
 * Подставные браузерные части для проверок в Chromium (e2e и аудит вёрстки).
 */

/**
 * Настоящая клавиатура в Chromium не открывается, поэтому видимую область подменяем так, как её ведёт iOS:
 * при клавиатуре visualViewport становится ниже окна, а при «подкрутке» страницы получает сдвиг offsetTop.
 * window.__vv(высота, сдвиг) — «клавиатура выехала / ушла».
 */
export const FAKE_VISUAL_VIEWPORT = (idleHeight: number | null): string => `
  (() => {
    const vv = new EventTarget();
    Object.assign(vv, { width: innerWidth, height: ${idleHeight ?? 'innerHeight'}, offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1 });
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    window.__vv = (height, offsetTop = 0) => {
      vv.height = height; vv.offsetTop = offsetTop; vv.pageTop = offsetTop;
      vv.dispatchEvent(new Event('resize')); vv.dispatchEvent(new Event('scroll'));
    };
  })();`;
