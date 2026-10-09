/** Модель данных. Любая запись — событие с отметкой изменения: так же работают синхронизация и отмена. */

export type Gender = 'f' | 'm';

export interface Child {
  id: string;
  name: string;
  /** Дата рождения, YYYY-MM-DD. */
  birth: string;
  gender: Gender;
  createdAt: number;
}

export type EventType =
  | 'sleep'
  | 'feed'
  | 'diaper'
  | 'temp'
  | 'med'
  | 'bath'
  | 'walk'
  | 'growth'
  | 'note';

export interface BaseEvent {
  id: string;
  childId: string;
  type: EventType;
  /** Начало события, мс. */
  t: number;
  /** Последнее изменение, мс. Побеждает более поздняя правка. */
  updatedAt: number;
  /** Удаление — «надгробие», чтобы оно доехало до других устройств. */
  deleted?: true;
  /** Кто записал (имя участника семьи). */
  by?: string;
}

export type SleepKind = 'night' | 'nap';

export interface SleepEvent extends BaseEvent {
  type: 'sleep';
  /** null — сон идёт сейчас. */
  end: number | null;
  /** Если не задано, вид определяется по времени засыпания. */
  kind?: SleepKind;
}

export type FeedHow = 'bottle' | 'breast' | 'solid';

export interface FeedEvent extends BaseEvent {
  type: 'feed';
  how: FeedHow;
  /** Объём, мл (бутылочка). */
  ml?: number;
  /** Минуты у левой / правой груди. */
  left?: number;
  right?: number;
  /** Общее время у груди, мин, если сторона не указана. */
  min?: number;
  /** Что дали (прикорм). */
  note?: string;
}

export type DiaperKind = 'wet' | 'dirty' | 'mixed';

export interface DiaperEvent extends BaseEvent {
  type: 'diaper';
  kind: DiaperKind;
}

export interface TempEvent extends BaseEvent {
  type: 'temp';
  c: number;
}

export interface MedEvent extends BaseEvent {
  type: 'med';
  name: string;
  dose?: string;
}

export interface BathEvent extends BaseEvent {
  type: 'bath';
}

export interface WalkEvent extends BaseEvent {
  type: 'walk';
  end?: number | null;
}

export interface GrowthEvent extends BaseEvent {
  type: 'growth';
  kg?: number;
  cm?: number;
}

export interface NoteEvent extends BaseEvent {
  type: 'note';
  text: string;
}

export type DremaEvent =
  | SleepEvent
  | FeedEvent
  | DiaperEvent
  | TempEvent
  | MedEvent
  | BathEvent
  | WalkEvent
  | GrowthEvent
  | NoteEvent;

export const isSleep = (e: DremaEvent): e is SleepEvent => e.type === 'sleep';
export const isFeed = (e: DremaEvent): e is FeedEvent => e.type === 'feed';
export const isDiaper = (e: DremaEvent): e is DiaperEvent => e.type === 'diaper';

export type Role = 'owner' | 'editor' | 'viewer';

export interface Member {
  id: string;
  name: string;
  role: Role;
}

export interface ReminderSettings {
  /** Напомнить о начале окна сна. */
  window: { on: boolean; lead: number };
  /** Напомнить о кормлении, когда прошло обычное время. */
  feed: { on: boolean };
  /** Напомнить разбудить, когда сон затянулся. */
  wake: { on: boolean };
}

export interface Settings {
  /** Ночной режим включается сам. */
  nightAuto: boolean;
  /** Начало и конец ночи, «чч:мм». */
  nightFrom: string;
  nightTo: string;
  /** Желаемое время отбоя; если пусто — берётся из истории. */
  bedtime?: string;
  reminders: ReminderSettings;
  /** Имя для подписи записей. */
  userName: string;
}

export const DEFAULT_SETTINGS: Settings = {
  nightAuto: true,
  nightFrom: '21:00',
  nightTo: '06:00',
  reminders: {
    window: { on: true, lead: 10 },
    feed: { on: false },
    wake: { on: false },
  },
  userName: 'Мама',
};
