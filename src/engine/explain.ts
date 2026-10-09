/** Объяснение прогноза человеческим языком — три причины для экрана «Почему». */
import { Forecast } from './predict';
import { fmtDur, fmtRange, ordinal } from './format';
import { Gender } from './model';
import { hm } from './time';
import { words } from './words';

export interface Explanation {
  ageTitle: string;
  age: string;
  lastTitle: string;
  last: string;
  rhythmTitle: string;
  rhythm: string;
}

/** Минуты от полуночи → «14:15». */
export const hmFromMinutes = (m: number): string =>
  `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m) % 60).padStart(2, '0')}`;

export function explain(f: Forecast, gender: Gender): Explanation {
  const w = words(gender);
  const b = f.basis;

  let age = `Для ${b.ageLabelFor} окно обычно ${fmtRange(b.norm.wake[0], b.norm.wake[1])}`;
  if (b.multiplier < 1) age += ', утром — чуть короче';
  else if (b.multiplier > 1) age += ', перед ночью — чуть длиннее';

  let lastTitle = 'Прошлый сон';
  let last: string;
  if (b.wakeKind === 'nap' && b.lastSleepMin !== null) {
    last = `${w.slept} ${fmtDur(b.lastSleepMin)}, ${w.wokeShort} в ${hm(f.wakeAt)}`;
    const shift = Math.round(b.adjMin);
    if (Math.abs(shift) >= 5) {
      last += `. Из-за этого прогноз ${shift > 0 ? 'позже' : 'раньше'} на ${Math.abs(shift)} мин`;
    }
  } else {
    lastTitle = 'Утро';
    last = `${w.wokeUp} в ${hm(f.wakeAt)} после ночного сна`;
  }

  const rhythmTitle = w.herRhythm;
  const p = b.personal;
  const what = f.mode === 'bedtime' ? 'ночной сон' : `${ordinal(f.napNumber)} сон`;
  let rhythm: string;
  if (p && p.startQuartiles) {
    rhythm = `За 7 дней ${what} начинался около ${hmFromMinutes(p.startQuartiles[0])} – ${hmFromMinutes(p.startQuartiles[1])}`;
  } else if (p) {
    rhythm = p.pooled
      ? `По ${p.n} окнам за две недели ${w.she} обычно бодрствует ${fmtDur(p.medianMin)}`
      : `За две недели в этом окне ${w.she} бодрствует около ${fmtDur(p.medianMin)}`;
  } else {
    rhythm = 'Пока мало записей — прогноз по возрасту. Через несколько дней он станет точнее';
  }

  return { ageTitle: 'Возраст', age, lastTitle, last, rhythmTitle, rhythm };
}
