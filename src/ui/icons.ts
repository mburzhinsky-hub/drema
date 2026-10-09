/** Иконки: те же контуры, что нарисованы в макете (сетка 24 px, штрих 1,75). */
import { unsafeHTML } from 'lit-html/directives/unsafe-html.js';

export interface IconOpts {
  size?: number;
  /** Толщина штриха. */
  sw?: number;
  /** Прозрачность заливки; 0 — без заливки. */
  fo?: number;
  /** Цвет заливки. */
  fill?: string;
  /** Цвет штриха на самом контуре (поверх цвета svg). */
  pstroke?: string;
  /** Цвет штриха на всём svg. */
  stroke?: string;
  style?: string;
}

export type IconName =
  | 'moon'
  | 'bottle'
  | 'diaper'
  | 'bell'
  | 'chevL'
  | 'chevR'
  | 'chevD'
  | 'plus'
  | 'minus'
  | 'sun'
  | 'clock'
  | 'list'
  | 'bars'
  | 'people'
  | 'mic'
  | 'pencil'
  | 'link'
  | 'send'
  | 'doc'
  | 'pdf'
  | 'eye'
  | 'info'
  | 'thermo'
  | 'pill'
  | 'drop'
  | 'walk'
  | 'ruler'
  | 'note'
  | 'check'
  | 'close'
  | 'trash'
  | 'share'
  | 'sliders'
  | 'heart';

type Painter = (o: IconOpts) => string;

/** Заливка: значение из opts, а если не задано — по умолчанию для этой иконки. */
const fl = (o: IconOpts, def: number): string => {
  const fo = o.fo ?? def;
  if (!fo) return '';
  return ` fill="${o.fill ?? 'currentColor'}" fill-opacity="${fo}"`;
};
const ps = (o: IconOpts): string => (o.pstroke ? ` stroke="${o.pstroke}"` : '');

const PAINT: Record<IconName, Painter> = {
  moon: (o) => `<path d="M20.2 14.6A8.4 8.4 0 0 1 9.4 3.8a8.4 8.4 0 1 0 10.8 10.8z"${fl(o, 0.2)}${ps(o)}/>`,
  bottle: (o) =>
    `<path d="M10.2 3.6c0-.7.6-1.1 1.8-1.1s1.8.4 1.8 1.1v1.7h-3.6z"/><path d="M8.9 5.3h6.2"/><path d="M9.2 5.3v1.4c-1 .6-1.6 1.6-1.6 2.8V19a2.2 2.2 0 0 0 2.2 2.2h4.4a2.2 2.2 0 0 0 2.2-2.2V9.5c0-1.2-.6-2.2-1.6-2.8V5.3"${fl(o, 0.2)}/><path d="M10.2 12.4h2M10.2 15.4h2"/>`,
  diaper: (o) =>
    `<path d="M3.2 6.2h17.6v4.1c0 3.9-2.6 7.2-6.2 8.3L12 20.2l-2.6-1.6c-3.6-1.1-6.2-4.4-6.2-8.3z"${fl(o, 0.2)}/><path d="M3.2 9.6h17.6"/>`,
  bell: (o) => `<path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 1.5h-15z"${fl(o, 0.14)}/><path d="M10 20.5a2 2 0 0 0 4 0"/>`,
  chevL: () => `<path d="M14.5 5.5L8 12l6.5 6.5"/>`,
  chevR: () => `<path d="M9.5 5.5L16 12l-6.5 6.5"/>`,
  chevD: () => `<path d="M5.5 9.5L12 16l6.5-6.5"/>`,
  plus: () => `<path d="M12 5v14M5 12h14"/>`,
  minus: () => `<path d="M5 12h14"/>`,
  sun: (o) =>
    `<circle cx="12" cy="12" r="4"${fl(o, 0.22)}${ps(o)}/><path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4"/>`,
  clock: (o) => `<circle cx="12" cy="12" r="8.5"${fl(o, 0)}/><path d="M12 7.5V12l3 2"/>`,
  list: () =>
    `<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.8" cy="6.5" r="1" fill="currentColor" stroke="none"/><circle cx="4.8" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4.8" cy="17.5" r="1" fill="currentColor" stroke="none"/>`,
  bars: () => `<path d="M5 20v-8M12 20V4M19 20v-5"/>`,
  people: (o) =>
    `<circle cx="9" cy="8.5" r="3.2"${fl(o, 0)}/><path d="M3 19.5c.4-3.2 3-5 6-5s5.6 1.8 6 5"/><path d="M16.5 5.6a3 3 0 0 1 0 5.8M18.5 14.8c1.6.7 2.8 2.1 3 4.2"/>`,
  mic: (o) =>
    `<rect x="9" y="3" width="6" height="11" rx="3"${fl(o, 0.3)}/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/>`,
  pencil: () => `<path d="M4 20l1-4.2L16.5 4.3a2 2 0 0 1 2.8 0l.4.4a2 2 0 0 1 0 2.8L8.2 19z"/>`,
  link: () =>
    `<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>`,
  send: (o) => `<path d="M20.5 3.5L10 14"/><path d="M20.5 3.5l-6.5 17-4-6.5-6.5-4z"${fl(o, 0.14)}/>`,
  doc: (o) => `<path d="M7 3.5h7.5L19 8v12.5H7z"${fl(o, 0.14)}/><path d="M14.5 3.5V8H19"/>`,
  pdf: (o) => `<path d="M7 3.5h7.5L19 8v12.5H7z"${fl(o, 0.18)}/><path d="M14.5 3.5V8H19M10 13h6M10 16.5h6"/>`,
  eye: () => `<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>`,
  info: () =>
    `<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.2"/><circle cx="12" cy="7.9" r="1" fill="currentColor" stroke="none"/>`,
  thermo: (o) => `<path d="M10 14.2V5.5a2 2 0 0 1 4 0v8.7a4 4 0 1 1-4 0z"${fl(o, 0.2)}/><path d="M12 9.5v6.5"/>`,
  pill: (o) =>
    `<path d="M10.4 20.1a4.3 4.3 0 0 1-6.1-6.1l9.7-9.7a4.3 4.3 0 0 1 6.1 6.1z"${fl(o, 0.2)}/><path d="M8.9 8.9l6.2 6.2"/>`,
  drop: (o) => `<path d="M12 3.2s6 6.1 6 10.6a6 6 0 0 1-12 0C6 9.3 12 3.2 12 3.2z"${fl(o, 0.2)}/>`,
  walk: (o) =>
    `<path d="M3.5 5h2.3l1.7 9.2h10.3"${fl(o, 0)}/><path d="M7 7.8h12.2l-1.4 6.4"${fl(o, 0.2)}/><circle cx="9" cy="18.6" r="1.7"/><circle cx="17" cy="18.6" r="1.7"/>`,
  ruler: (o) =>
    `<rect x="3" y="8" width="18" height="8" rx="1.8"${fl(o, 0.2)}/><path d="M7 8v3M10.5 8v4.5M14 8v3M17.5 8v4.5"/>`,
  note: (o) => `<path d="M6 3.5h9l4 4v13H6z"${fl(o, 0.2)}/><path d="M15 3.5v4h4M9.5 12h6M9.5 15.5h6"/>`,
  check: () => `<path d="M5 12.5l4.5 4.5L19 7.5"/>`,
  close: () => `<path d="M6 6l12 12M18 6L6 18"/>`,
  trash: () => `<path d="M5 7h14M10 7V4.5h4V7M7 7l.8 12.5h8.4L17 7M10 11v5M14 11v5"/>`,
  share: () => `<path d="M12 15V3.8M7.8 7.8L12 3.6l4.2 4.2M5 13v6.5h14V13"/>`,
  sliders: () => `<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>`,
  heart: (o) =>
    `<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"${fl(o, 0.2)}/>`,
};

export type Icon = ReturnType<typeof unsafeHTML>;

const cache = new Map<string, Icon>();

export function iconSvg(name: IconName, o: IconOpts = {}): string {
  const size = o.size ?? 22;
  const sw = o.sw ?? 1.75;
  const stroke = o.stroke ?? 'currentColor';
  const style = o.style ? ` style="${o.style}"` : '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${style}>${PAINT[name](o)}</svg>`;
}

export function icon(name: IconName, o: IconOpts = {}): Icon {
  const key = `${name}|${JSON.stringify(o)}`;
  let v = cache.get(key);
  if (!v) {
    v = unsafeHTML(iconSvg(name, o));
    cache.set(key, v);
  }
  return v;
}
