/**
 * Проверочный режим `?fixture=<имя>`: часы заморожены на моменте из макета, данные — те же,
 * что на картинках. Ничего не сохраняется. Нужен для сверки с макетом и для скриншотов.
 */
import { setClock } from '../engine/time';
import { scenario, ScenarioName } from '../demo/scenarios';
import { demoChild } from '../demo/demo';
import { fixtureDay } from '../demo/scenarios';
import { DEFAULT_SETTINGS } from '../engine/model';
import { emptyState } from '../store/state';
import { disablePersistence, setState } from '../store/store';

const NAMES: ScenarioName[] = ['home', 'sleeping', 'night', 'day', 'why', 'family', 'report'];

export function applyFixture(name: string): void {
  disablePersistence();
  if (name === 'splash') {
    setClock({ base: Date.parse('2026-10-09T10:00:00'), frozen: true });
    history.replaceState(null, '', '#/welcome');
    return;
  }
  const n = (NAMES as string[]).includes(name) ? (name as ScenarioName) : 'home';
  const sc = scenario(n);
  setClock({ base: sc.now, frozen: true });
  const s = emptyState();
  setState({
    ...s,
    onboarded: true,
    children: [sc.child],
    activeChildId: sc.child.id,
    events: sc.events,
    members: [
      { id: 'me', name: 'Мама', role: 'owner' },
      { id: 'demo-dad', name: 'Папа', role: 'editor' },
      { id: 'demo-gran', name: 'Бабушка', role: 'viewer' },
    ],
    settings: { ...DEFAULT_SETTINGS },
    demo: true,
  });
  history.replaceState(null, '', `#${sc.route}`);
}

export { demoChild, fixtureDay };
