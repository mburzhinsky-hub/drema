/**
 * Распознавание речи браузера, обёрнутое так, чтобы микрофон гарантированно выключался.
 *
 * Правила:
 *  - один сеанс = один распознаватель; после конца, ошибки, отмены или тайм-аута он отпускается (abort), а его обработчики снимаются;
 *  - запоздавшие события отпущенного распознавателя игнорируются (иначе «abort» вызвал бы onerror и перебил следующий шаг);
 *  - забытая открытой шторка не держит микрофон дольше LISTEN_MAX_MS.
 */

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type SRCtor = new () => SpeechRecognitionLike;

/** Дольше этого, мс, микрофон не слушаем: человек отвлёкся, а индикатор микрофона не должен гореть. */
export const LISTEN_MAX_MS = 30_000;

const ctorOf = (win: Window): SRCtor | undefined => {
  const w = win as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

export function speechSupported(win: Window = window): boolean {
  return !!ctorOf(win);
}

export interface SpeechHandlers {
  /** Всё услышанное с начала сеанса (с промежуточными словами). */
  text(transcript: string): void;
  /** Слушание закончилось само (пауза в речи, тайм-аут). Микрофон уже выключен. */
  end(): void;
  /** Ошибка распознавания (`not-allowed`, `no-speech`, …). Микрофон уже выключен. */
  error(code: string): void;
}

export interface SpeechSession {
  /** Выключает микрофон и больше ничего не сообщает. Можно вызывать сколько угодно раз. */
  cancel(): void;
}

/** Начинает слушать. `null` — распознавания нет или оно не запустилось. */
export function startSpeech(h: SpeechHandlers, win: Window = window, maxMs: number = LISTEN_MAX_MS): SpeechSession | null {
  const Ctor = ctorOf(win);
  if (!Ctor) return null;
  let live = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rec: SpeechRecognitionLike | null = null;

  const release = (): void => {
    live = false;
    clearTimeout(timer);
    if (!rec) return;
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
    try {
      rec.abort();
    } catch {
      /* уже остановлено */
    }
    rec = null;
  };

  try {
    rec = new Ctor();
    rec.lang = 'ru-RU';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      if (!live) return;
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript + ' ';
      h.text(text.trim());
    };
    rec.onerror = (e) => {
      if (!live) return;
      release();
      h.error(e.error);
    };
    rec.onend = () => {
      if (!live) return;
      release();
      h.end();
    };
    timer = setTimeout(() => {
      if (!live) return;
      release();
      h.end();
    }, maxMs);
    rec.start();
  } catch {
    release();
    return null;
  }
  return { cancel: release };
}

/** Что сказать человеку по коду ошибки распознавания. Все сообщения кончаются выходом: набрать фразу. */
export function speechErrorMessage(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Нет доступа к микрофону. Разрешите его в настройках браузера или наберите фразу: на клавиатуре есть значок микрофона для диктовки.';
    case 'no-speech':
      return 'Ничего не услышали. Попробуйте ещё раз или наберите фразу.';
    case 'audio-capture':
      return 'Микрофон не найден или занят другим приложением. Наберите фразу.';
    case 'network':
      return 'Нет связи с сервисом распознавания речи. Проверьте интернет или наберите фразу.';
    case 'language-not-supported':
      return 'Русская речь на этом устройстве не распознаётся. Наберите фразу.';
    default:
      return 'Не получилось распознать речь. Наберите фразу.';
  }
}

export const NOTHING_HEARD = speechErrorMessage('no-speech');
