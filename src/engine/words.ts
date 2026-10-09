import { Gender } from './model';

/** Слова, которые меняются по роду ребёнка. */
export interface Words {
  fellAsleep: string;
  wokeUp: string;
  slept: string;
  sleepsNow: string;
  asleepTitle: string;
  she: string;
  her: string;
  herRhythm: string;
  baby: string;
  ate: string;
  /** «Мила спит» → «Мила проснулась». */
  wokeShort: string;
  /** Именительный: «Малышка» / «Малыш». */
  tot: string;
  /** Пассивная форма: «кормили». */
  fed: string;
}

const F: Words = {
  fellAsleep: 'Уснула',
  wokeUp: 'Проснулась',
  slept: 'Спала',
  sleepsNow: 'спит',
  asleepTitle: 'Уснула',
  she: 'она',
  her: 'её',
  herRhythm: 'Её ритм',
  baby: 'малышка',
  ate: 'поела',
  wokeShort: 'проснулась',
  tot: 'Малышка',
  fed: 'Кормили',
};

const M: Words = {
  fellAsleep: 'Уснул',
  wokeUp: 'Проснулся',
  slept: 'Спал',
  sleepsNow: 'спит',
  asleepTitle: 'Уснул',
  she: 'он',
  her: 'его',
  herRhythm: 'Его ритм',
  baby: 'малыш',
  ate: 'поел',
  wokeShort: 'проснулся',
  tot: 'Малыш',
  fed: 'Кормили',
};

export const words = (g: Gender): Words => (g === 'm' ? M : F);
