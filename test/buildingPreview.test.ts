import { describe, it, expect } from 'vitest';
import { buildingPreview, nextMilestone, previewNote } from '@/lib/buildingPreview';
import { BUILDING_TYPES } from '@/lib/buildings';

describe('aperçu des prochains niveaux d’un bâtiment', () => {
  it('⚠️ CHAQUE type de bâtiment a un aperçu — un bâtiment muet est une régression', () => {
    for (const t of BUILDING_TYPES) {
      expect(buildingPreview(t.id, 3, 4).length, t.id).toBeGreaterThan(0);
    }
  });

  it('⚠️ les chiffres viennent des FONCTIONS DU JEU, pas d’une formule recopiée', () => {
    // C'est la seule garantie qu'un aperçu ne mente jamais : si l'équilibrage bouge,
    // il suit tout seul. Le projet s'est déjà fait avoir deux fois par une règle dupliquée.
    // 🧭 L'AVANT-POSTE : le trajet du héros et celui des champions (plus de nombre
    // d'équipes : la limite est retirée).
    const ligne = buildingPreview('outpost', 9, 0)[0]!;
    expect(ligne.text).not.toContain('équipe');
    expect(ligne.text, 'le trajet du héros').toMatch(/−\d+ % de trajet/);
    // ⚠️ RÉÉCRIT (v0.962, demandé : « enlève le nombre d'engagés et le temps de forge »).
    // Le Panthéon n'annonce plus que son levier le plus FORT — le niveau maximal d'un
    // champion, qui vaut exactement son propre niveau (`grantAdvXp`) et qui DOMINE la
    // rareté. Le chiffre reste DÉRIVÉ : aucune formule recopiée dans l'aperçu.
    const pan = buildingPreview('pantheon', 8, 0)[0]!;
    expect(pan.text).toContain('8');
    expect(buildingPreview('pantheon', 30, 0)[0]!.text).toContain('30');
  });

  it('Avant-poste : un bonus par pastille, et plus de nombre de lieux', () => {
    const r = buildingPreview('outpost', 9, 0)[0]!;
    expect(r.bits).toHaveLength(2);
    expect(r.bits!.map((b) => b.text).join(' ')).not.toMatch(/en parallèle/);
    expect(r.text).not.toMatch(/lieux|failles/);
    expect(previewNote('outpost')).toMatch(/carte grandit/);
    expect(previewNote('pantheon')).toBeNull();
  });

  it('🧭 l’Avant-poste n’a plus de PALIER : il n’ajoute plus d’équipe', () => {
    expect(buildingPreview('outpost', 8, 12).filter((r) => r.milestone)).toEqual([]);
    expect(nextMilestone('outpost', 10)).toBeNull();
  });

  it('⚠️ l’aperçu commence AU NIVEAU ACTUEL — on compare à ce qu’on a', () => {
    expect(buildingPreview('outpost', 14, 3)[0]!.level).toBe(14);
  });

  it('⚠️ rien à signaler quand le bâtiment n’a pas de palier', () => {
    // La Dynamo n'a que des courbes continues (débit, réserve).
    expect(nextMilestone('energy_font', 10)).toBeNull();
  });

  it('⚠️ chaque PRODUCTEUR annonce son débit ET sa réserve — hybrides compris', () => {
    // Plus d'Entrepôt : c'est le niveau du bâtiment qui règle SA limite max, donc l'aperçu
    // doit la dire aussi pour la Porte (🗝️) et l'Autel (🔮), pas seulement la Dynamo.
    for (const id of ['energy_font', 'labyrinth_gate', 'boss_altar'] as const) {
      const rows = buildingPreview(id, 10, 3);
      expect(rows[0]!.text, id).toContain('réserve');
      expect(rows[1]!.text, id).not.toBe(rows[0]!.text);
    }
  });

  it('ne répète jamais deux fois la même ligne', () => {
    for (const t of BUILDING_TYPES) {
      const rows = buildingPreview(t.id, 5, 8);
      expect(new Set(rows.map((r) => r.text)).size, t.id).toBe(rows.length);
    }
  });
});
