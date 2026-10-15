import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import {
  PRIVACY_VERSION,
  RETENTION,
  TO_COMPLETE,
  consentMeta,
  hasConsented,
  legalInfo,
  retentionLines,
} from '@/lib/privacy';
import { EXPORT_TABLES, exportFileName } from '@/lib/privacyExport';

const migrations = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync('supabase/migrations/' + f, 'utf8'));
const allSql = migrations.join('\n');

describe('🔒 RGPD — la page Confidentialité dit ce que le code fait', () => {
  it('mentions légales : « à compléter » plutôt qu’une info inventée', () => {
    expect(legalInfo({})).toEqual({ controller: TO_COMPLETE, contact: TO_COMPLETE });
    expect(legalInfo({ APP_LEGAL_NAME: '  Alban  ', APP_LEGAL_CONTACT: '' })).toEqual({
      controller: 'Alban',
      contact: TO_COMPLETE,
    });
  });

  it('la purge des comptes inactifs applique la durée annoncée', () => {
    const sql = readFileSync('supabase/migrations/0109_rgpd.sql', 'utf8');
    expect(sql).toContain(`purge_inactive_accounts(${RETENTION.inactiveAccountDays})`);
    expect(retentionLines()[0]).toContain(`${RETENTION.inactiveAccountDays / 365} ans`);
  });

  it('les purges techniques appliquent les durées annoncées', () => {
    const sql = readFileSync('supabase/migrations/0084_purge_journaux.sql', 'utf8');
    expect(sql).toContain(`interval '${RETENTION.jobLogDays} days'`);
    expect(sql).toContain(`interval '${RETENTION.sentPushDays} days'`);
  });
});

describe('🔒 RGPD — consentement daté', () => {
  it('à jour seulement avec la version courante ET une date', () => {
    const m = consentMeta(new Date('2026-10-15T10:00:00Z'));
    expect(m).toEqual({ privacy_version: PRIVACY_VERSION, privacy_accepted_at: '2026-10-15T10:00:00.000Z' });
    expect(hasConsented(m)).toBe(true);
    expect(hasConsented({ ...m, privacy_version: PRIVACY_VERSION - 1 })).toBe(false);
    expect(hasConsented({ privacy_version: PRIVACY_VERSION })).toBe(false);
    expect(hasConsented(undefined)).toBe(false);
  });
});

describe('🔒 RGPD — droit d’accès : l’export couvre TOUTES les tables par utilisateur', () => {
  // Chaque table créée avec une référence à auth.users doit être exportée — sinon une donnée
  // collectée échapperait au droit d'accès. On lit les migrations, pas une liste recopiée.
  const tables = new Set<string>();
  for (const m of allSql.matchAll(/create table (?:if not exists )?public\.(\w+)\s*\(([\s\S]*?)\n\);/g))
    if (/auth\.users/.test(m[2]!)) tables.add(m[1]!);
  const dropped = new Set([...allSql.matchAll(/drop table (?:if exists )?public\.(\w+)/g)].map((m) => m[1]!));

  it('la lecture des migrations trouve bien les tables (le test n’est pas creux)', () => {
    expect(tables.size).toBeGreaterThan(15);
    expect(tables.has('body_entries')).toBe(true);
  });

  it('aucune table oubliée', () => {
    const listed = new Set(EXPORT_TABLES.map((t) => t.table));
    const missing = [...tables].filter((t) => !dropped.has(t) && !listed.has(t));
    expect(missing).toEqual([]);
  });

  it('la seule table sans clé étrangère (boss mondial) est exportée ET effacée', () => {
    expect(EXPORT_TABLES.some((t) => t.table === 'boss_contributions')).toBe(true);
    expect(readFileSync('supabase/migrations/0109_rgpd.sql', 'utf8')).toContain(
      'delete from public.boss_contributions where user_id = uid',
    );
  });

  it('nom de fichier daté', () => {
    expect(exportFileName(new Date('2026-10-15T12:00:00Z'))).toBe('muscu-mes-donnees-2026-10-15.json');
  });
});

describe('🔒 RGPD — sécurité des sessions', () => {
  it('changer de mot de passe révoque les autres sessions', () => {
    const src = readFileSync('src/stores/auth.ts', 'utf8');
    const fn = src.slice(src.indexOf('async function updatePassword'));
    expect(fn.slice(0, 400)).toContain("signOut({ scope: 'others' })");
  });
});
