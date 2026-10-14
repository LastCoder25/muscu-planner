import { describe, expect, it } from 'vitest';
import { PROGRESS_RELOAD_MS, progressLoadPlan } from '@/lib/progressLoad';
import fs from 'node:fs';

const T = 1_000_000;

describe('📶 les données de fond se chargent une fois par utilisateur, pas une fois par écran', () => {
  it('premier chargement de l’onglet : on charge, sans forcer', () => {
    expect(progressLoadPlan(undefined, 0, 'u1', T)).toEqual({
      load: true,
      force: false,
      stale: true,
    });
  });
  it('même utilisateur, chargé il y a peu : un nouvel écran ne recharge RIEN', () => {
    expect(progressLoadPlan('u1', T, 'u1', T + 1000).load).toBe(false);
    expect(progressLoadPlan('u1', T, 'u1', T + PROGRESS_RELOAD_MS - 1).load).toBe(false);
  });
  it('au-delà d’un quart d’heure, on rafraîchit (un autre appareil a pu saisir), sans tout invalider', () => {
    expect(progressLoadPlan('u1', T, 'u1', T + PROGRESS_RELOAD_MS)).toEqual({
      load: true,
      force: false,
      stale: false,
    });
  });
  it('connexion après l’écran de login, ou autre compte : on recharge EN FORÇANT', () => {
    expect(progressLoadPlan(null, T, 'u1', T + 1)).toEqual({
      load: true,
      force: true,
      stale: true,
    });
    expect(progressLoadPlan('u1', T, 'u2', T + 1)).toEqual({
      load: true,
      force: true,
      stale: true,
    });
  });
  it('déconnecté : rien à charger, les données ne sont plus valables', () => {
    expect(progressLoadPlan('u1', T, null, T + 1)).toEqual({
      load: false,
      force: false,
      stale: true,
    });
  });
  it('useProgress passe bien par cette règle, avec un état PARTAGÉ hors de la fonction', () => {
    const src = fs.readFileSync('src/composables/useProgress.ts', 'utf8');
    const body = src.slice(src.indexOf('export function useProgress'));
    expect(body).toContain('progressLoadPlan(loadedUid, loadedAt, uid, now)');
    // L'état vit au niveau du MODULE : déclaré dans la fonction, chaque écran repartirait de zéro.
    const head = src.slice(0, src.indexOf('export function useProgress'));
    expect(head).toMatch(/let loadedUid/);
    expect(head).toMatch(/const sharedReady = ref\(false\)/);
  });
});
