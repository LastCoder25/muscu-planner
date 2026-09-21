/**
 * 🗡️ LE ROSTER DE L'ÉQUIPEMENT DES CHAMPIONS (v0.983 ; demandé par l'utilisateur : « une
 * illustration par item de champion, et un roster d'objets défini, si les gacha font bien
 * ça » — option B retenue).
 *
 * **72 modèles nommés** : 6 lignées × 4 emplacements × **3 lettres (B / A / S)** — la
 * même échelle que les champions (demandé : « les items de champions, comme les champions,
 * ont 3 raretés S/A/B ; les anciennes raretés ne sont plus utilisées »). Le NOM et
 * l'ILLUSTRATION d'une pièce découlent de (lignée, emplacement, lettre) ; ses STATS restent
 * tirées dans le pool de sa lignée (`LINEAGE_GEAR`), × la part de sa lettre.
 *
 * ⚠️ AUCUN IMPORT D'EXÉCUTION : `scripts/fetch-advgear-art.mjs` lit ce fichier directement
 * avec Node (type-stripping). Un import de valeur l'en empêcherait.
 */
import type { AdvGearSlot, Lineage } from '@/lib/advGear';
import type { PullGrade } from '@/data/champions';

/** Ordre d'écriture des noms : B, puis A, puis S. */
const GRADES_ASC: readonly PullGrade[] = ['B', 'A', 'S'];

/**
 * Les noms, dans l'ordre B · A · S. ⚠️ Exhaustif par construction (`Record<Lineage, Record<
 * AdvGearSlot, …>>`) : une lignée ou un emplacement ajouté sans ses trois noms ne compile
 * pas — et le test d'illustrations exige un fichier par modèle.
 */
export const ADV_GEAR_MODEL_NAMES: Record<
  Lineage,
  Record<AdvGearSlot, readonly [string, string, string]>
> = {
  guerrier: {
    weapon: ['Épée courte', 'Épée bâtarde de garde', 'Lame du Serment'],
    armor: ['Cuirasse cabossée', 'Cuirasse d’acier bleui', 'Harnois du Lion d’or'],
    accessory: ['Gantelets de cuir', 'Gantelets à pointes', 'Poings du Colosse'],
    relic: ['Talisman de fer', 'Talisman du vétéran', 'Cœur de braise ancestral'],
  },
  archer: {
    weapon: ['Arc de chasse', 'Arc long en if', 'Arc Sylvelune'],
    armor: ['Veste de cuir', 'Brigandine de pisteur', 'Manteau des Feuilles d’argent'],
    accessory: ['Carquois de toile', 'Carquois ciselé', 'Carquois inépuisable'],
    relic: ['Plume porte-bonheur', 'Plume de faucon royal', 'Plume du Phénix'],
  },
  mage: {
    weapon: ['Bâton noueux', 'Bâton de cristal', 'Sceptre des Astres'],
    armor: ['Robe de novice', 'Robe runique', 'Manteau d’éther'],
    accessory: ['Grimoire écorné', 'Grimoire enchaîné', 'Codex primordial'],
    relic: ['Orbe de verre', 'Orbe d’améthyste', 'Orbe du Néant'],
  },
  homme_armes: {
    weapon: ['Masse de bois ferré', 'Masse d’armes à ailettes', 'Marteau Brise-Rempart'],
    armor: ['Plates rapiécées', 'Plates de garde', 'Armure du Bastion éternel'],
    accessory: ['Bouclier rond', 'Pavois blasonné', 'Égide du Titan'],
    relic: ['Reliquaire de bois', 'Reliquaire d’argent', 'Reliquaire du Saint-Martyr'],
  },
  eclaireur: {
    weapon: ['Dague de pisteur', 'Dagues jumelles', 'Croc de l’Ombre'],
    armor: ['Cape de voyage', 'Cape de nuit', 'Voile de brume'],
    accessory: ['Longue-vue de laiton', 'Longue-vue gravée', 'Œil de l’Horizon'],
    relic: ['Boussole de poche', 'Boussole d’astronome', 'Boussole des Vents perdus'],
  },
  caravanier: {
    weapon: ['Bâton de marche', 'Bâton ferré de guide', 'Bâton du Premier Chemin'],
    armor: ['Manteau de voyage', 'Manteau de marchand doublé', 'Manteau des Mille Routes'],
    accessory: ['Bât de toile', 'Bât renforcé', 'Bât sans fond'],
    relic: ['Lanterne de fer', 'Lanterne de cuivre', 'Lanterne des Étoiles'],
  },
};

/** Id stable d'un modèle — aussi le nom de son fichier d'illustration. */
export function advGearModelId(lineage: Lineage, slot: AdvGearSlot, grade: PullGrade): string {
  return `${lineage}-${slot}-${grade.toLowerCase()}`;
}

/** Le nom du modèle d'une (lignée, emplacement, lettre). */
export function advGearModelName(lineage: Lineage, slot: AdvGearSlot, grade: PullGrade): string {
  return ADV_GEAR_MODEL_NAMES[lineage][slot][GRADES_ASC.indexOf(grade)]!;
}

export interface AdvGearModelDef {
  id: string;
  lineage: Lineage;
  slot: AdvGearSlot;
  grade: PullGrade;
  name: string;
}

/** Le roster complet, à plat (72 entrées) — le catalogue, le script d'images et les tests. */
export const ADV_GEAR_MODELS: readonly AdvGearModelDef[] = (
  Object.entries(ADV_GEAR_MODEL_NAMES) as [Lineage, Record<AdvGearSlot, readonly string[]>][]
).flatMap(([lineage, slots]) =>
  (Object.entries(slots) as [AdvGearSlot, readonly string[]][]).flatMap(([slot, names]) =>
    names.map((name, i) => {
      const grade = GRADES_ASC[i]!;
      return { id: advGearModelId(lineage, slot, grade), lineage, slot, grade, name };
    }),
  ),
);

/** Id de modèle → chemin public de son illustration (`scripts/fetch-advgear-art.mjs`).
 *  ⚠️ Un test exige que CHAQUE modèle ait son fichier : un nom ajouté sans image rougit au
 *  test au lieu de s'afficher cassé en production. */
const MODEL_IDS = new Set(ADV_GEAR_MODELS.map((m) => m.id));

/**
 * Modèles SANS illustration : ils gardent l'emoji de leur emplacement (🏹, 🦯).
 * ⚠️ PAS D'ILLUSTRATION VAUT MIEUX QU'UNE ILLUSTRATION FAUSSE (même règle que les
 * exercices sans animation fidèle) : le générateur dessine systématiquement une PERSONNE qui
 * tient un arc ou un bâton — mesuré sur une dizaine de formulations (posé, debout, fiche de
 * concept, vue à plat). Un arc qui s'affiche en portrait d'archère se lirait comme un bug.
 * Exporté pour que le test exige qu'AUCUN fichier ne traîne pour eux.
 */
export const ADV_GEAR_NO_ART: ReadonlySet<string> = new Set([
  'archer-weapon-b',
  'archer-weapon-a',
  'archer-weapon-s',
  'archer-accessory-a',
  'caravanier-weapon-b',
  'caravanier-weapon-a',
  'caravanier-weapon-s'
]);

export function advGearArt(modelId: string | null | undefined): string | null {
  return modelId && MODEL_IDS.has(modelId) && !ADV_GEAR_NO_ART.has(modelId)
    ? `/advgear/${modelId}.webp`
    : null;
}
