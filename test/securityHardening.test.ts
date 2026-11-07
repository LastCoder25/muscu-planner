import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

/**
 * 🔒 Garde-fous de la migration 0104 (audit du 2026-10-15). Ce test lit les migrations :
 * il empêche qu'une migration future redéfinisse ces fonctions ou policies en rouvrant la
 * faille (exploit vérifié en base avant correctif : accepter une demande en réécrivant
 * `requester_id` rendait ami d'un tiers).
 */
const all = fs
  .readdirSync('supabase/migrations')
  .sort()
  .map((f) => fs.readFileSync(`supabase/migrations/${f}`, 'utf8'))
  .join('\n');

describe('🔒 durcissement 0104', () => {
  it('les parties d’une amitié sont verrouillées par un trigger', () => {
    expect(all).toMatch(/create trigger friendships_lock_parties before update on public\.friendships/);
    // Aucune migration postérieure ne le retire.
    const after = all.slice(all.lastIndexOf('create trigger friendships_lock_parties'));
    expect(after).not.toMatch(/drop trigger[^;]*friendships_lock_parties/);
  });

  it('les fonctions du boss mondial ne sont plus exécutables par les clients', () => {
    expect(all).toMatch(/'ensure_world_boss', 'hit_world_boss', 'claim_boss_reward'/);
    expect(all).toMatch(/revoke execute on function %s from public, anon, authenticated/);
  });

  it('is_admin repose sur l’identifiant, plus sur l’e-mail', () => {
    const last = all.slice(all.lastIndexOf('function public.is_admin()'));
    expect(last).toMatch(/auth\.uid\(\) =/);
    expect(last.slice(0, 300)).not.toMatch(/auth\.jwt\(\)/);
  });
});
