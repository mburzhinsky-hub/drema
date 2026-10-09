/**
 * Ссылка «только смотреть». Без сервера данные нельзя синхронизировать вживую, поэтому ссылка
 * содержит снимок: когда уснула, когда проснулась, когда кормили и когда ждём следующий сон.
 * Открывший ссылку видит живой таймер от этих отметок, а свежие данные получает с новой ссылкой.
 */
import { fmtDur } from '../engine/format';
import { progressPct } from '../engine/geometry';
import { Gender } from '../engine/model';
import { MIN, hm } from '../engine/time';
import { words } from '../engine/words';
import type { ViewerModel } from '../ui/screens/family';
import { Derived } from '../store/select';
import { computeOutlook } from '../engine/predict';
import { feedsOf, lastFeed } from '../engine/feed';

export interface Snapshot {
  v: 1;
  /** Имя ребёнка. */
  n: string;
  g: Gender;
  /** Момент снимка. */
  t: number;
  /** Начало идущего сна. */
  s: number | null;
  /** Последнее пробуждение. */
  w: number | null;
  /** Последнее кормление. */
  f: number | null;
  /** Прогноз следующего сна. */
  p: number | null;
  /** Обычная длительность сна, мин. */
  r: [number, number] | null;
}

export function makeSnapshot(d: Derived, t: number): Snapshot {
  const feeds = feedsOf(d.events, d.child.id);
  const lf = lastFeed(feeds, t);
  const s = d.active;
  const out = s ? computeOutlook(d.ctx, s) : null;
  return {
    v: 1,
    n: d.child.name,
    g: d.child.gender,
    t,
    s: s ? s.t : null,
    w: !s && d.ds.last?.end ? d.ds.last.end : null,
    f: lf ? lf.t : null,
    p: !s && d.forecast ? d.forecast.predictedAt : null,
    r: out?.range ?? null,
  };
}

const toB64Url = (bytes: Uint8Array): string => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromB64Url = (s: string): Uint8Array => {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

export function encodeSnapshot(s: Snapshot): string {
  return toB64Url(new TextEncoder().encode(JSON.stringify(s)));
}

export function decodeSnapshot(code: string): Snapshot | null {
  try {
    const o = JSON.parse(new TextDecoder().decode(fromB64Url(code))) as Snapshot;
    if (!o || o.v !== 1 || typeof o.n !== 'string' || !Number.isFinite(o.t)) return null;
    const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const r = Array.isArray(o.r) && o.r.length === 2 ? ([num(o.r[0]), num(o.r[1])] as const) : null;
    return {
      v: 1,
      n: o.n.slice(0, 40),
      g: o.g === 'm' ? 'm' : 'f',
      t: o.t,
      s: num(o.s),
      w: num(o.w),
      f: num(o.f),
      p: num(o.p),
      r: r && r[0] !== null && r[1] !== null && r[0] >= 0 && r[1] >= r[0] ? [r[0], r[1]] : null,
    };
  } catch {
    return null;
  }
}

/** Полная ссылка на страницу «только смотреть». */
export function snapshotLink(s: Snapshot): string {
  const base = `${location.origin}${location.pathname}`;
  return `${base}#/view/${encodeSnapshot(s)}`;
}

/** Достаёт код снимка из вставленной ссылки или из самого кода. */
export function snapshotFromText(text: string): Snapshot | null {
  const m = /#\/view\/([A-Za-z0-9_-]+)/.exec(text);
  return decodeSnapshot(m ? m[1] : text.trim());
}

// ───────────────────────── что видит открывший ссылку ─────────────────────────

export interface SnapshotView {
  model: ViewerModel;
  /** Строки под карточкой: «Кормили в 13:20», «Следующий сон около 14:20». */
  facts: Array<{ label: string; value: string }>;
  /** Снимку больше шести часов — просим новую ссылку. */
  stale: boolean;
  takenAt: string;
}

const STALE_MIN = 6 * 60;

export function viewFromSnapshot(s: Snapshot, now: number): SnapshotView {
  const w = words(s.g);
  const age = Math.max(0, (now - s.t) / MIN);
  let model: ViewerModel;
  if (s.s !== null) {
    const min = Math.max(0, (now - s.s) / MIN);
    const hi = s.r ? s.r[1] : null;
    model = {
      title: `${s.n} ${w.sleepsNow}`,
      sub: `с ${hm(s.s)} · уже ${fmtDur(Math.floor(min + 1e-6))}`,
      pct: hi ? progressPct(min, hi) : null,
      aria: hi ? `Сон идёт ${fmtDur(Math.floor(min))} из обычных ${fmtDur(hi)}` : `Сон идёт ${fmtDur(Math.floor(min))}`,
      icon: 'moon',
    };
  } else if (s.w !== null) {
    const min = Math.max(0, (now - s.w) / MIN);
    const window = s.p !== null && s.p > s.w ? (s.p - s.w) / MIN : null;
    model = {
      title: `${s.n} не спит`,
      sub: `с ${hm(s.w)} · уже ${fmtDur(Math.floor(min + 1e-6))}`,
      pct: window ? progressPct(min, window) : null,
      aria: s.p !== null ? `Бодрствует ${fmtDur(Math.floor(min))}, следующий сон около ${hm(s.p)}` : `Бодрствует ${fmtDur(Math.floor(min))}`,
      icon: 'sun',
    };
  } else {
    model = { title: s.n, sub: 'Свежих записей пока нет', pct: null, aria: '', icon: 'clock' };
  }
  const facts: SnapshotView['facts'] = [];
  if (s.s === null && s.p !== null) facts.push({ label: 'Следующий сон около', value: hm(s.p) });
  if (s.f !== null) facts.push({ label: w.fed, value: `в ${hm(s.f)}` });
  return { model, facts, stale: age > STALE_MIN, takenAt: hm(s.t) };
}
