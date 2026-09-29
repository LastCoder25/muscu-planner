// labyrinthScene.ts — le DÉCOR d'un étage du Labyrinthe (pur/testé) : quel sol, quels murs,
// quelle lumière pour chaque palier, et ce que la lumière révèle. Rien ici ne décide du jeu :
// le type d'une salle reste secret jusqu'à la visite (on n'éclaire que ce qu'on a vu).
import type { Labyrinth } from '@/data/labyrinths';
import { labyTierIndex } from '@/lib/labyrinthRun';

/** Le jeu de couleurs d'un palier : dalles, joints, murs, arête des murs, couloirs, lumière. */
export interface LabyTheme {
  /** Ce que le décor évoque (affiché nulle part, sert à relire la table). */
  mood: string;
  floor: string;
  joint: string;
  wall: string;
  wallTop: string;
  corridor: string;
  light: string;
}

/** Une palette par RANG de palier (0 = le premier). Chacune suit le roster de créatures du
 *  palier : galeries de pierre, sous-bois, crypte d'os, abysses, gouffre de roche, antre oni,
 *  fournaise de la wyverne, sanctuaire astral, néant, trône de l'infini. */
export const LABY_THEMES: readonly LabyTheme[] = [
  {
    mood: 'galeries de pierre',
    floor: '#6b6459',
    joint: '#4a443b',
    wall: '#2b2620',
    wallTop: '#8a8173',
    corridor: '#57514a',
    light: '#ffc46b',
  },
  {
    mood: 'sous-bois moussu',
    floor: '#4f6a3c',
    joint: '#35482a',
    wall: '#1f2a18',
    wallTop: '#6f8a4f',
    corridor: '#43592f',
    light: '#e4ff8a',
  },
  {
    mood: 'crypte d’os',
    floor: '#8a8272',
    joint: '#5f594d',
    wall: '#2a2621',
    wallTop: '#b8ae98',
    corridor: '#6f685b',
    light: '#d9e3ff',
  },
  {
    mood: 'abysses',
    floor: '#2f4f66',
    joint: '#203849',
    wall: '#101d27',
    wallTop: '#4f7a96',
    corridor: '#284457',
    light: '#7fe8ff',
  },
  {
    mood: 'gouffre de roche',
    floor: '#6e5a48',
    joint: '#4c3e31',
    wall: '#241b14',
    wallTop: '#9a7f63',
    corridor: '#5b4a3b',
    light: '#ffae5c',
  },
  {
    mood: 'antre oni',
    floor: '#6b3434',
    joint: '#4a2222',
    wall: '#200e0e',
    wallTop: '#9a4a44',
    corridor: '#582b2b',
    light: '#ff7a5c',
  },
  {
    mood: 'fournaise de la wyverne',
    floor: '#5c4a2a',
    joint: '#3f321c',
    wall: '#1c140a',
    wallTop: '#c2803a',
    corridor: '#4d3d22',
    light: '#ffcf4a',
  },
  {
    mood: 'sanctuaire astral',
    floor: '#5a3a78',
    joint: '#3f2856',
    wall: '#1d1229',
    wallTop: '#8a63b3',
    corridor: '#4b3066',
    light: '#f0b8ff',
  },
  {
    mood: 'néant',
    floor: '#2c2838',
    joint: '#1c1926',
    wall: '#0a0810',
    wallTop: '#5a5078',
    corridor: '#24202f',
    light: '#b59cff',
  },
  {
    mood: 'trône de l’infini',
    floor: '#6e6034',
    joint: '#4b4122',
    wall: '#1d180b',
    wallTop: '#e0c46a',
    corridor: '#5a4f2b',
    light: '#fff0a8',
  },
];

/** La palette d'un palier (par son rang). Un rang hors table retombe sur la plus proche. */
export function labyTheme(laby: Labyrinth | null | undefined): LabyTheme {
  const i = laby ? labyTierIndex(laby) : 0;
  return LABY_THEMES[Math.max(0, Math.min(LABY_THEMES.length - 1, i))]!;
}

/** Rayon de lumière autour d'une salle, en fraction du pas de grille : une salle VISITÉE est
 *  éclairée en grand (on a posé une torche), une salle seulement VUE (au bout d'un couloir)
 *  ne l'est qu'à peine — assez pour voir la porte, pas ce qu'il y a derrière. */
export const LIGHT = { visited: 0.78, seen: 0.42 } as const;

export function roomLightRadius(cell: number, visited: boolean): number {
  return cell * (visited ? LIGHT.visited : LIGHT.seen);
}
