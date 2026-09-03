// Météo — mapping du code WMO (Open-Meteo) vers un emoji + libellé FR. Pur/testable.
// Réf. codes : https://open-meteo.com/en/docs (WMO Weather interpretation codes).

export interface WeatherIcon {
  emoji: string;
  label: string;
}

const WMO_CODES: Record<number, WeatherIcon> = {
  0: { emoji: '☀️', label: 'Ciel dégagé' },
  1: { emoji: '🌤️', label: 'Peu nuageux' },
  2: { emoji: '⛅', label: 'Partiellement nuageux' },
  3: { emoji: '☁️', label: 'Couvert' },
  45: { emoji: '🌫️', label: 'Brouillard' },
  48: { emoji: '🌫️', label: 'Brouillard givrant' },
  51: { emoji: '🌦️', label: 'Bruine légère' },
  53: { emoji: '🌦️', label: 'Bruine' },
  55: { emoji: '🌦️', label: 'Bruine forte' },
  56: { emoji: '🌧️', label: 'Bruine verglaçante' },
  57: { emoji: '🌧️', label: 'Bruine verglaçante forte' },
  61: { emoji: '🌧️', label: 'Pluie légère' },
  63: { emoji: '🌧️', label: 'Pluie' },
  65: { emoji: '🌧️', label: 'Pluie forte' },
  66: { emoji: '🌧️', label: 'Pluie verglaçante' },
  67: { emoji: '🌧️', label: 'Pluie verglaçante forte' },
  71: { emoji: '🌨️', label: 'Neige légère' },
  73: { emoji: '🌨️', label: 'Neige' },
  75: { emoji: '🌨️', label: 'Neige forte' },
  77: { emoji: '🌨️', label: 'Grains de neige' },
  80: { emoji: '🌦️', label: 'Averses légères' },
  81: { emoji: '🌦️', label: 'Averses' },
  82: { emoji: '⛈️', label: 'Averses violentes' },
  85: { emoji: '🌨️', label: 'Averses de neige' },
  86: { emoji: '🌨️', label: 'Averses de neige fortes' },
  95: { emoji: '⛈️', label: 'Orage' },
  96: { emoji: '⛈️', label: 'Orage avec grêle' },
  99: { emoji: '⛈️', label: 'Orage avec grêle fort' },
};

/** Icône + libellé FR pour un code WMO. Code inconnu → repli neutre. */
export function weatherIcon(code: number): WeatherIcon {
  return WMO_CODES[code] ?? { emoji: '🌡️', label: 'Météo' };
}
