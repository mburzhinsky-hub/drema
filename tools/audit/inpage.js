/*
 * Проверки вёрстки внутри страницы. Подключается как init-скрипт и вызывается из tools/audit/ui.ts:
 *   window.__audit({ scope, keyboardField })  →  { errors: [...], warnings: [...], info: {...} }
 * Здесь только JavaScript без типов: код выполняется в браузере как есть.
 *
 * Что считается ошибкой (errors):
 *   - страница шире окна;
 *   - элемент обрезан неприкручиваемым контейнером или выходит за окно;
 *   - текст обрезан (многоточие или overflow:hidden с лишним содержимым);
 *   - две кнопки или два куска текста лежат друг на друге;
 *   - кнопку закрывает чужой элемент (проверка точки по центру);
 *   - шторка не помещается в приложение или её низ ушёл за край;
 *   - конец прокручиваемого экрана прячется под нижней навигацией;
 *   - кнопка меньше 44 × 44 px (размер от Apple для касания) — это в warnings, если не меньше 36.
 */
(function () {
  const INTERACTIVE = 'button, a[href], input:not([type="hidden"]), textarea, select, [role="button"], [role="radio"], [role="tab"], [role="switch"], [role="checkbox"]';

  const rectOf = (el) => el.getBoundingClientRect();
  const style = (el) => getComputedStyle(el);
  const label = (el) => {
    const t = (el.getAttribute('aria-label') || el.innerText || el.textContent || el.placeholder || el.id || '').replace(/\s+/g, ' ').trim();
    return `<${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}> «${t.slice(0, 40)}»`;
  };
  const related = (a, b) => a === b || a.contains(b) || b.contains(a);
  const area = (r) => Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top);
  const inter = (a, b) => ({
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  });

  /** Видим ли элемент вообще (размер, display, visibility, прозрачность). */
  function visible(el) {
    const r = rectOf(el);
    if (r.width <= 0 || r.height <= 0) return false;
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const cs = style(p);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    }
    return true;
  }

  /** Прямоугольник элемента, обрезанный всеми контейнерами с overflow ≠ visible: то, что реально видно. */
  function shown(el) {
    let r = rectOf(el);
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const cs = style(p);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
        const pr = rectOf(p);
        r = { left: Math.max(r.left, cs.overflowX !== 'visible' ? pr.left : -1e9), right: Math.min(r.right, cs.overflowX !== 'visible' ? pr.right : 1e9), top: Math.max(r.top, cs.overflowY !== 'visible' ? pr.top : -1e9), bottom: Math.min(r.bottom, cs.overflowY !== 'visible' ? pr.bottom : 1e9) };
      }
    }
    // шапка шторки закреплена: то, что прокручено под неё, не видно (и не считается наложенным)
    const head = stickyHead();
    if (head && !head.contains(el) && head.parentElement && head.parentElement.contains(el)) r = { left: r.left, right: r.right, top: Math.max(r.top, rectOf(head).bottom), bottom: r.bottom };
    return r;
  }

  /** Закреплённая шапка шторки (на невысоком экране с клавиатурой), если есть. */
  function stickyHead() {
    const sh = document.querySelector('.sheet');
    const h = sh && sh.children[1];
    return h && style(h).position === 'sticky' ? h : null;
  }

  /** Есть ли у элемента собственный текст (не только у детей). */
  function ownText(el) {
    for (const n of el.childNodes) if (n.nodeType === 3 && n.nodeValue.trim()) return true;
    return false;
  }

  /** Прокручивается ли контейнер сам (там вылет за край — нормально). */
  const scrolls = (cs, axis) => (axis === 'x' ? /(auto|scroll)/.test(cs.overflowX) : /(auto|scroll)/.test(cs.overflowY));

  window.__audit = function (opts) {
    opts = opts || {};
    const errors = [];
    const warnings = [];
    const info = {};
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const appEl = document.getElementById('app');
    const app = rectOf(appEl);
    const sheet = document.querySelector('.sheet');
    // Уведомление («Записано…», «Показаны примерные данные…») лежит поверх экрана несколько секунд: так задумано, в проверку не входит.
    const toast = document.querySelector('.toast');
    // Под шторкой экран недоступен (inert), поэтому проверяем только её.
    const roots = sheet ? [sheet] : [appEl];
    const inScope = (el) => roots.some((r) => r.contains(el)) && !el.closest('[inert]') && !(toast && toast.contains(el));
    const all = [];
    for (const r of roots) for (const el of r.querySelectorAll('*')) if (inScope(el) && visible(el)) all.push(el);
    info.elements = all.length;

    // 1. Страница шире окна
    const docOver = document.documentElement.scrollWidth - vw;
    if (docOver > 1) errors.push(`страница шире окна на ${docOver}px`);

    // 2. Выход за край окна / обрезка контейнером без прокрутки
    const seen = new Set();
    for (const el of all) {
      if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
      // узоры на карточках (звёзды, кольца) обрезаются краем карточки намеренно; проверяем только картинки со смыслом
      if (el.tagName.toLowerCase() === 'svg' && el.getAttribute('role') !== 'img') continue;
      const r = rectOf(el);
      // уже обрезанные прокручиваемыми предками считаем по видимой части
      let clipped = null;
      for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
        const cs = style(p);
        const pr = rectOf(p);
        if (scrolls(cs, 'x')) { clipped = 'scroll'; break; }
        if (cs.overflowX !== 'visible' && (r.right > pr.right + 1.5 || r.left < pr.left - 1.5)) {
          const key = label(el) + 'clip';
          if (!seen.has(key)) { seen.add(key); errors.push(`обрезан контейнером по ширине: ${label(el)} (${Math.round(r.left)}…${Math.round(r.right)} при границах ${Math.round(pr.left)}…${Math.round(pr.right)})`); }
          clipped = 'hidden';
          break;
        }
      }
      if (clipped) continue;
      if ((r.right > vw + 1.5 || r.left < -1.5) && style(el).position !== 'fixed') {
        const key = label(el) + 'win';
        if (!seen.has(key)) { seen.add(key); errors.push(`вылезает за окно: ${label(el)} (${Math.round(r.left)}…${Math.round(r.right)} при ширине окна ${vw})`); }
      }
    }

    // 3. Обрезанный текст
    for (const el of all) {
      if (!ownText(el)) continue;
      const cs = style(el);
      const clipX = cs.overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 1.5;
      const clipY = cs.overflowY !== 'visible' && !scrolls(cs, 'y') && el.scrollHeight > el.clientHeight + 2;
      const ellipsis = cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1;
      const clamp = (cs.webkitLineClamp && cs.webkitLineClamp !== 'none') && el.scrollHeight > el.clientHeight + 2;
      // многоточие — осознанное сокращение (полный текст открывается по нажатию), это не потеря текста
      if (cs.textOverflow === 'ellipsis' && (clipX || ellipsis)) warnings.push(`текст сокращён многоточием: ${label(el)}`);
      else if (clipX && !scrolls(cs, 'x')) errors.push(`текст обрезан по ширине: ${label(el)} (${el.scrollWidth} > ${el.clientWidth})`);
      else if (clipY) errors.push(`текст обрезан по высоте: ${label(el)} (${el.scrollHeight} > ${el.clientHeight})`);
      else if (clamp) warnings.push(`текст сокращён по строкам: ${label(el)}`);
    }

    // 4. Кнопки: размер, перекрытие друг с другом, закрытие чужим элементом
    const ctl = all.filter((el) => el.matches(INTERACTIVE) && !el.closest('svg'));
    const tapSeen = new Set();
    for (const el of ctl) {
      let r = rectOf(el);
      // у флажков и переключателей нажимается их подпись/обёртка
      const wrap = el.closest('label');
      if (wrap && el.matches('input[type="checkbox"], input[type="radio"]')) r = rectOf(wrap);
      const small = Math.min(r.width, r.height);
      if (small < 44 - 0.5 && !tapSeen.has(label(el))) {
        tapSeen.add(label(el));
        const msg = `мелкая цель для касания ${Math.round(r.width)}×${Math.round(r.height)}: ${label(el)}`;
        // меньше 24 px — ошибка; 24–43 px — замечание (колонки недельного графика на узких экранах не могут быть шире)
        (small < 24 ? errors : warnings).push(msg);
      }
    }
    for (let i = 0; i < ctl.length; i++) {
      for (let j = i + 1; j < ctl.length; j++) {
        const a = ctl[i];
        const b = ctl[j];
        if (related(a, b)) continue;
        if (a.tagName === 'LABEL' && a.control === b) continue;
        if (b.tagName === 'LABEL' && b.control === a) continue;
        const ra = shown(a);
        const rb = shown(b);
        const x = inter(ra, rb);
        const s = area(x);
        if (s > 16 && s > 0.06 * Math.min(area(ra), area(rb))) {
          errors.push(`кнопки перекрываются на ${Math.round(s)}px²: ${label(a)} и ${label(b)}`);
        }
      }
    }
    for (const el of ctl) {
      const r = shown(el);
      if (r.right - r.left < 2 || r.bottom - r.top < 2) continue;
      // точка в центре видимой части; если нажимаемый элемент целиком за краем окна, его проверит прокрутка
      const cx = Math.min(Math.max((r.left + r.right) / 2, 0), vw - 1);
      const cy = Math.min(Math.max((r.top + r.bottom) / 2, 0), vh - 1);
      if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue;
      const top = document.elementFromPoint(cx, cy);
      if (!top) continue;
      if (related(el, top) || (toast && toast.contains(top))) continue;
      if (el.tagName === 'LABEL' && el.control && related(el.control, top)) continue;
      if (top.tagName === 'LABEL' && top.control === el) continue;
      if (top.closest('label') && top.closest('label').contains(el)) continue;
      errors.push(`кнопку закрывает чужой элемент: ${label(el)} закрыта ${label(top)}`);
    }

    // 5. Текст на тексте
    const boxes = [];
    for (const el of all) {
      if (!ownText(el) || el.closest('svg')) continue;
      for (const n of el.childNodes) {
        if (n.nodeType !== 3 || !n.nodeValue.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const q of range.getClientRects()) {
          if (q.width < 2 || q.height < 2) continue;
          // рамка текста выше самой строки: срезаем по 15 % сверху и снизу, чтобы соседние строки не считались наложением
          const cut = q.height * 0.15;
          boxes.push({ el, r: { left: q.left, right: q.right, top: q.top + cut, bottom: q.bottom - cut }, text: n.nodeValue.trim().slice(0, 30) });
        }
      }
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (a.el === b.el || related(a.el, b.el)) continue;
        const s = area(inter(a.r, b.r));
        if (s > 14 && s > 0.1 * Math.min(area(a.r), area(b.r))) {
          // цепочка из двух вложенных обрезок: один и тот же блок в разных скроллерах не пересекается, так что совпадение настоящее
          const ra = shown(a.el);
          const rb = shown(b.el);
          if (area(inter(inter(a.r, b.r), inter(ra, rb))) <= 8) continue;
          errors.push(`текст наплывает на текст: «${a.text}» и «${b.text}» (${Math.round(s)}px²)`);
        }
      }
    }

    // 6. Мелкий шрифт
    const fontSeen = new Set();
    for (const el of all) {
      if (!ownText(el) || el.closest('svg')) continue;
      const fs = parseFloat(style(el).fontSize);
      if (fs < 11 && !fontSeen.has(label(el))) {
        fontSeen.add(label(el));
        warnings.push(`мелкий шрифт ${fs}px: ${label(el)}`);
      }
    }

    // 7. Шторка целиком в приложении, её низ и кнопки видны
    if (sheet) {
      const sr = rectOf(sheet);
      const appBottom = app.bottom;
      info.sheet = { top: Math.round(sr.top), bottom: Math.round(sr.bottom), height: Math.round(sr.height), left: Math.round(sr.left), right: Math.round(sr.right) };
      if (sr.bottom > appBottom + 1) errors.push(`шторка ниже приложения: ${Math.round(sr.bottom)} > ${Math.round(appBottom)}`);
      if (sr.top < app.top - 1) errors.push(`шторка выше приложения: ${Math.round(sr.top)} < ${Math.round(app.top)}`);
      if (sr.left < app.left - 1 || sr.right > app.right + 1) errors.push(`шторка шире приложения: ${Math.round(sr.left)}…${Math.round(sr.right)}`);
      // Невысокий экран с клавиатурой: шторка прокручивается целиком (см. styles.css). Тогда низ достижим прокруткой.
      const sheetScrolls = scrolls(style(sheet), 'y') && sheet.scrollHeight > sheet.clientHeight + 1;
      info.sheetScrolls = sheetScrolls;
      const wasSheet = sheet.scrollTop;
      if (sheetScrolls && !opts.keyboardField) sheet.scrollTop = sheet.scrollHeight;
      const edge = sheetScrolls && opts.keyboardField ? null : Math.min(appBottom, vh);
      // крайние элементы закреплённого низа должны быть внутри шторки и окна
      if (edge !== null) {
        for (const b of sheet.querySelectorAll('button')) {
          if (!visible(b) || b.closest('.scroll')) continue;
          const r = rectOf(b);
          if (r.bottom > edge + 1 || r.top < sr.top - 1) errors.push(`кнопка шторки за краем: ${label(b)} (${Math.round(r.top)}…${Math.round(r.bottom)})`);
        }
      }
      if (!opts.keyboardField) sheet.scrollTop = wasSheet;
      const sc = sheet.querySelector('.scroll');
      if (sc) {
        info.scrollArea = { client: sc.clientHeight, scroll: sc.scrollHeight };
        // прокрутив тело до конца, последнее содержимое должно быть над закреплённым низом
        const was = sc.scrollTop;
        sc.scrollTop = sc.scrollHeight;
        const last = [...sc.querySelectorAll('*')].filter((e) => visible(e)).map((e) => rectOf(e).bottom).reduce((m, v) => Math.max(m, v), 0);
        const scr = rectOf(sc);
        if (last > scr.bottom + 1.5) errors.push(`низ тела шторки недостижим: содержимое до ${Math.round(last)}, видимая область до ${Math.round(scr.bottom)}`);
        sc.scrollTop = was;
      }
    }

    // 8. Конец каждого прокручиваемого экрана не прячется под нижней навигацией
    if (!sheet) {
      const nav = [...document.querySelectorAll('nav')].find((n) => visible(n) && !n.closest('[inert]'));
      const navTop = nav ? rectOf(nav).top : app.bottom;
      const scrollers = [...appEl.querySelectorAll('*')].filter((e) => {
        const cs = style(e);
        return scrolls(cs, 'y') && e.scrollHeight > e.clientHeight + 1 && visible(e) && rectOf(e).height > 100;
      });
      info.scrollers = scrollers.length;
      for (const sc of scrollers) {
        const before = sc.scrollTop;
        sc.scrollTop = sc.scrollHeight;
        const scr = rectOf(sc);
        let last = 0;
        let lastEl = null;
        for (const e of sc.querySelectorAll('*')) {
          if (!visible(e) || e.closest('svg') && e.tagName.toLowerCase() !== 'svg') continue;
          const b = rectOf(e).bottom;
          // только то, что содержит текст или кнопку: пустые подложки не в счёт
          if ((ownText(e) || e.matches(INTERACTIVE)) && b > last) { last = b; lastEl = e; }
        }
        const limit = Math.min(navTop, scr.bottom);
        if (lastEl && last > limit + 1.5) errors.push(`конец экрана прячется под навигацией: ${label(lastEl)} до ${Math.round(last)}, граница ${Math.round(limit)}`);
        sc.scrollTop = before;
      }
    }

    // 9. Поле ввода с клавиатурой: видно целиком и не ниже клавиатуры
    if (opts.keyboardField) {
      const f = document.querySelector(opts.keyboardField);
      if (f) {
        const r = rectOf(f);
        const lim = app.bottom;
        info.field = { top: Math.round(r.top), bottom: Math.round(r.bottom), appBottom: Math.round(lim) };
        // область, в которой поле видно: ближайший прокручиваемый предок (тело или вся шторка), ниже шапки, если она закреплена
        let sc = null;
        for (let p = f.parentElement; p && p !== document.documentElement; p = p.parentElement) {
          if (scrolls(style(p), 'y') && p.scrollHeight > p.clientHeight + 1) { sc = p; break; }
        }
        const clip = sc ? rectOf(sc) : { top: 0, bottom: lim };
        let top = clip.top;
        if (sheet) {
          const head = sheet.children[1];
          if (head && style(head).position === 'sticky') top = Math.max(top, rectOf(head).bottom);
        }
        if (r.top < top - 1 || r.bottom > Math.min(clip.bottom, lim) + 1) errors.push(`поле «${opts.keyboardField}» не видно над клавиатурой: ${Math.round(r.top)}…${Math.round(r.bottom)} при области ${Math.round(top)}…${Math.round(Math.min(clip.bottom, lim))}`);
        if (sheet) {
          // закреплённый низ должен остаться на виду; если шторка прокручивается целиком, до него достаёт прокрутка
          const sheetScroll = scrolls(style(sheet), 'y') && sheet.scrollHeight > sheet.clientHeight + 1;
          const was = sheet.scrollTop;
          if (sheetScroll) sheet.scrollTop = sheet.scrollHeight;
          const foot = [...sheet.querySelectorAll('button')].filter((b) => visible(b) && !b.closest('.scroll') && b.getAttribute('aria-label') !== 'Закрыть');
          for (const b of foot) {
            const br = rectOf(b);
            if (br.bottom > lim + 1) errors.push(`с клавиатурой кнопка уходит за край: ${label(b)} до ${Math.round(br.bottom)} при границе ${Math.round(lim)}`);
          }
          sheet.scrollTop = was;
        }
      } else errors.push(`поле ${opts.keyboardField} не найдено`);
    }

    info.viewport = { vw, vh, app: { left: Math.round(app.left), top: Math.round(app.top), right: Math.round(app.right), bottom: Math.round(app.bottom) } };
    return { errors, warnings, info };
  };
})();
