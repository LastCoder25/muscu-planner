import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveLevelConfig } from '@/lib/levelConfig';
import type { Level } from '@/lib/types';

const NIVEAUX: Level[] = ['debutant', 'intermediaire', 'avance'];

// ⚠️ Chemin ancré sur CE fichier, pas sur le répertoire courant : un `'src'` relatif ne
// vaut que si le lanceur part de la racine — et un test dont le résultat dépend du dossier
// d'où on l'appelle rend une LISTE VIDE plutôt qu'une erreur, donc il passe au vert en ne
// vérifiant plus rien. C'est le mode de panne que ce garde-fou existe pour éviter.
const RACINE_SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

/** Tout `src/`, sauf les deux fichiers qui DÉCLARENT le contrat. */
function fichiersSrc(dir = RACINE_SRC, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) fichiersSrc(p, out);
    else if (/\.(ts|vue)$/.test(e) && !/levelConfig\.ts$|types\.ts$/.test(p)) out.push(p);
  }
  return out;
}

describe('level_config — le contrat ne promet que ce que le code tient', () => {
  // ⚠️ CE TEST EXISTE À CAUSE D'UN VRAI DÉFAUT. `ui_density` et `auto_deload` étaient
  // dérivés, écrits en base et documentés dans le contrat ET dans quatre specs — et lus
  // par PERSONNE. Le brief annonçait « la densité s'adapte au niveau » et « le point
  // UNIQUE où un débutant et un avancé divergent » : en vrai, ils voyaient la même
  // interface. Un champ qu'on calcule sans jamais le lire est une promesse écrite que le
  // code ne tient pas, et rien ne l'attrapait.
  it('CHAQUE champ dérivé est lu quelque part dans src/', () => {
    const champs = Object.keys(deriveLevelConfig('intermediaire'));
    const sources = fichiersSrc().map((f) => readFileSync(f, 'utf8'));
    // ⚠️ Un balayage qui ne trouve rien à balayer passe au vert en ne prouvant rien.
    expect(champs.length, 'le contrat a des champs').toBeGreaterThan(5);
    expect(sources.length, 'on a bien lu src/').toBeGreaterThan(50);
    // MÉTADONNÉES du document stocké en base (colonne `level_config` jsonb) : elles
    // décrivent le DOCUMENT, pas un comportement, donc n'avoir aucun lecteur applicatif
    // est normal — `schema_version` sert à la migration le jour où le contrat bouge.
    // ⚠️ La première rédaction de ce commentaire les disait « lues par une IA externe via
    // l'export `coach_request` ». VÉRIFIÉ : `coach.ts` ne mentionne pas `level_config` une
    // seule fois. Une exemption justifiée par une raison fausse est une exemption qu'on
    // finit par étendre — la moitié du travail d'un garde-fou est de dire le vrai.
    const META = ['schema_version', 'type', 'derived_from'];
    // ⚠️ DETTE ASSUMÉE, et séparée des métadonnées EXPRÈS : `overridable` n'en est pas une.
    // Il annonce « on peut écraser n'importe quel champ ensuite » et AUCUN code ne le
    // permet — la même promesse non tenue que `ui_density` et `auto_deload`, en plus
    // discret. Exempté parce qu'il sort du périmètre du retrait décidé, pas parce qu'il
    // est légitime. À TRANCHER : le brancher (une surcharge de profil) ou le retirer.
    const DETTE = ['overridable'];
    const exempts = [...META, ...DETTE];
    const orphelins = champs.filter(
      (c) => !exempts.includes(c) && !sources.some((s) => s.includes(c)),
    );
    expect(
      orphelins,
      `Champs de LevelConfig que personne ne lit : ${orphelins.join(', ')}. ` +
        'Soit on les branche, soit on les retire du contrat — les laisser, c’est promettre ' +
        'un comportement que le code ne tient pas.',
    ).toEqual([]);
  });

  it('les deux champs retirés ne reviennent pas par la bande', () => {
    for (const n of NIVEAUX) {
      const cfg = deriveLevelConfig(n) as Record<string, unknown>;
      expect(cfg.ui_density, n).toBeUndefined();
      expect(cfg.auto_deload, n).toBeUndefined();
    }
  });

  it('ce qui RESTE est bien différencié par niveau — sinon le contrat ne sert à rien', () => {
    const [deb, inter, av] = NIVEAUX.map((n) => deriveLevelConfig(n));
    // Le signal d'effort : c'est lui qui fait apparaître le RIR chez l'avancé.
    expect(deb!.effort_signal).toBe('simple');
    expect(av!.effort_signal).toBe('rir');
    // La profondeur d'historique que le moteur regarde.
    expect(av!.coach_history_depth).toBeGreaterThan(deb!.coach_history_depth);
    // Le mode de création, qui pilote la bifurcation d'onboarding.
    expect(deb!.program_mode).toBe('guided');
    expect(inter!.program_mode).toBe('assisted');
    expect(av!.program_mode).toBe('free');
    // Et la progression par défaut, lue par le moteur.
    expect(deb!.default_progression).toBe('linear');
    expect(av!.default_progression).toBe('double');
  });
});
