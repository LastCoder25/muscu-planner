// themes.ts — 10 thèmes sombres. Chacun surcharge les variables CSS du design
// system (cf. src/css/app.scss). Les notes d'effort --d1..--d4 restent
// constantes (sémantique vert→rouge) et ne sont pas redéfinies par thème.
export interface Theme {
  id: string;
  name: string;
  vars: Record<string, string>;
}

export const DEFAULT_THEME_ID = 'voltage';

function theme(
  id: string, name: string,
  bg: string, surface: string, surface2: string, surface3: string,
  line: string, lineSoft: string, text: string, dim: string, dim2: string,
  accent: string, accentDeep: string, accentInk: string,
): Theme {
  return {
    id, name,
    vars: {
      '--bg': bg, '--surface': surface, '--surface-2': surface2, '--surface-3': surface3,
      '--line': line, '--line-soft': lineSoft, '--text': text, '--dim': dim, '--dim-2': dim2,
      '--accent': accent, '--accent-deep': accentDeep, '--accent-ink': accentInk,
    },
  };
}

export const THEMES: Theme[] = [
  theme('voltage', 'Voltage', '#15120E', '#211C16', '#2C261E', '#373026', '#3A332A', '#2A241D', '#F3EEE6', '#9A8F7E', '#6F665A', '#FFD23F', '#E6B400', '#1A1605'),
  theme('ember', 'Ember', '#161210', '#221A15', '#2D221B', '#392C22', '#3D3026', '#2A2019', '#F4EDE7', '#A2917F', '#6F6052', '#FF7A45', '#E25B2A', '#1A0E08'),
  theme('mint', 'Mint', '#0F1512', '#18211D', '#1F2C26', '#283930', '#2C3A33', '#1E2A24', '#ECF3EF', '#88A096', '#5C6F66', '#57D996', '#2FB573', '#06160E'),
  theme('ocean', 'Ocean', '#0E1318', '#161E25', '#1D2832', '#263442', '#2A3744', '#1C2630', '#E9F1F6', '#8597A4', '#5A6976', '#46C7D8', '#2AA0B0', '#04141A'),
  theme('grape', 'Grape', '#141017', '#1F1826', '#292031', '#352940', '#382C44', '#271E30', '#F0EAF5', '#998CAA', '#685C78', '#B388FF', '#8E5CF0', '#120A1E'),
  theme('rose', 'Rose', '#171014', '#241921', '#2F222C', '#3B2C37', '#3E2D39', '#2A1E27', '#F5EAF0', '#A88E9C', '#735C68', '#FF6F9C', '#E84B7F', '#1B0810'),
  theme('lime', 'Lime', '#121410', '#1D211A', '#262C22', '#31392B', '#353D2E', '#252A20', '#EFF3E9', '#97A088', '#66705A', '#C6E24A', '#A4C22A', '#14180A'),
  theme('crimson', 'Crimson', '#140F10', '#211719', '#2C2022', '#38292B', '#3B2C2E', '#281D1F', '#F4ECEC', '#A38E8E', '#6F5C5C', '#FF4D6D', '#E22F52', '#1A0708'),
  theme('gold', 'Gold', '#14110B', '#201B12', '#2B2418', '#372E20', '#3A3124', '#29221A', '#F3EEE2', '#A0937C', '#6E6353', '#E6B33C', '#C8961F', '#181206'),
  theme('ice', 'Ice', '#101317', '#1A1E24', '#232932', '#2E3540', '#313945', '#222933', '#ECEFF4', '#909AA8', '#636E7C', '#7AA2FF', '#547FE6', '#0A0F1A'),
];
