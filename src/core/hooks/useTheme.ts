import { useEffect, useSyncExternalStore } from 'react';
import { DEFAULT_THEME } from '../config';

export type Theme = 'light' | 'dark';
export const THEME_CHANGE_EVENT = 'theme-change';

function getTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem('theme');
  if (stored === 'dark' || stored === 'light') return stored;
  if (DEFAULT_THEME !== 'system') return DEFAULT_THEME;
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function subscribe(listener: () => void) {
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  window.addEventListener(THEME_CHANGE_EVENT, listener);
  window.addEventListener('storage', listener);
  system.addEventListener('change', listener);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, listener);
    window.removeEventListener('storage', listener);
    system.removeEventListener('change', listener);
  };
}

export function useTheme() {
  const theme = useSyncExternalStore(
    subscribe,
    getTheme,
    () => 'light' as Theme
  );
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  function setTheme(value: Theme) {
    localStorage.setItem('theme', value);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }
  return {
    theme,
    setTheme,
    dark: theme === 'dark',
    toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
  };
}
