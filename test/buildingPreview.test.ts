import { describe, it, expect } from 'vitest';
import { buildingPreview, nextMilestone, previewNote } from '@/lib/buildingPreview';
import { BUILDING_TYPES } from '@/lib/buildings';
import { caravanSlots } from '@/lib/caravan';

describe('aperçu des prochains niveaux d’un bâtiment', () => {
  it('⚠️ CHAQUE type de bâtiment a un aperçu — un bâtiment muet est une régression', () => {
    for (const t of BUILDING_TYPES) {
      expect(buildingPreview(t.id, 3, 4).length, t.id).toBeGreaterThan(0);
    }
  });

  it('⚠️ les chiffres viennent des FONCTIONS DU JEU, pas d’une formule recopiée', () => {
    // C'est la seule garantie qu'un aperçu ne mente jamais : si l'équilibrage bouge,
    // il suit tout seul. Le projet s'est déjà fait avoir deux fois par une règle dupliquée.
    // ⚠️ LES TROIS LEVIERS DE L'AVANT-POSTE, qui a absorbé le Comptoir de caravanes : le
    // trajet du héros, la vitesse d'un convoi et leur nombre. N'en annoncer qu'un
    // laisserait croire que les deux autres tiers du bâtiment sont figés.
    const l = 9;
    const ligne = buildingPreview('outpost', l, 0)[0]!;
    expect(ligne.text).toContain(String(caravanSlots(l)));
    expect(ligne.text).toContain('équipe');
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
    expect(r.bits).toHaveLength(3);
    // Le nombre d'expéditions a sa propre couleur : une seule pastille le porte.
    expect(r.bits!.filter((b) => b.tone === 'teams').map((b) => b.text)).toEqual([
      `${caravanSlots(9)} équipe${caravanSlots(9) > 1 ? 's' : ''} en parallèle`,
    ]);
    expect(r.text).not.toMatch(/lieux|failles/);
    expect(previewNote('outpost')).toMatch(/carte grandit/);
    expect(previewNote('pantheon')).toBeNull();
  });

  it('marque les PALIERS, et eux seuls', () => {
    // Un convoi de plus tous les 9 niveaux : 9, 18, 27… et rien entre les deux.
    const rows = buildingPreview('outpost', 8, 12);
    const paliers = rows.filter((r) => r.milestone).map((r) => r.level);
    expect(paliers).toEqual([9, 18]);
  });

  it('⚠️ l’aperçu commence AU NIVEAU ACTUEL — on compare à ce qu’on a', () => {
    expect(buildingPreview('outpost', 14, 3)[0]!.level).toBe(14);
  });

  it('⚠️ annonce le prochain PALIER même s’il est hors de l’aperçu', () => {
    // Sans ça, un Avant-poste niveau 10 montre six lignes de vitesse et laisse croire que
    // le convoi suivant n'arrivera jamais.
    const m = nextMilestone('outpost', 10)!;
    expect(m.level).toBe(18);
    expect(m.text).toContain(String(caravanSlots(18)));
    // …et rien à signaler quand le bâtiment n'a pas de palier : la Dynamo n'a que des
    // courbes continues (débit, réserve).
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
