/** Дети, участники семьи, профиль, данные: действия шторок и настроек. */
import { plural } from '../engine/format';
import { Gender, Member, Role } from '../engine/model';
import { isoDate, now, parseISODate, startOfDay, DAY } from '../engine/time';
import {
  addChild,
  addMember,
  clearDemo,
  exportJSON,
  hasUserData,
  importJSON,
  inspectBackup,
  loadDemo,
  removeChild,
  removeMember,
  resetAll,
  selectChild,
  setUserName,
  updateChild,
  updateMember,
  updateSettings,
} from '../store/actions';
import { getState } from '../store/store';
import { ChildSheet, closeSheet, invalidate, openSheet, showToast, ui } from './ui';
import { go } from './router';
import { snapshotFromText } from './share';

// ───────────────────────── дети ─────────────────────────

export function openChildList(): void {
  openSheet({ kind: 'child', mode: 'list', name: '', birth: '', gender: 'f' });
}

export function pickChild(id: string): void {
  selectChild(id);
  closeSheet();
  go('/');
}

export function openChildNew(): void {
  openSheet({ kind: 'child', mode: 'new', name: '', birth: '', gender: 'f' });
}

export function openChildEdit(id: string): void {
  const c = getState().children.find((x) => x.id === id);
  if (!c) return;
  openSheet({ kind: 'child', mode: 'edit', editId: id, name: c.name, birth: c.birth, gender: c.gender });
}

export function patchChild(p: Partial<ChildSheet>): void {
  if (ui.sheet?.kind !== 'child') return;
  ui.sheet = { ...ui.sheet, ...p, error: undefined };
  invalidate();
}

/** Проверка имени и даты рождения; общая для шторки и онбординга. */
export function validateChild(name: string, birth: string): string | null {
  if (!name.trim()) return 'Напишите имя малыша';
  if (name.trim().length > 30) return 'Имя слишком длинное — до 30 букв';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth)) return 'Укажите дату рождения';
  const b = parseISODate(birth);
  if (Number.isNaN(b)) return 'Укажите дату рождения';
  const today = startOfDay(now());
  if (b > today) return 'Дата рождения ещё не наступила';
  if (today - b > 6 * 365 * DAY) return 'Приложение рассчитано на детей до 6 лет';
  return null;
}

export function saveChild(): void {
  const sh = ui.sheet;
  if (sh?.kind !== 'child' || sh.mode === 'list') return;
  const err = validateChild(sh.name, sh.birth);
  if (err) {
    ui.sheet = { ...sh, error: err };
    invalidate();
    return;
  }
  if (sh.mode === 'new') {
    addChild(sh.name, sh.birth, sh.gender);
    closeSheet();
    showToast(`${sh.name.trim()} добавлен${sh.gender === 'f' ? 'а' : ''}`);
    go('/');
  } else if (sh.editId) {
    updateChild(sh.editId, { name: sh.name.trim(), birth: sh.birth, gender: sh.gender });
    closeSheet();
    showToast('Сохранено');
  }
}

export function askDeleteChild(id: string): void {
  const c = getState().children.find((x) => x.id === id);
  if (!c) return;
  openSheet({
    kind: 'confirm',
    title: `Удалить ${c.name}?`,
    text: 'Все записи о сне, кормлениях и здоровье этого ребёнка удалятся с этого устройства. Отменить нельзя — сначала можно сохранить копию в настройках.',
    confirm: 'Удалить',
    danger: true,
    run: () => {
      removeChild(id);
      closeSheet();
      if (!getState().onboarded) go('/welcome');
      else showToast('Удалено');
    },
  });
}

// ───────────────────────── семья ─────────────────────────

export function openMember(m: Member): void {
  openSheet({ kind: 'member', id: m.id, name: m.name, role: m.role });
}

export function patchMember(p: { name?: string; role?: Role }): void {
  if (ui.sheet?.kind !== 'member') return;
  ui.sheet = { ...ui.sheet, ...p };
  invalidate();
}

export function saveMember(): void {
  const sh = ui.sheet;
  if (sh?.kind !== 'member') return;
  const name = sh.name.trim();
  if (!name) return;
  updateMember(sh.id, { name: name.slice(0, 30), role: sh.role });
  closeSheet();
  showToast('Сохранено');
}

export function deleteMember(): void {
  const sh = ui.sheet;
  if (sh?.kind !== 'member') return;
  removeMember(sh.id);
  closeSheet();
  showToast('Участник убран из списка');
}

export function saveProfile(name: string): void {
  setUserName(name);
  closeSheet();
  showToast('Имя сохранено');
}

/** Добавляет приглашённого в список семьи (если такого имени ещё нет). */
export function addInvitee(name: string, role: Role): void {
  const n = name.trim();
  if (!n) return;
  if (getState().members.some((m) => m.name.toLowerCase() === n.toLowerCase())) return;
  addMember(n, role);
}

// ───────────────────────── данные ─────────────────────────

export function downloadBackup(): void {
  const blob = new Blob([exportJSON()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `drema-${isoDate(now())}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  showToast('Копия сохранена в загрузки');
}

export function importFromText(text: string): { ok: boolean; message: string } {
  const r = importJSON(text);
  if (!r.ok) return { ok: false, message: r.error };
  return { ok: true, message: `Загружено: детей ${r.value.children}, записей ${r.value.events}` };
}

export async function importFromFile(file: File): Promise<void> {
  if (file.size > 20 * 1024 * 1024) {
    showToast('Файл слишком большой');
    return;
  }
  const text = await file.text();
  const info = inspectBackup(text);
  if (!info.ok) {
    showToast(info.error);
    return;
  }
  const finish = (): void => {
    const r = importFromText(text);
    showToast(r.message);
    if (r.ok) {
      closeSheet();
      go('/');
    }
  };
  // Копия заменяет всё, что есть на устройстве: если там уже что-то записано, сначала спрашиваем.
  if (!hasUserData()) {
    finish();
    return;
  }
  const s = getState();
  const mine = s.events.filter((e) => e.childId !== 'demo-mila' && !e.deleted).length;
  const kids = s.children.filter((c) => c.id !== 'demo-mila').length;
  const count = (c: number, e: number): string => `${c} ${plural(c, 'малыш', 'малыша', 'малышей')}, ${e} ${plural(e, 'запись', 'записи', 'записей')}`;
  openSheet({
    kind: 'confirm',
    title: 'Заменить данные копией?',
    text: `Сейчас на этом устройстве: ${count(kids, mine)}. В копии: ${count(info.value.children, info.value.events)}. Текущие данные будут заменены, вернуть их нельзя. Если они нужны, сначала сохраните копию.`,
    confirm: 'Заменить',
    danger: true,
    run: () => {
      closeSheet();
      finish();
    },
  });
}

export function startDemo(): void {
  loadDemo();
  go('/');
  showToast('Показаны примерные данные. Их можно убрать в настройках.', undefined, { ms: 7000 });
}

export function askClearDemo(): void {
  openSheet({
    kind: 'confirm',
    title: 'Убрать примерные данные?',
    text: 'Исчезнет Мила и все её записи. Ваши собственные записи останутся.',
    confirm: 'Убрать',
    danger: true,
    run: () => {
      clearDemo();
      closeSheet();
      if (!getState().onboarded) go('/welcome');
    },
  });
}

export function askReset(): void {
  openSheet({
    kind: 'confirm',
    title: 'Стереть всё?',
    text: 'Все дети, записи и настройки удалятся с этого устройства. Отменить нельзя.',
    confirm: 'Стереть всё',
    danger: true,
    run: () => {
      resetAll();
      closeSheet();
      go('/welcome');
    },
  });
}

// ───────────────────────── вход ─────────────────────────

/** «Войти»: аккаунтов нет, данные хранятся у вас. Вход — это загрузка копии или ссылки. */
export function submitLogin(text: string, gender: Gender = 'f'): void {
  void gender;
  const t = text.trim();
  if (!t) {
    ui.sheet = { kind: 'login', error: 'Вставьте ссылку или содержимое файла копии' };
    invalidate();
    return;
  }
  const snap = snapshotFromText(t);
  if (snap && /#\/view\//.test(t)) {
    closeSheet();
    const code = /#\/view\/([A-Za-z0-9_-]+)/.exec(t)![1];
    go(`/view/${code}`);
    return;
  }
  const r = importFromText(t);
  if (!r.ok) {
    ui.sheet = { kind: 'login', error: r.message };
    invalidate();
    return;
  }
  closeSheet();
  showToast(r.message);
  go('/');
}

export { updateSettings };
