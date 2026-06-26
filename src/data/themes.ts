// themes.ts — thèmes sombres ET clairs. Chacun surcharge les variables CSS du
// design system (cf. src/css/app.scss) et bascule le mode Quasar via `dark`.
// Les notes d'effort --d1..--d4 restent constantes (sémantique vert→rouge).
export interface Theme {
  id: string;
  name: string;
  dark: boolean;
  vars: Record<string, string>;
}

export const DEFAULT_THEME_ID = 'voltage';

function theme(
  id: string, name: string, dark: boolean,
  bg: string, surface: string, surface2: string, surface3: string,
  line: string, lineSoft: string, text: string, dim: string, dim2: string,
  accent: string, accentDeep: string, accentInk: string,
): Theme {
  return {
    id, name, dark,
    vars: {
      '--bg': bg, '--surface': surface, '--surface-2': surface2, '--surface-3': surface3,
      '--line': line, '--line-soft': lineSoft, '--text': text, '--dim': dim, '--dim-2': dim2,
      '--accent': accent, '--accent-deep': accentDeep, '--accent-ink': accentInk,
    },
  };
}

export const THEMES: Theme[] = [
  // ── Sombres (fonds distincts) ──
  theme('voltage', 'Voltage', true, '#15120E', '#211C16', '#2C261E', '#373026', '#3A332A', '#2A241D', '#F3EEE6', '#9A8F7E', '#6F665A', '#FFD23F', '#E6B400', '#1A1605'),
  theme('ocean', 'Ocean', true, '#0E1422', '#17223A', '#1F2C46', '#2A3A58', '#2D3C5A', '#1C2740', '#E9F1FA', '#8AA0C0', '#5C7090', '#46C7F0', '#2A9FCC', '#03141F'),
  theme('mint', 'Mint', true, '#0F1512', '#18211D', '#1F2C26', '#283930', '#2C3A33', '#1E2A24', '#ECF3EF', '#88A096', '#5C6F66', '#57D996', '#2FB573', '#06160E'),
  theme('grape', 'Grape', true, '#141017', '#1F1826', '#292031', '#352940', '#382C44', '#271E30', '#F0EAF5', '#998CAA', '#685C78', '#B388FF', '#8E5CF0', '#120A1E'),
  theme('crimson', 'Crimson', true, '#120F10', '#1E1719', '#281E20', '#342729', '#382A2C', '#241B1D', '#F4ECEC', '#A38E8E', '#6F5C5C', '#FF4D6D', '#E22F52', '#1A0708'),
  theme('gold', 'Gold', true, '#14110B', '#201B12', '#2B2418', '#372E20', '#3A3124', '#29221A', '#F3EEE2', '#A0937C', '#6E6353', '#E6B33C', '#C8961F', '#181206'),
  // ── Clairs ──
  theme('paper', 'Paper', false, '#F6F3EC', '#FFFFFF', '#F0EBE1', '#E7E1D3', '#DDD6C8', '#ECE7DB', '#221C14', '#6E655A', '#A29888', '#F0962A', '#CE7A18', '#241406'),
  theme('arctic', 'Arctic', false, '#F1F4F8', '#FFFFFF', '#E9EEF4', '#DCE4EE', '#D2DBE6', '#E7EDF4', '#15202B', '#5B6A79', '#93A1B0', '#17B4C9', '#0E97AA', '#022127'),
  theme('sand', 'Sand', false, '#F5EFE6', '#FFFFFF', '#EFE7DA', '#E6DBC9', '#DDD0BC', '#ECE4D6', '#2A2114', '#756A58', '#A2967F', '#DD6B3C', '#BF5128', '#240D04'),
  theme('blossom', 'Blossom', false, '#F8F0F4', '#FFFFFF', '#F1E6EC', '#E8D8E1', '#E0CED9', '#EFE3EA', '#2A1620', '#7A6470', '#A98E9C', '#EC5C90', '#D43F76', '#2A0814'),
];
