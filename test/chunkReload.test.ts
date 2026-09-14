import { describe, it, expect } from 'vitest';
import {
  CHUNK_RELOAD_WINDOW_MS,
  chunkReloadUrl,
  isChunkError,
  mayReloadForChunk,
} from '@/lib/chunkReload';
import { hasPreviousEntry } from '@/lib/nav';

describe('récupération d’un chunk périmé (redéploiement)', () => {
  it('reconnaît les imports dynamiques ratés des trois navigateurs', () => {
    expect(isChunkError('Failed to fetch dynamically imported module: https://x/assets/A.js')).toBe(
      true,
    );
    expect(isChunkError('error loading dynamically imported module')).toBe(true);
    expect(isChunkError('Importing a module script failed.')).toBe(true);
    expect(isChunkError('Cannot read properties of undefined')).toBe(false);
  });

  it('⚠️ LE CAS RÉEL : en mode hash, on recharge vers la ROUTE, pas vers un chemin', () => {
    // L’ancienne récupération faisait location.assign('/stats') : on atterrissait sur
    // « /stats#/ », donc sur l’accueil, jamais sur l’écran demandé.
    expect(chunkReloadUrl('https://app.test/#/aventure', '#/stats')).toBe(
      'https://app.test/#/stats',
    );
    expect(chunkReloadUrl('https://app.test/?x=1#/a', '#/b?tab=base')).toBe(
      'https://app.test/?x=1#/b?tab=base',
    );
    expect(chunkReloadUrl('https://app.test/', '#/login')).toBe('https://app.test/#/login');
  });

  it('en mode history, la route est un chemin complet', () => {
    expect(chunkReloadUrl('https://app.test/aventure', '/stats')).toBe('https://app.test/stats');
  });

  it('le garde anti-boucle refuse une seconde tentative immédiate', () => {
    const now = 1_000_000;
    expect(mayReloadForChunk(null, now)).toBe(true);
    expect(mayReloadForChunk(String(now - 1000), now)).toBe(false);
    expect(mayReloadForChunk(String(now - CHUNK_RELOAD_WINDOW_MS + 1), now)).toBe(false);
  });

  it('⚠️ …mais il s’éteint seul : un garde collé laissait la navigation MORTE jusqu’au rafraîchissement', () => {
    const now = 1_000_000;
    expect(mayReloadForChunk(String(now - CHUNK_RELOAD_WINDOW_MS), now)).toBe(true);
    expect(mayReloadForChunk(String(now - 3_600_000), now)).toBe(true);
    // L’ancien garde valait « 1 » : illisible comme horodatage, il ne doit rien bloquer.
    expect(mayReloadForChunk('1', now)).toBe(true);
    expect(mayReloadForChunk('pas un nombre', now)).toBe(true);
    // Horloge reculée : on ne reste pas bloqué pour toujours.
    expect(mayReloadForChunk(String(now + 60_000), now)).toBe(true);
  });
});

describe('retour arrière avec repli', () => {
  it('sans entrée précédente (lien, notification, PWA), il faut un repli', () => {
    expect(hasPreviousEntry(null)).toBe(false);
    expect(hasPreviousEntry(undefined)).toBe(false);
    expect(hasPreviousEntry('')).toBe(false);
    expect(hasPreviousEntry('/challenges')).toBe(true);
    expect(hasPreviousEntry('/')).toBe(true);
  });
});
