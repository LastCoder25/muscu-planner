import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CLIENT_PUSH_KINDS,
  PUSH_GROUPS,
  PUSH_KIND_INFO,
  planPushes,
  pushKindsOf,
  toggleMuted,
  type PushContext,
} from '@/lib/push';

// 🔕 Choisir ses notifications type par type, et rien quand l'app est à l'écran (2026-10-21).

const H = 3_600_000;
const NOW = 1_000_000_000_000;
const ctx: PushContext = {
  base: null,
  expedition: { returnAt: NOW + H, reportId: 'msg_h', reports: true },
  parties: [{ id: 'g1', returnAt: NOW + 2 * H, reportId: 'msg_g', reports: true }],
  watchtowerLevel: 0,
  towerBoost: 0,
  fortSightMs: () => 0,
  activeDays7: 0,
  pacified: false,
  playerLevel: 10,
  plunder: { id: 'p1', at: NOW + 3 * H },
  controls: [{ id: 'c1', attackAt: NOW + 4 * H, label: 'Mine' }],
};

describe('planPushes : une sorte coupée n’est pas programmée', () => {
  it('sans rien de coupé, tout part', () => {
    const kinds = planPushes(ctx, NOW).map((p) => p.kind);
    expect(kinds).toEqual(
      expect.arrayContaining([
        'hero_home',
        'party_home',
        'plunder',
        'control_warn',
        'control_attack',
      ]),
    );
  });
  it('couper « héros rentré » retire ce message et lui seul', () => {
    const all = planPushes(ctx, NOW).map((p) => p.kind);
    const kinds = planPushes(ctx, NOW, ['hero_home']).map((p) => p.kind);
    expect(kinds).not.toContain('hero_home');
    expect(kinds).toEqual(all.filter((k) => k !== 'hero_home'));
  });
});

describe('le catalogue du réglage', () => {
  it('nomme chaque sorte programmée par l’app', () => {
    for (const k of CLIENT_PUSH_KINDS) expect(PUSH_KIND_INFO[k]).toBeDefined();
  });
  it('nomme chaque sorte posée par les déclencheurs en base (boss entre amis)', () => {
    const dir = 'supabase/migrations';
    const sql = readdirSync(dir)
      .map((f) => readFileSync(`${dir}/${f}`, 'utf-8'))
      .join('\n');
    const server = new Set(sql.match(/'fboss_[a-z_]+'/g)?.map((s) => s.slice(1, -1)) ?? []);
    expect(server.size).toBeGreaterThan(0);
    for (const k of server) expect(Object.keys(PUSH_KIND_INFO)).toContain(k);
  });
  it('chaque sorte est rangée dans un groupe affiché', () => {
    const shown = PUSH_GROUPS.flatMap((g) => pushKindsOf(g.id));
    expect(shown.sort()).toEqual(Object.keys(PUSH_KIND_INFO).sort());
  });
});

describe('toggleMuted', () => {
  it('coupe puis rallume', () => {
    expect(toggleMuted([], 'plunder')).toEqual(['plunder']);
    expect(toggleMuted(['plunder', 'siege'], 'plunder')).toEqual(['siege']);
  });
  it('oublie une sorte inconnue (ancienne version) et ne double rien', () => {
    expect(toggleMuted(['vieux_type', 'siege', 'siege'], 'hero_home')).toEqual([
      'hero_home',
      'siege',
    ]);
  });
});

describe('le garde en base (migr. 0110)', () => {
  const sql = readFileSync('supabase/migrations/0110_push_prefs.sql', 'utf-8');
  it('ne bloque jamais le marquage « envoyé » du poussoir', () => {
    expect(sql).toMatch(/new\.sent_at is null and exists/);
  });
  it('lit les préférences d’un autre joueur (déclencheurs du boss) : security definer', () => {
    expect(sql).toMatch(/security definer/);
    expect(sql).toMatch(/before insert or update on public\.scheduled_pushes/);
  });
});

/** Le service worker vit hors du bundle : on le joue avec un faux `self`. */
function runPush(opts: { ua: string; windows: { visibilityState: string }[] }) {
  const src = readFileSync('public/pwa-sw.js', 'utf-8');
  const listeners: Record<string, (e: unknown) => void> = {};
  const shown: string[] = [];
  const self = {
    navigator: { userAgent: opts.ua },
    addEventListener: (t: string, f: (e: unknown) => void) => (listeners[t] = f),
    registration: {
      showNotification: (title: string) => {
        shown.push(title);
        return Promise.resolve();
      },
    },
    clients: { matchAll: () => Promise.resolve(opts.windows) },
  };
  new Function('self', src)(self);
  let done: Promise<unknown> = Promise.resolve();
  listeners.push!({
    data: { json: () => ({ title: 'Héros rentré', url: '/' }) },
    waitUntil: (p: Promise<unknown>) => (done = p),
  });
  return done.then(() => shown);
}

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-F946B) Chrome/129 Mobile';

describe('service worker : rien quand l’app est à l’écran', () => {
  it('app à l’écran → aucune notification', async () => {
    expect(await runPush({ ua: ANDROID, windows: [{ visibilityState: 'visible' }] })).toEqual([]);
  });
  it('app en arrière-plan ou fermée → la notification s’affiche', async () => {
    expect(await runPush({ ua: ANDROID, windows: [{ visibilityState: 'hidden' }] })).toEqual([
      'Héros rentré',
    ]);
    expect(await runPush({ ua: ANDROID, windows: [] })).toEqual(['Héros rentré']);
  });
  it('iPhone : affichée quand même (Safari retire l’abonnement aux push muets)', async () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)';
    expect(await runPush({ ua, windows: [{ visibilityState: 'visible' }] })).toEqual([
      'Héros rentré',
    ]);
  });
});
