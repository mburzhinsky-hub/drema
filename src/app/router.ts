export type RouteName =
  | 'home'
  | 'sleeping'
  | 'night'
  | 'day'
  | 'why'
  | 'family'
  | 'report'
  | 'welcome'
  | 'onboarding'
  | 'settings'
  | 'view';

export interface Route {
  name: RouteName;
  arg: string;
}

const NAMES: Record<string, RouteName> = {
  '': 'home',
  sleeping: 'sleeping',
  night: 'night',
  day: 'day',
  why: 'why',
  family: 'family',
  report: 'report',
  welcome: 'welcome',
  onboarding: 'onboarding',
  settings: 'settings',
  view: 'view',
};

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '');
  const parts = path.split('/').filter(Boolean);
  const name = NAMES[parts[0] ?? ''] ?? 'home';
  return { name, arg: parts.slice(1).join('/') };
}

export const pathOf = (r: Route): string => (r.name === 'home' ? '/' : `/${r.name}${r.arg ? `/${r.arg}` : ''}`);

export function go(path: string, replace = false): void {
  const target = `#${path}`;
  if (location.hash === target) return;
  if (replace) history.replaceState(null, '', target);
  else location.hash = target;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export const href = (path: string): string => `#${path}`;
