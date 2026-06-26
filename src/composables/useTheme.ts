// useTheme — applique un thème (variables CSS + accent Quasar), le persiste.
import { ref } from 'vue';
import { Dark, setCssVar } from 'quasar';
import { THEMES, DEFAULT_THEME_ID, type Theme } from '@/data/themes';

const STORAGE_KEY = 'muscu:theme';
const current = ref<string>(DEFAULT_THEME_ID);

function findTheme(id: string | null): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]!;
}

export function applyTheme(id: string) {
  const t = findTheme(id);
  // Bascule le mode Quasar (inputs, menus, dialogs, sheets… suivent).
  Dark.set(t.dark);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(t.vars)) root.style.setProperty(k, v);
  // Accent Quasar (composants color="primary") aligné sur le thème.
  setCssVar('primary', t.vars['--accent']!);
  current.value = t.id;
  try {
    localStorage.setItem(STORAGE_KEY, t.id);
  } catch {
    // localStorage indisponible : on ignore (le thème reste appliqué en mémoire).
  }
}

// Appelé au boot, avant le rendu, pour éviter tout flash.
export function initTheme() {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    saved = null;
  }
  applyTheme(saved ?? DEFAULT_THEME_ID);
}

export function useTheme() {
  return { current, themes: THEMES, applyTheme };
}
