import { IconName } from './icons';

export interface TypeStyle {
  bg: string;
  fg: string;
  icon: IconName;
}

/** Цвета и значки типов записей. Первые четыре — из макета, остальные подобраны в той же гамме. */
export const TYPE_STYLE = {
  sleep: { bg: '#E6E6FB', fg: '#3F3CBB', icon: 'moon' },
  wake: { bg: '#FFF0C2', fg: '#6B4E00', icon: 'sun' },
  feed: { bg: '#FDE8E2', fg: '#A8341F', icon: 'bottle' },
  diaper: { bg: '#DDF1E8', fg: '#1E6B4C', icon: 'diaper' },
  temp: { bg: '#FBE3EC', fg: '#A3224F', icon: 'thermo' },
  med: { bg: '#E0EEFA', fg: '#1F5E8C', icon: 'pill' },
  bath: { bg: '#DAF1F4', fg: '#12687A', icon: 'drop' },
  walk: { bg: '#E8F2D8', fg: '#4C6A1C', icon: 'walk' },
  growth: { bg: '#EFE6FA', fg: '#6A3FA0', icon: 'ruler' },
  note: { bg: '#ECEEF6', fg: '#5A5F7A', icon: 'note' },
} satisfies Record<string, TypeStyle>;

export type StyleKey = keyof typeof TYPE_STYLE;
