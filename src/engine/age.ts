import { DAY, parseISODate, startOfDay } from './time';
import { genitive, plural } from './format';

export interface AgeInfo {
  days: number;
  /** Полных месяцев по календарю. */
  months: number;
  /** «5 месяцев», «3 недели», «9 дней», «1 год 2 мес.». */
  label: string;
  /** Для оборота «для 5 месяцев». */
  labelFor: string;
}

/** Полных календарных месяцев между датами. */
export function wholeMonths(birth: number, at: number): number {
  const b = new Date(birth);
  const n = new Date(at);
  let m = (n.getFullYear() - b.getFullYear()) * 12 + (n.getMonth() - b.getMonth());
  if (n.getDate() < b.getDate()) m -= 1;
  return Math.max(0, m);
}

export function ageInfo(birthISO: string, at: number): AgeInfo {
  const birth = parseISODate(birthISO);
  const days = Math.max(0, Math.round((startOfDay(at) - birth) / DAY));
  const months = wholeMonths(birth, at);

  if (months === 0) {
    if (days < 14) {
      return {
        days,
        months,
        label: `${days} ${plural(days, 'день', 'дня', 'дней')}`,
        labelFor: `${days} ${genitive(days, 'дня', 'дней')}`,
      };
    }
    const weeks = Math.floor(days / 7);
    return {
      days,
      months,
      label: `${weeks} ${plural(weeks, 'неделя', 'недели', 'недель')}`,
      labelFor: `${weeks} ${genitive(weeks, 'недели', 'недель')}`,
    };
  }

  if (months < 24) {
    return {
      days,
      months,
      label: `${months} ${plural(months, 'месяц', 'месяца', 'месяцев')}`,
      labelFor: `${months} ${genitive(months, 'месяца', 'месяцев')}`,
    };
  }

  const years = Math.floor(months / 12);
  const rest = months % 12;
  const yearsWord = plural(years, 'год', 'года', 'лет');
  const label = rest === 0 ? `${years} ${yearsWord}` : `${years} ${yearsWord} ${rest} мес.`;
  return { days, months, label, labelFor: label };
}
