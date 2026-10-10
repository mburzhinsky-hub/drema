/** Сценарии: что происходит по нажатию. Здесь же — проверки ввода и тексты ошибок. */
import { fmtDur } from '../engine/format';
import { DremaEvent, FeedEvent, SleepEvent } from '../engine/model';
import { activeSleep, sleepKind, sleepsOf } from '../engine/sleep';
import { MIN, atMinutes, hm, latestAtOrBefore, now, startOfDay } from '../engine/time';
import { describeAction, parseVoice, VoiceAction } from '../engine/voice';
import { words } from '../engine/words';
import {
  activeChild,
  addEvent,
  LONGEST_SLEEP,
  endSleep,
  logDiaper,
  logFeed,
  patchEvent,
  removeEvent,
  startSleep,
  undo,
  undoDepth,
  undoTo,
  validateSleepTimes,
} from '../store/actions';
import { NOTE_MAX } from '../store/state';
import { getState } from '../store/store';
import { EntrySheet, SleepEditSheet, closeSheet, hideToast, invalidate, onSheetClose, openSheet, showToast, ui } from './ui';
import { go } from './router';
import { NOTHING_HEARD, SpeechSession, speechErrorMessage, speechSupported, startSpeech } from './speech';
import { DiaperKind } from '../engine/model';

// ───────────────────────── сон ─────────────────────────

export function quickSleep(stay = false): void {
  const r = startSleep();
  const c = activeChild();
  if (!r.ok) {
    showToast(r.error);
    return;
  }
  const w = words(c?.gender ?? 'f');
  showToast(`${w.fellAsleep} в ${hm(r.value.t)}`, { label: 'Отменить', run: doUndo }, { high: true });
  if (!stay) go('/sleeping');
}

export function quickWake(stay = false): void {
  const c = activeChild();
  const before = c ? activeSleep(sleepsOf(getState().events, c.id)) : undefined;
  if (before && now() - before.t > LONGEST_SLEEP) {
    // Забыли нажать «проснулась»: честная запись на десятки часов испортила бы прогноз. Просим указать, когда проснулись.
    const w = words(c?.gender ?? 'f');
    openSleepEdit(before.id);
    if (ui.sheet?.kind === 'sleep-edit') {
      ui.sheet = { ...ui.sheet, ongoing: false, end: toLocalInput(now()), error: `Сон идёт больше 20 часов: похоже, не нажали «${w.wokeUp}». Укажите, когда это было.` };
    }
    return;
  }
  const r = endSleep();
  if (!r.ok) {
    showToast(r.error);
    return;
  }
  const w = words(c?.gender ?? 'f');
  const dur = before ? fmtDur((r.value.end! - before.t) / MIN) : '';
  showToast(`${w.wokeUp}. Сон ${dur}`, { label: 'Изменить', run: () => openSleepEdit(r.value.id) }, { high: stay });
  if (!stay) go('/');
}

export function doUndo(): void {
  const label = undo();
  hideToast();
  if (label) showToast(`Отменено: ${label.toLowerCase()}`);
  // Если отменили начало сна, экран сна больше не нужен — маршрут поправит охранник.
}

const toLocalInput = (t: number): string => {
  const d = new Date(t);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocalInput = (s: string): number => new Date(s).getTime();

export function openSleepEdit(id: string): void {
  const s = getState().events.find((e) => e.id === id) as SleepEvent | undefined;
  if (!s) return;
  openSheet({
    kind: 'sleep-edit',
    id,
    start: toLocalInput(s.t),
    end: s.end !== null ? toLocalInput(s.end) : '',
    ongoing: s.end === null,
  });
}

export function patchSleepSheet(p: Partial<SleepEditSheet>): void {
  if (ui.sheet?.kind !== 'sleep-edit') return;
  ui.sheet = { ...ui.sheet, ...p, error: undefined };
  invalidate();
}

export function saveSleepEdit(): void {
  const sh = ui.sheet;
  if (sh?.kind !== 'sleep-edit') return;
  const start = fromLocalInput(sh.start);
  const end = sh.ongoing || !sh.end ? null : fromLocalInput(sh.end);
  if (Number.isNaN(start) || (end !== null && Number.isNaN(end))) {
    ui.sheet = { ...sh, error: 'Укажите дату и время' };
    invalidate();
    return;
  }
  const err = validateSleepTimes(sh.id, start, end);
  if (err) {
    ui.sheet = { ...sh, error: err };
    invalidate();
    return;
  }
  patchEvent(sh.id, { t: start, end } as Partial<SleepEvent>, 'Правка сна');
  closeSheet();
  showToast('Время сохранено', { label: 'Отменить', run: doUndo });
}

export function deleteSleep(id: string): void {
  const e = getState().events.find((x) => x.id === id) as SleepEvent | undefined;
  removeEvent(id, 'Удаление сна');
  closeSheet();
  showToast('Сон удалён', { label: 'Вернуть', run: doUndo });
  void e;
}

// ───────────────────────── кормление, подгузник и прочее ─────────────────────────

const EMPTY: Omit<EntrySheet, 'type'> = {
  kind: 'entry',
  time: '',
  how: 'bottle',
  ml: '120',
  left: '',
  right: '',
  food: '',
  diaper: 'wet',
  temp: '36.6',
  medName: '',
  medDose: '',
  kg: '',
  cm: '',
  text: '',
  minutes: '40',
};

export function newEntry(type: EntrySheet['type']): EntrySheet {
  const sheet: EntrySheet = { ...EMPTY, type };
  if (type === 'feed') {
    const c = activeChild();
    const last = c
      ? [...getState().events]
          .filter((e): e is FeedEvent => e.type === 'feed' && !e.deleted && e.childId === c.id && e.how === 'bottle' && !!e.ml)
          .sort((a, b) => b.t - a.t)[0]
      : undefined;
    if (last?.ml) sheet.ml = String(last.ml);
  }
  return sheet;
}

export function openEntry(type: EntrySheet['type']): void {
  openSheet(newEntry(type));
}

export const openFeed = (): void => openEntry('feed');
export const openDiaper = (): void => openEntry('diaper');

export function openMore(): void {
  openSheet({ kind: 'more' });
}

const num = (s: string): number => Number(String(s).replace(',', '.').trim());

/** Открывает правку записи. Сон — отдельная шторка. */
export function openEvent(e: DremaEvent): void {
  if (e.type === 'sleep') {
    openSleepEdit(e.id);
    return;
  }
  const sh = newEntry(e.type as EntrySheet['type']);
  sh.editId = e.id;
  sh.time = hm(e.t);
  switch (e.type) {
    case 'feed':
      sh.how = e.how;
      sh.ml = e.ml ? String(e.ml) : '';
      sh.left = e.left ? String(e.left) : e.min ? String(e.min) : '';
      sh.right = e.right ? String(e.right) : '';
      sh.food = e.note ?? '';
      break;
    case 'diaper':
      sh.diaper = e.kind;
      break;
    case 'temp':
      sh.temp = String(e.c);
      break;
    case 'med':
      sh.medName = e.name;
      sh.medDose = e.dose ?? '';
      break;
    case 'growth':
      sh.kg = e.kg !== undefined ? String(e.kg) : '';
      sh.cm = e.cm !== undefined ? String(e.cm) : '';
      break;
    case 'note':
      sh.text = e.text;
      break;
    case 'walk':
      sh.minutes = e.end ? String(Math.round((e.end - e.t) / MIN)) : '';
      break;
    default:
      break;
  }
  openSheet(sh);
}

export function patchEntry(p: Partial<EntrySheet>): void {
  if (ui.sheet?.kind !== 'entry') return;
  ui.sheet = { ...ui.sheet, ...p, error: undefined };
  invalidate();
}

/** Момент записи: введённое время в сутках записи (или сегодня); без ввода — сейчас. */
function entryTime(sh: EntrySheet): number | string {
  const n = now();
  if (!sh.time) return n;
  const m = /^(\d{1,2}):(\d{2})$/.exec(sh.time);
  if (!m) return 'Укажите время';
  const ref = sh.editId ? (getState().events.find((e) => e.id === sh.editId)?.t ?? n) : n;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  // «в 23:50» утром — это вчера (по календарю: в сутки перевода часов нельзя просто вычесть 24 часа)
  const t = sh.editId ? atMinutes(startOfDay(ref), minutes) : latestAtOrBefore(startOfDay(ref), minutes, n);
  if (t > n + MIN) return 'Время ещё не наступило';
  return t;
}

export function submitEntry(overrideDiaper?: DiaperKind): void {
  const sh = ui.sheet;
  if (sh?.kind !== 'entry') return;
  const t = entryTime(sh);
  const fail = (error: string): void => {
    ui.sheet = { ...sh, error };
    invalidate();
  };
  if (typeof t === 'string') return fail(t);

  const edit = sh.editId;
  const label: Record<EntrySheet['type'], string> = {
    feed: 'Кормление',
    diaper: 'Подгузник',
    temp: 'Температура',
    med: 'Лекарство',
    bath: 'Купание',
    walk: 'Прогулка',
    growth: 'Рост и вес',
    note: 'Заметка',
  };

  let data: Record<string, unknown>;
  switch (sh.type) {
    case 'feed': {
      if (sh.how === 'bottle') {
        const ml = num(sh.ml);
        if (sh.ml && (!(ml > 0) || ml > 500)) return fail('Объём — от 1 до 500 мл');
        data = { how: 'bottle', ml: sh.ml ? Math.round(ml) : undefined, left: undefined, right: undefined, note: undefined, min: undefined };
      } else if (sh.how === 'breast') {
        const l = sh.left ? Math.round(num(sh.left)) : undefined;
        const r = sh.right ? Math.round(num(sh.right)) : undefined;
        if ((l !== undefined && !(l >= 0 && l <= 90)) || (r !== undefined && !(r >= 0 && r <= 90))) return fail('Минуты — от 0 до 90');
        data = { how: 'breast', left: l, right: r, ml: undefined, note: undefined, min: undefined };
      } else {
        data = { how: 'solid', note: sh.food.trim() || undefined, ml: undefined, left: undefined, right: undefined, min: undefined };
      }
      break;
    }
    case 'diaper':
      data = { kind: overrideDiaper ?? sh.diaper };
      break;
    case 'temp': {
      const c = num(sh.temp);
      if (!(c >= 34 && c <= 42)) return fail('Температура — от 34 до 42 °C');
      data = { c: Math.round(c * 10) / 10 };
      break;
    }
    case 'med':
      if (!sh.medName.trim()) return fail('Напишите, что дали');
      data = { name: sh.medName.trim(), dose: sh.medDose.trim() || undefined };
      break;
    case 'bath':
      data = {};
      break;
    case 'walk': {
      const m = sh.minutes ? num(sh.minutes) : NaN;
      if (sh.minutes && !(m > 0 && m <= 600)) return fail('Длительность — от 1 до 600 минут');
      data = { end: Number.isNaN(m) ? undefined : t + Math.round(m) * MIN };
      break;
    }
    case 'growth': {
      const kg = sh.kg ? num(sh.kg) : undefined;
      const cm = sh.cm ? num(sh.cm) : undefined;
      if (kg === undefined && cm === undefined) return fail('Укажите вес или рост');
      if (kg !== undefined && !(kg > 0.5 && kg < 40)) return fail('Вес — от 0,5 до 40 кг');
      if (cm !== undefined && !(cm > 20 && cm < 130)) return fail('Рост — от 20 до 130 см');
      data = { kg, cm };
      break;
    }
    case 'note':
      if (!sh.text.trim()) return fail('Напишите заметку');
      data = { text: sh.text.trim().slice(0, NOTE_MAX) };
      break;
  }

  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  if (edit) {
    // удалённые поля обнуляем явно, иначе при смене способа кормления останутся старые значения
    const patch: Record<string, unknown> = { t };
    for (const [k, v] of Object.entries(data)) patch[k] = v;
    patchEvent(edit, patch as Partial<DremaEvent>, label[sh.type]);
    closeSheet();
    showToast('Сохранено', { label: 'Отменить', run: doUndo });
    return;
  }

  if (sh.type === 'feed') {
    logFeed(t, sh.how, {
      ml: clean.ml as number | undefined,
      left: clean.left as number | undefined,
      right: clean.right as number | undefined,
      note: clean.note as string | undefined,
    });
  } else if (sh.type === 'diaper') {
    logDiaper(t, clean.kind as DiaperKind);
  } else {
    addEvent({ type: sh.type, t, ...clean } as never, label[sh.type]);
  }
  closeSheet();
  showToast(`Записано: ${label[sh.type].toLowerCase()}`, { label: 'Отменить', run: doUndo });
}

export function deleteEntry(): void {
  const sh = ui.sheet;
  if (sh?.kind !== 'entry' || !sh.editId) return;
  removeEvent(sh.editId, 'Удаление записи');
  closeSheet();
  showToast('Запись удалена', { label: 'Вернуть', run: doUndo });
}

// ───────────────────────── голос ─────────────────────────

/** Текущий сеанс распознавания. Пока он есть, микрофон включён; любой выход из «Говорите» его выключает. */
let session: SpeechSession | null = null;

export { speechSupported };

export function openVoice(): void {
  if (!speechSupported()) {
    openSheet({ kind: 'voice', phase: 'text', transcript: '' });
    return;
  }
  openSheet({ kind: 'voice', phase: 'listening', transcript: '' });
  startListening();
}

function startListening(): void {
  cancelVoice();
  session = startSpeech({
    text: (transcript) => {
      if (ui.sheet?.kind !== 'voice' || ui.sheet.phase !== 'listening') return;
      ui.sheet = { ...ui.sheet, transcript };
      invalidate();
    },
    end: finishListening,
    error: (code) => {
      session = null;
      if (ui.sheet?.kind !== 'voice') return;
      ui.sheet = { ...ui.sheet, phase: 'text', error: speechErrorMessage(code) };
      invalidate();
    },
  });
  if (!session && ui.sheet?.kind === 'voice') {
    ui.sheet = { ...ui.sheet, phase: 'text', error: 'Микрофон недоступен. Наберите фразу.' };
    invalidate();
  }
}

/** Прекращает слушать и отключает обработчики: иначе «abort» вызовет onerror и перебьёт следующий шаг. */
export function cancelVoice(): void {
  session?.cancel();
  session = null;
}

/**
 * Слушание закончилось (пауза в речи, «Готово», тайм-аут, уход в фон): микрофон выключаем,
 * услышанное — на проверку, а если не услышали ничего — на набор с подсказкой.
 */
function finishListening(): void {
  cancelVoice();
  const sh = ui.sheet;
  if (sh?.kind !== 'voice' || sh.phase !== 'listening') return;
  ui.sheet = sh.transcript.trim() ? { ...sh, phase: 'confirm' } : { ...sh, phase: 'text', error: NOTHING_HEARD };
  invalidate();
}

/** Приложение ушло в фон или закрывается: микрофон не должен остаться включённым. */
export function pauseVoice(): void {
  if (ui.sheet?.kind === 'voice' && ui.sheet.phase === 'listening') finishListening();
  else cancelVoice();
}

/** «Сказать ещё раз» после ошибки или на экране набора. */
export function retryVoice(): void {
  if (ui.sheet?.kind !== 'voice' || !speechSupported()) return;
  ui.sheet = { ...ui.sheet, phase: 'listening', transcript: '', error: undefined };
  invalidate();
  startListening();
}

export function setVoiceText(text: string): void {
  if (ui.sheet?.kind !== 'voice') return;
  ui.sheet = { ...ui.sheet, transcript: text, error: undefined };
  invalidate();
}

export function toConfirm(): void {
  if (ui.sheet?.kind !== 'voice') return;
  if (ui.sheet.phase === 'listening') {
    finishListening();
    return;
  }
  cancelVoice();
  ui.sheet = { ...ui.sheet, phase: ui.sheet.transcript.trim() ? 'confirm' : 'text' };
  invalidate();
}

export function toText(): void {
  if (ui.sheet?.kind !== 'voice') return;
  cancelVoice();
  ui.sheet = { ...ui.sheet, phase: 'text' };
  invalidate();
}

export function voiceParsed(): { actions: VoiceAction[]; unknown: string } {
  const c = activeChild();
  const sh = ui.sheet;
  if (!c || sh?.kind !== 'voice') return { actions: [], unknown: '' };
  return parseVoice(sh.transcript, { now: now(), gender: c.gender });
}

export function applyVoice(): void {
  const c = activeChild();
  if (!c) return;
  const { actions } = voiceParsed();
  if (!actions.length) return;
  const depth = undoDepth();
  const done: string[] = [];
  const failed: string[] = [];
  const sorted = [...actions].sort((a, b) => a.t - b.t);
  for (const a of sorted) {
    const text = describeAction(a, c.gender);
    switch (a.kind) {
      case 'sleep-start': {
        const r = startSleep(a.t);
        (r.ok ? done : failed).push(r.ok ? text : `${text}: ${r.error.toLowerCase()}`);
        break;
      }
      case 'sleep-end': {
        const r = endSleep(a.t);
        (r.ok ? done : failed).push(r.ok ? text : `${text}: ${r.error.toLowerCase()}`);
        break;
      }
      case 'feed': {
        if (a.how === 'breast' && a.min !== undefined && a.left === undefined && a.right === undefined) {
          addEvent({ type: 'feed', t: a.t, how: 'breast', min: a.min } as never, 'Кормление');
        } else {
          logFeed(a.t, a.how, { ml: a.ml, left: a.left, right: a.right, note: a.note });
        }
        done.push(text);
        break;
      }
      case 'diaper':
        logDiaper(a.t, a.diaper);
        done.push(text);
        break;
      case 'temp':
        addEvent({ type: 'temp', t: a.t, c: a.c } as never, 'Температура');
        done.push(text);
        break;
      case 'med':
        addEvent({ type: 'med', t: a.t, name: a.name, dose: a.dose } as never, 'Лекарство');
        done.push(text);
        break;
      case 'bath':
        addEvent({ type: 'bath', t: a.t } as never, 'Купание');
        done.push(text);
        break;
      case 'walk':
        addEvent({ type: 'walk', t: a.t, end: a.end } as never, 'Прогулка');
        done.push(text);
        break;
      case 'growth':
        addEvent({ type: 'growth', t: a.t, kg: a.kg, cm: a.cm } as never, 'Рост и вес');
        done.push(text);
        break;
      case 'note':
        addEvent({ type: 'note', t: a.t, text: a.text.slice(0, NOTE_MAX) } as never, 'Заметка');
        done.push(text);
        break;
    }
  }
  cancelVoice();
  closeSheet();
  if (done.length) {
    showToast(`Записано: ${done.join(' · ')}`, { label: 'Отменить', run: () => { undoTo(depth); hideToast(); } }, { ms: 8000 });
  }
  if (failed.length) showToast(failed.join('. '), undefined, { ms: 7000 });
}

onSheetClose((s) => {
  if (s.kind === 'voice') cancelVoice();
});

// ───────────────────────── мелочи ─────────────────────────

export const isNightSleep = (s: SleepEvent): boolean => sleepKind(s) === 'night';
